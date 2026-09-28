-- 0076 — A marcação de suporte também é protegida no cadastro
--
-- A trava da 0074 vigia o UPDATE, e o gatilho só roda no UPDATE. Sobrou a porta
-- do INSERT: o admin de uma oficina pode cadastrar colaborador na oficina dele
-- (política "admin cadastra colaborador", 0009) e podia marcá-lo como
-- `de_suporte` já na criação. O que isso daria a ele:
--
-- * a pessoa não apareceria na lista da equipe, porque a política de leitura
--   esconde contas de suporte — colaborador invisível dentro da própria oficina;
-- * e não contaria no limite do plano, porque o gatilho de limite dispensa
--   contas de suporte. Um plano de dois acessos viraria ilimitado.
--
-- Nenhum dos dois vaza dado para fora da oficina, mas os dois são o mesmo erro
-- de novo: uma exceção da plataforma sendo escrita por quem ela deveria barrar.
-- Achado na revisão, antes de alguém usar.
--
-- O gatilho passa a rodar também no INSERT. No INSERT não há `old`, então o
-- caminho é separado — usar `old.de_suporte` ali seria erro em tempo de
-- execução na primeira vez que alguém cadastrasse alguém.

create or replace function public.impedir_escalada_de_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Só a plataforma cria conta de suporte, e ela fala com o banco sem sessão
    -- de usuário. As demais regras não valem no cadastro: quem pode cadastrar
    -- já é filtrado pela política de insert.
    if new.de_suporte and auth.uid() is not null then
      raise exception 'A marcação de conta de suporte é definida pela plataforma.'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if new.de_suporte is distinct from old.de_suporte and auth.uid() is not null then
    raise exception 'A marcação de conta de suporte é definida pela plataforma.'
      using errcode = 'insufficient_privilege';
  end if;

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

drop trigger if exists usuarios_impedir_escalada on public.usuarios;
create trigger usuarios_impedir_escalada
  before insert or update on public.usuarios
  for each row execute function public.impedir_escalada_de_perfil();

select public.conferir_fechadura();
