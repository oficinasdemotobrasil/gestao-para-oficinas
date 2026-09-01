-- 0009 — RLS do núcleo: oficinas e usuários
--
-- Regra do projeto: o frontend filtra por conveniência, o banco filtra por
-- segurança. Toda política abaixo compara oficina_id com public.oficina_do_usuario().
--
-- Não usamos 'force row level security': o dono das tabelas é o postgres e a view
-- vw_produtos (migration 0012) depende justamente de rodar como dono para
-- entregar ao vendedor o catálogo sem a coluna de custo.

alter table public.oficinas enable row level security;
alter table public.usuarios enable row level security;

-- Oficinas ------------------------------------------------------------------
-- Cada usuário enxerga uma linha só: a própria oficina.
create policy "oficina propria e visivel"
  on public.oficinas for select to authenticated
  using (id = public.oficina_do_usuario());

-- Configurações da oficina são exclusivas do admin (escopo, item 9).
create policy "admin edita a propria oficina"
  on public.oficinas for update to authenticated
  using (id = public.oficina_do_usuario() and public.eh_admin())
  with check (id = public.oficina_do_usuario() and public.eh_admin());

-- Sem política de insert ou delete: criar e encerrar oficina é operação de
-- plataforma, feita pela service_role fora do aplicativo.

-- Usuários ------------------------------------------------------------------
-- O mecânico não navega pela equipe; enxerga apenas o próprio cadastro.
create policy "equipe visivel na propria oficina"
  on public.usuarios for select to authenticated
  using (
    id = auth.uid()
    or (oficina_id = public.oficina_do_usuario() and not public.eh_mecanico())
  );

-- Na prática o colaborador é criado pela Edge Function criar-colaborador, que
-- usa a service_role. Esta política existe para o caso de inserção pelo próprio
-- admin autenticado e mantém a regra explícita no banco.
create policy "admin cadastra colaborador"
  on public.usuarios for insert to authenticated
  with check (oficina_id = public.oficina_do_usuario() and public.eh_admin());

create policy "admin edita colaborador e cada um edita a si"
  on public.usuarios for update to authenticated
  using (
    (oficina_id = public.oficina_do_usuario() and public.eh_admin())
    or id = auth.uid()
  )
  with check (
    (oficina_id = public.oficina_do_usuario() and public.eh_admin())
    or id = auth.uid()
  );

-- Sem política de delete: colaborador que sai é desativado, não apagado, senão
-- o histórico de quem fez cada serviço se perde.

-- Trava contra escalada de privilégio ---------------------------------------
-- A política de update acima deixa cada um editar a própria linha (nome,
-- telefone). Sem esta trava, o mesmo caminho permitiria a um vendedor trocar
-- o próprio perfil para admin, ou mudar de oficina, com um único PATCH.
create or replace function public.impedir_escalada_de_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.eh_admin() then
    if new.perfil is distinct from old.perfil
      or new.oficina_id is distinct from old.oficina_id
      or new.ativo is distinct from old.ativo
    then
      raise exception 'Somente o administrador pode alterar perfil, oficina ou situação de um colaborador.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Nem o admin muda um colaborador de oficina: isso levaria dados de uma
  -- oficina para outra sem deixar rastro.
  if new.oficina_id is distinct from old.oficina_id then
    raise exception 'Não é possível mover um colaborador para outra oficina.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger usuarios_impedir_escalada
  before update on public.usuarios
  for each row execute function public.impedir_escalada_de_perfil();

-- A oficina nunca pode ficar sem administrador ativo, senão ninguém mais entra
-- nas configurações nem cadastra colaborador.
create or replace function public.garantir_admin_ativo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  restantes integer;
begin
  if old.perfil = 'admin' and old.ativo
     and (new.perfil is distinct from 'admin' or not new.ativo)
  then
    select count(*) into restantes
    from public.usuarios
    where oficina_id = old.oficina_id
      and perfil = 'admin'
      and ativo
      and id <> old.id;

    if restantes = 0 then
      raise exception 'A oficina precisa de pelo menos um administrador ativo.'
        using errcode = 'restrict_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger usuarios_garantir_admin_ativo
  before update on public.usuarios
  for each row execute function public.garantir_admin_ativo();
