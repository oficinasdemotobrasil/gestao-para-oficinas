-- 0014 — Fechadura final e verificação automática
--
-- "Nenhuma tabela sem RLS" é critério de aceite da Fase 1. Deixar isso na mão
-- de conferência manual significa que, na décima tabela nova, alguém esquece.
-- Aqui vira migration: se sobrar uma tabela sem RLS ou sem política, o deploy
-- para com erro em vez de subir um vazamento.

-- Ninguém sem login toca em nada. O aplicativo inteiro exige sessão.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;

do $$
declare
  pendentes text;
begin
  -- 1. Toda tabela de public precisa ter RLS ligado.
  select string_agg(c.relname, ', ' order by c.relname)
  into pendentes
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if pendentes is not null then
    raise exception 'Tabelas sem RLS ativado: %', pendentes;
  end if;

  -- 2. RLS ligado sem nenhuma política nega tudo em silêncio — o que também é
  --    um defeito: significa uma tabela que ninguém consegue usar.
  select string_agg(c.relname, ', ' order by c.relname)
  into pendentes
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

  if pendentes is not null then
    raise exception 'Tabelas com RLS mas sem nenhuma política: %', pendentes;
  end if;

  -- 3. Toda tabela de negócio precisa da coluna de tenant.
  select string_agg(c.relname, ', ' order by c.relname)
  into pendentes
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname not in ('oficinas')
    and not exists (
      select 1 from pg_attribute a
      where a.attrelid = c.oid
        and a.attname = 'oficina_id'
        and not a.attisdropped
    );

  if pendentes is not null then
    raise exception 'Tabelas sem coluna oficina_id: %', pendentes;
  end if;

  raise notice 'Verificação de RLS concluída: todas as tabelas protegidas.';
end $$;
