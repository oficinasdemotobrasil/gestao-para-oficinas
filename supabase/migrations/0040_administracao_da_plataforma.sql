-- 0040 — Quem administra a plataforma
--
-- A decisão da Fase 4 foi a opção A: a administração da plataforma é um
-- aplicativo SEPARADO. Este app não ganha perfil, rota nem condição que enxergue
-- outra oficina — e é por isso que o teste de isolamento continua valendo sem
-- exceção para ninguém.
--
-- O que entra aqui é só o mínimo que precisa morar no banco: a lista de quem
-- pode operar a plataforma.
--
-- Quem está nesta lista NÃO tem linha em `usuarios`. Isso não é detalhe: sem
-- linha em `usuarios`, `oficina_do_usuario()` devolve nulo, e todas as políticas
-- do app devolvem vazio. O administrador da plataforma que abrir o aplicativo do
-- cliente por engano não vê absolutamente nada — não porque a tela esconde, mas
-- porque não existe oficina dele.

create table if not exists public.admins_plataforma (
  -- O id da conta de autenticação, e nada mais. Nome e e-mail já vivem no auth.
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now(),
  -- Anotação de quem é essa pessoa, para a lista não virar uma coluna de uuids.
  observacao text
);

alter table public.admins_plataforma enable row level security;

-- Política que nega tudo, de propósito.
--
-- Esta tabela não é lida pelo aplicativo: quem a consulta é a Edge Function da
-- plataforma, com a service_role, que não passa por RLS. A política existe
-- porque uma tabela com RLS e nenhuma política também nega tudo — mas em
-- silêncio, e quem ler as políticas amanhã não saberia dizer se foi decisão ou
-- esquecimento.
create policy "ninguem le a lista de administradores da plataforma"
  on public.admins_plataforma for all to authenticated
  using (false)
  with check (false);

comment on table public.admins_plataforma is
  'Contas que operam o painel da plataforma. Elas não têm linha em usuarios, então não enxergam nenhuma oficina pelo aplicativo do cliente.';

-- A fechadura precisa saber que esta tabela é de plataforma ------------------
-- A verificação da 0014 exige oficina_id em toda tabela, porque toda tabela de
-- negócio pertence a uma oficina. Esta não pertence a nenhuma — ela está acima
-- delas. A exceção fica escrita e nomeada, e não como um "menos esta aqui"
-- solto: se amanhã alguém criar outra tabela sem oficina_id por descuido, a
-- verificação continua pegando.
create or replace function public.conferir_fechadura()
returns void
language plpgsql
as $$
declare
  pendentes text;
  -- Tabelas que não pertencem a uma oficina: a de oficinas, e a de quem
  -- administra a plataforma.
  fora_do_tenant text[] := array['oficinas', 'admins_plataforma'];
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
