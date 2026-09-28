-- 0074 — A conta de suporte pode mudar de oficina
--
-- O gatilho `impedir_escalada_de_perfil` (0009) proíbe mexer em perfil, oficina
-- e situação de um colaborador quando quem chama não é admin. É uma boa regra:
-- sem ela, qualquer um que alcançasse a linha poderia se promover.
--
-- Só que a conta de suporte da 0073 existe justamente para MUDAR de oficina, e
-- quem a move é a função da plataforma, que não é admin de oficina nenhuma. O
-- resultado seria um recurso que funciona na primeira oficina e falha na
-- segunda — e os dois testes ao vivo não pegaram isso porque, nas duas vezes, a
-- linha foi criada do zero em vez de movida. Um bug que só aparece na segunda
-- vez é pior do que um que aparece na primeira.
--
-- A exceção é estreita de propósito: vale só para a linha marcada `de_suporte`.
-- E ela não abre caminho para nada, porque mover a conta não dá acesso: o
-- acesso nasce da sessão registrada, que confere usuário E oficina E prazo.

create or replace function public.impedir_escalada_de_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A conta de suporte é a única que muda de oficina, e quem a move é a função
  -- da plataforma. Ver 0073.
  if new.de_suporte or old.de_suporte then
    return new;
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
  -- oficina para outra sem deixar rastro. Regra da 0009, preservada aqui —
  -- eu a havia apagado ao reescrever a função, e nenhum teste acusou. O teste
  -- que faltava entrou junto com esta migração.
  if new.oficina_id is distinct from old.oficina_id then
    raise exception 'Não é possível mover um colaborador para outra oficina.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

select public.conferir_fechadura();
