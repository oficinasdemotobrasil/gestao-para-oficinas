-- 0077 — Uma conta de suporte por oficina, garantido pelo banco
--
-- A função da plataforma procura a conta de suporte da oficina assim:
--
--   select id from usuarios where oficina_id = ? and de_suporte
--
-- e cria uma quando não acha. Entre o "não achei" e o "criei" existe uma fresta:
-- dois atendimentos abertos ao mesmo tempo na mesma oficina criariam duas
-- contas, e a partir daí a busca devolveria duas linhas. O suporte daquela
-- oficina pararia de funcionar — a mesma família de defeito que a busca por
-- e-mail causou, e que custou duas versões para ser entendida.
--
-- Havia duas saídas. Guardar o id numa coluna de `oficinas` resolveria a busca
-- e deixaria a fresta aberta: duas chamadas simultâneas ainda criariam duas
-- contas, só que uma delas ficaria órfã e invisível dentro da oficina do
-- cliente. Este índice fecha a fresta: a segunda inserção é recusada pelo
-- banco, a chamada devolve erro e quem clicou tenta de novo.
--
-- Parcial porque a regra é só para contas de suporte — a oficina continua tendo
-- quantos colaboradores o plano dela permitir.

create unique index if not exists usuarios_uma_conta_de_suporte_por_oficina
  on public.usuarios (oficina_id)
  where de_suporte;

select public.conferir_fechadura();
