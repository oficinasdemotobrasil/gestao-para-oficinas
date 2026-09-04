-- 0031 — Apagar um colaborador não pode derrubar o histórico
--
-- A chave estrangeira do histórico de status aponta para (usuario_id,
-- oficina_id) e foi escrita com 'on delete set null'. Sem dizer QUAIS colunas,
-- o Postgres tenta anular as duas — e oficina_id é not null. Resultado: apagar
-- um colaborador falhava com um erro que não explicava nada.
--
-- No dia a dia isso não aparece, porque colaborador que sai é desativado e não
-- apagado. Apareceu na limpeza das oficinas de teste, que apaga de verdade — e
-- o que quebra o teste quebraria também o dia em que alguém precisasse remover
-- um cadastro criado por engano.
--
-- A correção diz a coluna: só o usuário some do registro; a oficina fica, e a
-- linha do histórico continua contando o que aconteceu.

alter table public.os_status_historico
  drop constraint if exists os_status_historico_usuario_fk;

alter table public.os_status_historico
  add constraint os_status_historico_usuario_fk
  foreign key (usuario_id, oficina_id)
  references public.usuarios (id, oficina_id)
  on delete set null (usuario_id);
