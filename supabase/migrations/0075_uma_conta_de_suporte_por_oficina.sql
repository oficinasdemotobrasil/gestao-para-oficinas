-- 0075 — Uma conta de suporte por oficina, e não uma que se muda de lugar
--
-- A 0073 e a 0074 partiram de uma premissa errada: uma única conta de suporte
-- que seria reapontada para a oficina do atendimento. Elegante no papel, e
-- impossível no banco — o teste contra produção mostrou por quê:
--
--   update or delete on table "usuarios" violates foreign key constraint
--   "ordens_servico_responsavel_fk"
--
-- Quatro tabelas apontam para o usuário JUNTO com a oficina dele:
-- `ordens_servico`, `os_itens`, `apontamentos_tempo` e `os_status_historico`.
-- É o que garante que o responsável por uma OS é da mesma oficina — uma das
-- regras que sustentam o isolamento. Basta o suporte mudar o status de uma OS
-- na oficina A para a conta ficar presa ali: o recurso funcionaria no primeiro
-- atendimento e travaria no segundo.
--
-- `ON UPDATE CASCADE` resolveria e seria pior: o banco reescreveria a oficina
-- das linhas de histórico, levando registro da oficina A para a B. Trocar um
-- vazamento por outro.
--
-- O desenho certo não contorna a regra, ele para de precisar dela: CADA oficina
-- ganha a sua conta de suporte, criada no primeiro atendimento. A autoria fica
-- onde aconteceu, as chaves compostas continuam valendo, e nada se move. A
-- exceção de movimento da 0074 sai junto, porque exceção sem uso é só
-- superfície de ataque esperando alguém achar.
--
-- O que a 0074 trouxe de bom fica: ninguém logado marca uma conta como de
-- suporte. Essa linha foi o conserto de uma escalada de privilégio de verdade.

create or replace function public.impedir_escalada_de_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A marcação de suporte é da plataforma, e de mais ninguém. Sem isto,
  -- qualquer um se marcaria e atravessaria as regras abaixo — era o buraco que
  -- a primeira versão da 0074 abria.
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
  -- oficina para outra sem deixar rastro. Agora vale para TODA linha, inclusive
  -- as de suporte — nenhuma precisa mais se mover.
  if new.oficina_id is distinct from old.oficina_id then
    raise exception 'Não é possível mover um colaborador para outra oficina.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

select public.conferir_fechadura();
