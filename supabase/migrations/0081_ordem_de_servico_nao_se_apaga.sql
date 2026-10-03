-- 0081 — Ordem de serviço não se apaga, se cancela
--
-- A política "admin cancela ordem de servico" (0010) é, apesar do nome, de
-- DELETE — sem olhar o status. Nasceu antes de a OS ter ciclo de vida (0028),
-- quando apagar era o único jeito de desistir de uma ordem. Desde então o
-- caminho é `cancelar_os`, que devolve o estoque e deixa o histórico.
--
-- A revisão da 0080 achou o efeito: o dono apagava pela API uma OS já
-- entregue, e junto, em cascata, iam a vistoria e as fotos — a prova que a
-- 0079 e a 0080 existem para guardar. E com elas os itens, o andamento e o
-- tempo do mecânico.
--
-- Nenhuma tela apaga OS; conferido no código antes desta migração. Quem apaga
-- são os scripts de limpeza e de zerar oficina, com a chave de serviço, que
-- não passa por RLS — eles continuam funcionando.
drop policy if exists "admin cancela ordem de servico" on public.ordens_servico;

select public.conferir_fechadura();
