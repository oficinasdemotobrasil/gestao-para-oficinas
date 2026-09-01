-- 0002 — Funções auxiliares de multi-tenant e perfil
--
-- Estas funções são a base de TODA política de RLS do sistema.
--
-- Por que 'security definer': elas leem public.usuarios, que também tem RLS.
-- Sem 'security definer' a política de usuarios chamaria uma função que lê
-- usuarios, que dispara a política de novo — recursão infinita e erro em toda
-- consulta. Rodando como dono, a função enxerga a tabela sem passar pelo RLS.
--
-- Por que 'set search_path = public': sem isso, um schema malicioso no caminho
-- de busca poderia sequestrar o nome da tabela dentro de uma função privilegiada.
--
-- Por que 'stable': o resultado não muda dentro da mesma consulta, então o
-- Postgres chama uma vez e reaproveita, em vez de uma vez por linha lida.

-- Oficina do usuário logado. É o valor comparado em cada política do sistema.
-- Usuário desativado devolve null e, por consequência, não enxerga linha nenhuma.
create or replace function public.oficina_do_usuario()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select oficina_id
  from public.usuarios
  where id = auth.uid()
    and ativo
$$;

create or replace function public.perfil_do_usuario()
returns public.perfil_usuario
language sql
stable
security definer
set search_path = public
as $$
  select perfil
  from public.usuarios
  where id = auth.uid()
    and ativo
$$;

create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.perfil_do_usuario() = 'admin', false)
$$;

create or replace function public.eh_vendedor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.perfil_do_usuario() = 'vendedor', false)
$$;

create or replace function public.eh_mecanico()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.perfil_do_usuario() = 'mecanico', false)
$$;

-- Quem opera o balcão: cadastra cliente, moto e (na Fase 2) orçamento.
create or replace function public.eh_atendimento()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.perfil_do_usuario() in ('admin', 'vendedor'), false)
$$;

revoke all on function public.oficina_do_usuario() from public, anon;
revoke all on function public.perfil_do_usuario() from public, anon;
revoke all on function public.eh_admin() from public, anon;
revoke all on function public.eh_vendedor() from public, anon;
revoke all on function public.eh_mecanico() from public, anon;
revoke all on function public.eh_atendimento() from public, anon;

grant execute on function public.oficina_do_usuario() to authenticated;
grant execute on function public.perfil_do_usuario() to authenticated;
grant execute on function public.eh_admin() to authenticated;
grant execute on function public.eh_vendedor() to authenticated;
grant execute on function public.eh_mecanico() to authenticated;
grant execute on function public.eh_atendimento() to authenticated;
