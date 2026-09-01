-- Stub do ambiente Supabase para validar as migrations em um Postgres local.
-- NÃO faz parte do banco de produção: no Supabase real tudo isto já existe.
-- Serve só para que scripts/validar-banco.ts consiga rodar as migrations e
-- exercitar o RLS sem depender de Docker ou de um projeto criado.

create schema if not exists auth;
create schema if not exists extensions;

-- Papéis que o PostgREST usa. As políticas são escritas "to authenticated".
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  criado_em timestamptz not null default now()
);

-- No Supabase, auth.uid() lê o "sub" do JWT da requisição. Aqui lemos a mesma
-- variável de sessão, o que permite "logar" como um usuário no teste.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

-- O PostgREST concede os privilégios de tabela; o RLS é que faz o recorte.
-- Reproduzimos isso aqui para que o teste falhe por política, e não por GRANT.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
