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
-- ATENÇÃO — a primeira versão desta migração tinha um buraco, e ele quase foi
-- para produção. A exceção olhava só o valor da coluna: "se a linha é de
-- suporte, pode". Mas a política "admin edita colaborador e cada um edita a si"
-- (0009) deixa qualquer pessoa editar a PRÓPRIA linha, e `de_suporte` era uma
-- coluna comum. Bastavam dois pedidos à API:
--
--   1. update usuarios set de_suporte = true where id = <eu mesmo>
--      -- o gatilho via `new.de_suporte` e liberava
--   2. update usuarios set de_suporte = false, perfil = 'admin',
--             oficina_id = <oficina de outro cliente>
--      -- o gatilho via `old.de_suporte` e liberava de novo
--
-- Um mecânico viraria admin de outra oficina, permanente e sem registro — o
-- vazamento entre clientes que o sistema inteiro existe para impedir. Achado na
-- revisão, antes de rodar.
--
-- A lição: exceção não pode depender do VALOR da linha, porque o valor é escrito
-- por quem a exceção deveria barrar. Tem de depender de QUEM CHAMA. Aqui, quem
-- move a conta é a função da plataforma, que fala com o banco sem sessão de
-- usuário — `auth.uid()` nulo. Ninguém logado no aplicativo consegue isso.

create or replace function public.impedir_escalada_de_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A marcação de suporte é da plataforma, e de mais ninguém. Sem esta linha,
  -- qualquer um se marcaria e atravessaria as regras abaixo.
  if new.de_suporte is distinct from old.de_suporte and auth.uid() is not null then
    raise exception 'A marcação de conta de suporte é definida pela plataforma.'
      using errcode = 'insufficient_privilege';
  end if;

  -- A exceção: a conta de suporte muda de oficina, e só quando quem pede é o
  -- servidor. Ela já era de suporte antes e continua sendo depois — nenhum dos
  -- dois lados pode ser fabricado por quem está logado.
  if old.de_suporte and new.de_suporte and auth.uid() is null then
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
