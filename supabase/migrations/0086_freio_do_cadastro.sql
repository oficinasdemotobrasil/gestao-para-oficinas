-- 0086 — Freio de tentativas no cadastro pela internet
--
-- A auditoria de 21/10/2026 achou o cadastro público sem limite: a função
-- "cadastro" usa a chave de serviço, que passa por cima dos limites do próprio
-- Supabase, então um robô poderia criar centenas de oficinas falsas e gastar a
-- cota de e-mails de boas-vindas.
--
-- Esta tabela é o caderno do freio: cada tentativa que passa da validação vira
-- uma linha, e a função recusa quando a mesma conexão tenta 10 vezes numa hora
-- (ou o sistema inteiro recebe 60). O endereço de internet NÃO é guardado — só
-- um resumo (hash) que serve para contar, e não para identificar ninguém. A
-- própria função apaga o que tem mais de um dia.
--
-- Ninguém do app lê nem escreve aqui; só a função, com a chave de serviço. A
-- tabela não tem oficina_id porque a tentativa acontece antes de a oficina
-- existir — por isso ela entra na lista de exceções da fechadura.

create table if not exists public.tentativas_de_cadastro (
  id bigint generated always as identity primary key,
  conexao text not null,
  criado_em timestamptz not null default now()
);

comment on table public.tentativas_de_cadastro is
  'Freio do cadastro pela internet (0086): um resumo da conexão por tentativa. Só a função "cadastro" usa; apaga depois de um dia.';

create index if not exists tentativas_de_cadastro_conexao_quando
  on public.tentativas_de_cadastro (conexao, criado_em);
create index if not exists tentativas_de_cadastro_quando
  on public.tentativas_de_cadastro (criado_em);

alter table public.tentativas_de_cadastro enable row level security;
drop policy if exists "ninguem do app alcanca as tentativas" on public.tentativas_de_cadastro;
create policy "ninguem do app alcanca as tentativas"
  on public.tentativas_de_cadastro for all to anon, authenticated
  using (false) with check (false);

revoke all on public.tentativas_de_cadastro from public, anon, authenticated;
grant select, insert, delete on public.tentativas_de_cadastro to service_role;

-- A fechadura aceita esta tabela sem oficina_id ------------------------------
create or replace function public.conferir_fechadura()
returns void
language plpgsql
set search_path = public, extensions
as $$
declare
  pendentes text;
  fora_do_tenant text[] := array['oficinas', 'admins_plataforma', 'planos', 'precos', 'taxas_cartao',
                                 'tentativas_de_cadastro'];
  abertas_ao_anonimo text[] := array['vagas_vitalicias_restantes', 'simular_parcelas', 'valor_parcelado'];
begin
  select string_agg(c.relname, ', ' order by c.relname) into pendentes
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if pendentes is not null then
    raise exception 'Tabelas sem RLS ativado: %', pendentes;
  end if;

  select string_agg(c.relname, ', ' order by c.relname) into pendentes
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid);
  if pendentes is not null then
    raise exception 'Tabelas com RLS mas sem nenhuma política: %', pendentes;
  end if;

  select string_agg(c.relname, ', ' order by c.relname) into pendentes
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not (c.relname = any(fora_do_tenant))
    and not exists (
      select 1 from pg_attribute a
      where a.attrelid = c.oid and a.attname = 'oficina_id' and not a.attisdropped
    );
  if pendentes is not null then
    raise exception 'Tabelas sem coluna oficina_id: %', pendentes;
  end if;

  select string_agg(p.proname, ', ' order by p.proname) into pendentes
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and p.prorettype <> 'trigger'::regtype
    and not (p.proname = any(abertas_ao_anonimo))
    and has_function_privilege('anon', p.oid, 'execute');
  if pendentes is not null then
    raise exception 'Funções que rodam como dono do banco abertas a quem não entrou: %', pendentes;
  end if;
end;
$$;

revoke execute on function public.conferir_fechadura() from public, anon;

select public.conferir_fechadura();
