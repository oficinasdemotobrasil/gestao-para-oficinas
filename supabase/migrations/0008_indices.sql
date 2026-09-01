-- 0008 — Índices
-- oficina_id entra em toda política de RLS, ou seja, em toda consulta do sistema:
-- sem índice nele, cada tela vira varredura de tabela inteira.

create index clientes_oficina_id_idx on public.clientes (oficina_id);
create index motos_oficina_id_idx on public.motos (oficina_id);
create index moto_proprietarios_oficina_id_idx on public.moto_proprietarios (oficina_id);
create index produtos_oficina_id_idx on public.produtos (oficina_id);
create index servicos_oficina_id_idx on public.servicos (oficina_id);
create index notas_fiscais_entrada_oficina_id_idx on public.notas_fiscais_entrada (oficina_id);
create index movimentacoes_estoque_oficina_id_idx on public.movimentacoes_estoque (oficina_id);
create index orcamentos_oficina_id_idx on public.orcamentos (oficina_id);
create index orcamento_itens_oficina_id_idx on public.orcamento_itens (oficina_id);
create index ordens_servico_oficina_id_idx on public.ordens_servico (oficina_id);
create index os_itens_oficina_id_idx on public.os_itens (oficina_id);
create index apontamentos_tempo_oficina_id_idx on public.apontamentos_tempo (oficina_id);
create index contas_receber_oficina_id_idx on public.contas_receber (oficina_id);
create index contas_pagar_oficina_id_idx on public.contas_pagar (oficina_id);

-- Busca do balcão: "chegou a placa ABC1D23".
create index motos_placa_idx on public.motos (placa);

-- Busca por telefone é como o balcão acha o cliente que ligou.
create index clientes_telefone_idx on public.clientes (telefone);

-- Busca por nome sem diferenciar maiúscula/minúscula.
create index clientes_nome_idx on public.clientes (oficina_id, lower(nome));

create index ordens_servico_status_idx on public.ordens_servico (oficina_id, status);
create index ordens_servico_mecanico_idx on public.ordens_servico (mecanico_id);

create index contas_receber_vencimento_idx on public.contas_receber (oficina_id, vencimento);
create index contas_pagar_vencimento_idx on public.contas_pagar (oficina_id, vencimento);

-- Percorrer o histórico de uma moto e os itens de um documento.
create index moto_proprietarios_moto_idx on public.moto_proprietarios (moto_id);
create index moto_proprietarios_cliente_idx on public.moto_proprietarios (cliente_id);
create index orcamento_itens_orcamento_idx on public.orcamento_itens (orcamento_id);
create index os_itens_os_idx on public.os_itens (ordem_servico_id);
create index apontamentos_tempo_os_idx on public.apontamentos_tempo (ordem_servico_id);
create index movimentacoes_estoque_produto_idx on public.movimentacoes_estoque (produto_id);
