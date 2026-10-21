-- 0085 — Funções fechadas para quem não entrou
--
-- A auditoria de 21/10/2026 (conferida no banco real) achou 27 funções
-- `security definer` que o visitante anônimo — qualquer um na internet, com a
-- chave pública do site — conseguia chamar. O Postgres dá EXECUTE a todo mundo
-- (PUBLIC) em toda função nova, e o Supabase ainda concede ao anon; só as
-- funções que tinham `revoke ... from public, anon` estavam fechadas.
--
-- Vinte e cinco delas conferem quem chama e não entregam nada a quem não
-- entrou. Duas não: `tempo_da_os` mostrava o tempo e o NOME DO MECÂNICO de
-- qualquer OS, e `situacao_da_oficina`, se qualquer oficina estava ativa —
-- bastava ter o id. O risco prático era pequeno (id não se adivinha), mas a
-- classe era o problema: a próxima função que esquecesse de conferir nasceria
-- aberta para a internet.
--
-- Sem trauma para quem usa: quem já podia chamar uma função LOGADO
-- (authenticated) ou pelo servidor (service_role) continua podendo — a
-- concessão passa a ser explícita antes de a de PUBLIC sair. Só o anônimo
-- perde o acesso, e o anônimo não usa nada disso: antes do login o site chama
-- só as três funções de preço, que continuam abertas.
--
-- E de quebra: as funções sem "caminho de busca" fixo (alerta 0011 do
-- Supabase) ganham um. As que rodam como dono do banco já tinham (teste da
-- validar-banco); estas são as comuns.

-- 1. Quem já podia, continua podendo; o anônimo e PUBLIC saem --------------
do $$
declare
  f record;
begin
  for f in
    select p.oid, p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and pg_get_userbyid(p.proowner) = current_user
       and not exists (
         select 1 from pg_depend d
          where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
       )
  loop
    if has_function_privilege('authenticated', f.oid, 'execute') then
      execute format('grant execute on function %s to authenticated', f.assinatura);
    end if;
    if has_function_privilege('service_role', f.oid, 'execute') then
      execute format('grant execute on function %s to service_role', f.assinatura);
    end if;
    execute format('revoke execute on function %s from public, anon', f.assinatura);
  end loop;
end;
$$;

-- 2. As três que a página de vendas usa antes do login ----------------------
grant execute on function public.vagas_vitalicias_restantes() to anon;
grant execute on function public.simular_parcelas(text) to anon;
grant execute on function public.valor_parcelado(numeric, integer) to anon;

-- 3. Função nova já nasce fechada para o anônimo ----------------------------
-- E aberta, explicitamente, para quem entrou e para o servidor — assim o
-- comportamento de amanhã não depende do padrão que o Supabase escolher.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public grant execute on functions to authenticated, service_role;

-- 4. tempo_da_os: só da própria oficina -------------------------------------
-- Mesma conta de antes; o `where` no fim é a única mudança. Para a OS de
-- outra oficina (ou sem login), a função devolve nada — e a tela já trata
-- "nada" como relógio zerado.
create or replace function public.tempo_da_os(p_ordem_servico_id uuid)
returns table (
  minutos_registrados integer,
  rodando_desde timestamptz,
  quem_esta_com_ela text,
  minutos_estimados integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((
      select sum(a.duracao_minutos)::integer
      from public.apontamentos_tempo a
      where a.ordem_servico_id = p_ordem_servico_id and a.fim is not null
    ), 0),
    (select a.inicio from public.apontamentos_tempo a
      where a.ordem_servico_id = p_ordem_servico_id and a.fim is null
      order by a.inicio limit 1),
    (select u.nome from public.apontamentos_tempo a
       join public.usuarios u on u.id = a.mecanico_id
      where a.ordem_servico_id = p_ordem_servico_id and a.fim is null
      order by a.inicio limit 1),
    coalesce((
      select sum(s.tempo_estimado_minutos * i.quantidade)::integer
      from public.os_itens i
      join public.servicos s on s.id = i.servico_id
      where i.ordem_servico_id = p_ordem_servico_id
        and i.tipo = 'servico'
        and s.tempo_estimado_minutos is not null
    ), 0)
  where exists (
    select 1 from public.ordens_servico o
     where o.id = p_ordem_servico_id
       and o.oficina_id = public.oficina_do_usuario()
  );
$$;

-- 5. Caminho de busca fixo nas funções que não tinham -----------------------
-- `extensions` vai junto porque é onde o Supabase instala as extensões; hoje
-- nenhuma função usa nada de lá sem o nome do schema, mas assim nenhuma quebra
-- se um dia usar.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and pg_get_userbyid(p.proowner) = current_user
       and not exists (
         select 1 from pg_depend d
          where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
       )
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) as c where c like 'search_path=%'
       )
  loop
    execute format('alter function %s set search_path = public, extensions', f.assinatura);
  end loop;
end;
$$;

-- 6. A fechadura passa a conferir isto também -------------------------------
-- Toda migração termina chamando a fechadura. Se uma função que roda como dono
-- do banco voltar a ficar alcançável por quem não entrou, a migração para
-- ali — em vez de a porta ficar aberta em silêncio.
create or replace function public.conferir_fechadura()
returns void
language plpgsql
set search_path = public, extensions
as $$
declare
  pendentes text;
  fora_do_tenant text[] := array['oficinas', 'admins_plataforma', 'planos', 'precos', 'taxas_cartao'];
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
