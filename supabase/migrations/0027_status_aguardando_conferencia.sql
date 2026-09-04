-- 0027 — O status que faltava entre o mecânico e o gerente
--
-- O mecânico não finaliza a ordem: ele avisa que terminou. Quem finaliza é
-- quem confere o serviço e cobra — e finalizar dá baixa no estoque, o que não
-- é decisão de quem está com a chave na mão.
--
-- 'aguardando_conferencia' entra ANTES de 'finalizada' na ordem do enum porque
-- o Postgres ordena enum pela ordem de declaração, e as listas de OS ordenam
-- por status. Entrando no fim, a ordem ficaria "finalizada, entregue,
-- cancelada, aguardando conferência" — errada na tela sem nenhum aviso.
--
-- Sozinho neste arquivo por obrigação do Postgres: valor novo de enum não pode
-- ser usado na mesma transação em que foi criado. Foi a mesma razão da 0016.

alter type public.status_os add value if not exists 'aguardando_conferencia' before 'finalizada';
