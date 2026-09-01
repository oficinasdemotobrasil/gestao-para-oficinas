-- 0011 — RLS do mecânico
--
-- O mecânico enxerga SOMENTE as ordens de serviço atribuídas a ele, e enxerga
-- cliente e moto apenas por derivação dessas OS. Ele não alcança financeiro,
-- custo de peça, margem, catálogo de produtos nem clientes de outros serviços.
--
-- Políticas do mesmo comando são combinadas com OU. Por isso o recorte do
-- mecânico fica em políticas próprias: elas não afrouxam as da 0010, apenas
-- abrem uma porta estreita a mais.
--
-- Observação de escopo: na Fase 1 não existe tela de ordem de serviço, então na
-- prática o mecânico entra e não encontra nada — que é o comportamento correto,
-- e não um erro de configuração.

-- Ordens de serviço atribuídas a ele ----------------------------------------
create policy "mecanico le as proprias ordens"
  on public.ordens_servico for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and mecanico_id = auth.uid()
  );

-- Ele mexe no andamento do próprio serviço, mas não muda de dono a OS: a
-- verificação impede que ele atribua a OS a outra pessoa ou a si mesmo.
create policy "mecanico atualiza as proprias ordens"
  on public.ordens_servico for update to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and mecanico_id = auth.uid()
  )
  with check (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and mecanico_id = auth.uid()
  );

-- Itens da OS dele: ele precisa saber quais peças e serviços executar.
-- A view enxerga descrição, quantidade e valor do item, nunca o custo do produto.
create policy "mecanico le itens das proprias ordens"
  on public.os_itens for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and exists (
      select 1
      from public.ordens_servico os
      where os.id = os_itens.ordem_servico_id
        and os.mecanico_id = auth.uid()
    )
  );

-- Cliente e moto da OS dele -------------------------------------------------
-- Sem isto o mecânico veria uma OS sem saber de que moto se trata. O 'exists'
-- limita a leitura ao que está atribuído a ele: nenhum outro cliente aparece.
create policy "mecanico le o cliente da propria ordem"
  on public.clientes for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and exists (
      select 1
      from public.ordens_servico os
      where os.cliente_id = clientes.id
        and os.mecanico_id = auth.uid()
    )
  );

create policy "mecanico le a moto da propria ordem"
  on public.motos for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and exists (
      select 1
      from public.ordens_servico os
      where os.moto_id = motos.id
        and os.mecanico_id = auth.uid()
    )
  );

-- Serviços do catálogo ------------------------------------------------------
-- Só o que está ativo, e sem nenhuma referência a custo — a tabela de serviços
-- guarda preço de venda e tempo estimado, nada de margem.
create policy "mecanico consulta servicos ativos"
  on public.servicos for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and ativo
  );

-- Apontamento de tempo (Fase 2) ---------------------------------------------
create policy "mecanico le os proprios apontamentos"
  on public.apontamentos_tempo for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and mecanico_id = auth.uid()
  );

create policy "mecanico registra o proprio apontamento"
  on public.apontamentos_tempo for insert to authenticated
  with check (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and mecanico_id = auth.uid()
    and exists (
      select 1
      from public.ordens_servico os
      where os.id = apontamentos_tempo.ordem_servico_id
        and os.mecanico_id = auth.uid()
    )
  );

create policy "mecanico encerra o proprio apontamento"
  on public.apontamentos_tempo for update to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and mecanico_id = auth.uid()
  )
  with check (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and mecanico_id = auth.uid()
  );
