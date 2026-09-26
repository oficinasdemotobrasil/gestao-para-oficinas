-- 0070 — Revogar de `authenticated`, que não herda de `public`
--
-- A 0069 revogou as duas funções de recálculo "de public e anon", seguindo o
-- que a 0019 fez com `recalcular_estoque`. Em produção elas continuaram
-- alcançáveis pela API: no Supabase, `authenticated` recebe EXECUTE por
-- concessão própria nas funções novas do schema público, e revogar de `public`
-- não tira o que foi dado a ele diretamente.
--
-- O teste local passava porque o shim do PGlite não reproduzia essa concessão.
-- Isso também foi corrigido, em scripts/shim-supabase.sql: sem aquela linha,
-- qualquer revogação incompleta continuaria invisível no teste e visível no
-- banco de verdade — que é a pior combinação possível.
--
-- Entra junto `recalcular_estoque`, aberta desde a 0019 pelo mesmo motivo. Ela
-- é `security definer`, aceita o id de um produto qualquer e ninguém a chama:
-- nem o aplicativo, nem outra função do banco. Era uma porta para escrever na
-- linha de outra oficina — ainda que só para pôr nela o número certo, escrever
-- fora do próprio quintal não é coisa que se deixe aberta.

revoke all on function public.recalcular_total_do_orcamento(uuid)
  from public, anon, authenticated;
revoke all on function public.recalcular_total_da_os(uuid)
  from public, anon, authenticated;
revoke all on function public.recalcular_estoque(uuid)
  from public, anon, authenticated;

/*
 * A base da comissão volta a ser o total do orçamento.
 *
 * A 0068 calculou a base pelos itens justamente porque `valor_total` era
 * escrevível pela API. Depois da 0069 ele não é mais: o banco o refaz a cada
 * gravação, inclusive tratando o desconto percentual.
 *
 * Manter as duas contas separadas virou defeito, e foi apontado na revisão: o
 * gatilho passou a abater o percentual e a base não, então um orçamento com
 * desconto percentual e indicador gerava comissão sobre o valor cheio. Uma
 * conta só, no campo que agora é confiável, e as duas não têm como divergir.
 */
create or replace function public.aprovar_orcamento(
  p_orcamento_id uuid,
  p_responsavel_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_orc record;
  v_os_id uuid;
  v_percentual numeric(5, 2);
begin
  select * into v_orc from public.orcamentos where id = p_orcamento_id for update;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'no_data_found';
  end if;

  if v_orc.status = 'aprovado' then
    raise exception 'Este orçamento já foi aprovado.' using errcode = 'check_violation';
  end if;
  if v_orc.status = 'recusado' then
    raise exception 'Este orçamento foi recusado e não pode ser aprovado.' using errcode = 'check_violation';
  end if;

  insert into public.ordens_servico
    (oficina_id, orcamento_id, cliente_id, moto_id, responsavel_id, status,
     km_entrada, garantia_ate, observacoes,
     desconto, desconto_tipo, valor_total)
  values
    (v_orc.oficina_id, v_orc.id, v_orc.cliente_id, v_orc.moto_id, p_responsavel_id,
     'aberta', v_orc.km_registrado, current_date + v_orc.garantia_dias, v_orc.observacoes,
     case when v_orc.desconto_percentual is not null
          then v_orc.desconto_percentual else coalesce(v_orc.desconto, 0) end,
     case when v_orc.desconto_percentual is not null then 'percentual' else 'valor' end,
     0)
  returning id into v_os_id;

  insert into public.os_itens
    (oficina_id, ordem_servico_id, tipo, produto_id, servico_id, descricao,
     quantidade, valor_unitario, valor_total)
  select oficina_id, v_os_id, tipo, produto_id, servico_id, descricao,
         quantidade, valor_unitario, valor_total
  from public.orcamento_itens
  where orcamento_id = p_orcamento_id;

  perform set_config('app.total_calculado', 'sim', true);
  update public.ordens_servico
     set valor_total = v_orc.valor_total
   where id = v_os_id;
  perform set_config('app.total_calculado', '', true);

  update public.orcamentos set status = 'aprovado' where id = p_orcamento_id;

  if v_orc.indicador_id is not null then
    select coalesce(i.percentual, o.comissao_indicador_percentual)
      into v_percentual
    from public.indicadores i
    join public.oficinas o on o.id = i.oficina_id
    where i.id = v_orc.indicador_id;

    perform set_config('app.comissao_da_aprovacao', 'sim', true);

    insert into public.comissoes
      (oficina_id, indicador_id, orcamento_id, ordem_servico_id, base, percentual, valor)
    values
      (v_orc.oficina_id, v_orc.indicador_id, v_orc.id, v_os_id,
       v_orc.valor_total, v_percentual,
       round(v_orc.valor_total * v_percentual / 100, 2));

    perform set_config('app.comissao_da_aprovacao', '', true);
  end if;

  return v_os_id;
end;
$$;

select public.conferir_fechadura();
