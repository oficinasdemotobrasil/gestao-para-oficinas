-- 0017 — A ordem de serviço vai para um responsável, não só para um mecânico
--
-- Regra nova: ao aprovar um orçamento, a OS é direcionada a qualquer
-- colaborador da oficina — admin, vendedor ou mecânico. Numa oficina pequena
-- quem executa muitas vezes é o próprio dono.
--
-- O nome mecanico_id passou a mentir. Renomear agora custa esta migration;
-- depois da Fase 3, com a tela de OS construída em cima da coluna, custa um dia.
--
-- As políticas de RLS não precisam ser reescritas: o Postgres guarda a
-- expressão delas já analisada, apontando para a coluna, não para o texto do
-- nome. O recorte do mecânico continua valendo, agora sobre responsavel_id.

alter table public.ordens_servico rename column mecanico_id to responsavel_id;

alter index public.ordens_servico_mecanico_idx rename to ordens_servico_responsavel_idx;

alter table public.ordens_servico
  rename constraint ordens_servico_mecanico_fk to ordens_servico_responsavel_fk;

comment on column public.ordens_servico.responsavel_id is
  'Colaborador encarregado da OS. Qualquer perfil pode ser responsável. O mecânico só enxerga as ordens em que ele está aqui.';
