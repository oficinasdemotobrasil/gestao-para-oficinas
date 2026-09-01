-- 0010 — RLS das tabelas de negócio (admin e vendedor)
-- O recorte do mecânico vem na 0011, em políticas separadas, para ficar fácil
-- de auditar o que exatamente aquele perfil alcança.
--
-- Leitura de toda política daqui: "linha da minha oficina" + "meu perfil pode".

alter table public.clientes enable row level security;
alter table public.motos enable row level security;
alter table public.moto_proprietarios enable row level security;
alter table public.produtos enable row level security;
alter table public.servicos enable row level security;
alter table public.notas_fiscais_entrada enable row level security;
alter table public.movimentacoes_estoque enable row level security;
alter table public.orcamentos enable row level security;
alter table public.orcamento_itens enable row level security;
alter table public.ordens_servico enable row level security;
alter table public.os_itens enable row level security;
alter table public.apontamentos_tempo enable row level security;
alter table public.contas_receber enable row level security;
alter table public.contas_pagar enable row level security;

-- Clientes ------------------------------------------------------------------
create policy "atendimento le clientes"
  on public.clientes for select to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "atendimento cadastra clientes"
  on public.clientes for insert to authenticated
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "atendimento edita clientes"
  on public.clientes for update to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "admin apaga clientes"
  on public.clientes for delete to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin());

-- Motos ---------------------------------------------------------------------
create policy "atendimento le motos"
  on public.motos for select to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "atendimento cadastra motos"
  on public.motos for insert to authenticated
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "atendimento edita motos"
  on public.motos for update to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "admin apaga motos"
  on public.motos for delete to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin());

-- Proprietários da moto -----------------------------------------------------
create policy "atendimento le proprietarios"
  on public.moto_proprietarios for select to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "atendimento registra proprietario"
  on public.moto_proprietarios for insert to authenticated
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "atendimento encerra proprietario"
  on public.moto_proprietarios for update to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "admin apaga proprietario"
  on public.moto_proprietarios for delete to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin());

-- Produtos ------------------------------------------------------------------
-- Só o admin lê a tabela direto, porque a linha inteira carrega preco_custo e
-- RLS filtra linha, não coluna. O vendedor consulta pela view vw_produtos (0012).
create policy "admin le produtos"
  on public.produtos for select to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin());

create policy "admin cadastra produtos"
  on public.produtos for insert to authenticated
  with check (oficina_id = public.oficina_do_usuario() and public.eh_admin());

create policy "admin edita produtos"
  on public.produtos for update to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_admin());

create policy "admin apaga produtos"
  on public.produtos for delete to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin());

-- Serviços ------------------------------------------------------------------
-- Serviço não tem custo nem margem, então o vendedor lê a tabela direto.
create policy "atendimento le servicos"
  on public.servicos for select to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "admin cadastra servicos"
  on public.servicos for insert to authenticated
  with check (oficina_id = public.oficina_do_usuario() and public.eh_admin());

create policy "admin edita servicos"
  on public.servicos for update to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_admin());

create policy "admin apaga servicos"
  on public.servicos for delete to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin());

-- Notas de entrada e movimentação de estoque --------------------------------
-- Nota de entrada mostra o que a oficina pagou no fornecedor: admin apenas.
create policy "admin gerencia notas de entrada"
  on public.notas_fiscais_entrada for all to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_admin());

create policy "admin gerencia movimentacoes"
  on public.movimentacoes_estoque for all to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_admin());

-- Orçamentos ----------------------------------------------------------------
create policy "atendimento gerencia orcamentos"
  on public.orcamentos for all to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "atendimento gerencia itens do orcamento"
  on public.orcamento_itens for all to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

-- Ordens de serviço ---------------------------------------------------------
create policy "atendimento le ordens de servico"
  on public.ordens_servico for select to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "atendimento abre ordem de servico"
  on public.ordens_servico for insert to authenticated
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "atendimento edita ordem de servico"
  on public.ordens_servico for update to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "admin cancela ordem de servico"
  on public.ordens_servico for delete to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin());

create policy "atendimento gerencia itens da os"
  on public.os_itens for all to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "atendimento le apontamentos"
  on public.apontamentos_tempo for select to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

-- Financeiro ----------------------------------------------------------------
-- Vendedor e mecânico não veem financeiro. Nenhuma política os alcança.
create policy "admin gerencia contas a receber"
  on public.contas_receber for all to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_admin());

create policy "admin gerencia contas a pagar"
  on public.contas_pagar for all to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_admin());
