-- 0042 — Os planos saem do código e viram tabela
--
-- Até aqui, o que cada plano permite estava escrito dentro de duas funções
-- (migration 0039). Trocar um preço ou soltar um limite exigia migration, e o
-- preço nem existia em lugar nenhum.
--
-- A chave primária é o próprio enum `plano_oficina`. Assim é impossível a
-- tabela e a coluna `oficinas.plano` discordarem: não há plano na tabela que a
-- coluna não aceite, nem valor na coluna sem linha aqui. Um plano novo continua
-- exigindo migration — mas migration de enum, que é o que já fazemos.
--
-- O que NÃO muda aqui: quem está em cada plano, e o que cada plano permite
-- hoje. Os valores semeados abaixo são exatamente os que estavam nas funções.

create table if not exists public.planos (
  id public.plano_oficina primary key,
  nome text not null,
  descricao text,
  preco_mensal numeric(10, 2) not null default 0 check (preco_mensal >= 0),
  -- Nulo é sem limite, nos dois.
  limite_colaboradores integer check (limite_colaboradores is null or limite_colaboradores > 0),
  limite_os_mes integer check (limite_os_mes is null or limite_os_mes > 0),
  tem_financeiro boolean not null default false,
  -- Ordem de exibição na tela de planos, do mais simples ao mais completo.
  ordem integer not null default 0,
  -- Plano fora de linha continua valendo para quem já está nele, mas some da
  -- vitrine. Sem isto, mudar de oferta obrigaria a mexer em quem já assinou.
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

comment on table public.planos is
  'O que cada plano permite e quanto custa. Editável pela plataforma, sem migration.';
comment on column public.planos.limite_colaboradores is
  'Quantas pessoas com acesso. Nulo é sem limite.';
comment on column public.planos.ativo is
  'Falso tira da vitrine sem mexer em quem já está no plano.';

insert into public.planos (id, nome, descricao, preco_mensal, limite_colaboradores, limite_os_mes, tem_financeiro, ordem)
values
  ('gratuito',  'Gratuito',  'Para conhecer o sistema.',                    0, 2,    null, false, 1),
  ('essencial', 'Essencial', 'A oficina inteira, sem o controle de caixa.', 0, 5,    null, false, 2),
  ('completo',  'Completo',  'Tudo, incluindo o financeiro.',               0, null, null, true,  3)
on conflict (id) do nothing;

-- Leitura ---------------------------------------------------------------------
-- Todo mundo autenticado lê os planos: a tela de "minha assinatura" precisa
-- mostrar o que existe. Não há segredo em preço de tabela.
alter table public.planos enable row level security;

drop policy if exists "planos sao visiveis" on public.planos;
create policy "planos sao visiveis"
  on public.planos for select to authenticated
  using (true);

-- Sem política de escrita: mudar plano é operação de plataforma, feita pela
-- service_role, como criar e encerrar oficina.

-- As funções passam a ler a tabela ---------------------------------------------
-- Deixam de ser `immutable`: agora dependem de dados, e um plano pode mudar de
-- limite sem o banco precisar ser reiniciado.
create or replace function public.limite_de_colaboradores(p_plano public.plano_oficina)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select limite_colaboradores from public.planos where id = p_plano;
$$;

comment on function public.limite_de_colaboradores is
  'Quantas pessoas com acesso o plano permite. Nulo é sem limite. Vem da tabela planos.';

create or replace function public.plano_tem_financeiro(p_plano public.plano_oficina)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select tem_financeiro from public.planos where id = p_plano), false);
$$;

comment on function public.plano_tem_financeiro is
  'Se o plano abre o financeiro. Vem da tabela planos.';

-- A trava do projeto exige oficina_id em toda tabela, e ela está certa: dado de
-- negócio pertence a uma oficina. `planos` é catálogo — a mesma lista para
-- todo mundo, acima das oficinas, como `oficinas` e `admins_plataforma`. A
-- exceção entra nomeada, e não como um "menos esta aqui" solto.
create or replace function public.conferir_fechadura()
returns void
language plpgsql
as $$
declare
  pendentes text;
  fora_do_tenant text[] := array['oficinas', 'admins_plataforma', 'planos'];
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
end;
$$;

select public.conferir_fechadura();
