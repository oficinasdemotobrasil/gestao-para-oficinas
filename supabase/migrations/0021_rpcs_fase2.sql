-- 0021 — Operações que são várias escritas e precisam ser uma só
--
-- Nota com itens, cancelamento, orçamento com itens e aprovação: em todas,
-- gravar metade é pior do que não gravar nada. Uma nota sem as entradas de
-- estoque, ou uma OS sem os itens copiados, é um registro que ninguém entende
-- depois. Aqui elas viram uma transação.
--
-- Todas rodam com as permissões de quem chamou (padrão do plpgsql), então o RLS
-- continua valendo dentro delas. Nenhuma escapa do isolamento entre oficinas.

-- Nota fiscal de entrada -----------------------------------------------------
-- Os itens da nota são as movimentações de entrada que ela gera. Uma fonte de
-- verdade em vez de duas que podem discordar.
create or replace function public.salvar_nota_com_itens(
  p_numero text,
  p_fornecedor text,
  p_data_emissao date,
  p_valor_total numeric,
  p_arquivo_url text,
  p_itens jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_oficina_id uuid := public.oficina_do_usuario();
  v_nota_id uuid;
  v_item record;
begin
  if v_oficina_id is null then
    raise exception 'Usuário sem oficina ativa.' using errcode = 'insufficient_privilege';
  end if;

  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then
    raise exception 'A nota precisa de pelo menos um item.' using errcode = 'check_violation';
  end if;

  insert into public.notas_fiscais_entrada
    (oficina_id, numero, fornecedor, data_emissao, valor_total, arquivo_url)
  values
    (v_oficina_id, p_numero, p_fornecedor, p_data_emissao, coalesce(p_valor_total, 0), p_arquivo_url)
  returning id into v_nota_id;

  for v_item in
    select * from jsonb_to_recordset(p_itens)
      as x(produto_id uuid, quantidade numeric, custo_unitario numeric)
  loop
    if v_item.quantidade is null or v_item.quantidade <= 0 then
      raise exception 'Quantidade inválida em um dos itens da nota.' using errcode = 'check_violation';
    end if;

    insert into public.movimentacoes_estoque
      (oficina_id, produto_id, tipo, quantidade, motivo, nota_fiscal_id, usuario_id, custo_unitario)
    values
      (v_oficina_id, v_item.produto_id, 'entrada', v_item.quantidade,
       'Entrada pela nota ' || coalesce(p_numero, 's/n'), v_nota_id, auth.uid(), v_item.custo_unitario);
  end loop;

  return v_nota_id;
end;
$$;

-- Cancelar não apaga: estorna.
--
-- Se a peça já saiu para um serviço, o estorno derruba o estoque abaixo de zero
-- e o gatilho recusa a operação inteira. É o comportamento certo: não dá para
-- "des-receber" uma peça que já foi usada. A mensagem que chega na tela é a do
-- estoque insuficiente, dizendo qual peça travou.
create or replace function public.cancelar_nota(p_nota_id uuid)
returns void
language plpgsql
as $$
declare
  v_nota record;
  v_mov record;
begin
  select * into v_nota from public.notas_fiscais_entrada where id = p_nota_id;

  if not found then
    raise exception 'Nota não encontrada.' using errcode = 'no_data_found';
  end if;

  if v_nota.status = 'cancelada' then
    raise exception 'Esta nota já foi cancelada.' using errcode = 'check_violation';
  end if;

  for v_mov in
    select * from public.movimentacoes_estoque
    where nota_fiscal_id = p_nota_id and tipo = 'entrada'
  loop
    insert into public.movimentacoes_estoque
      (oficina_id, produto_id, tipo, quantidade, motivo, nota_fiscal_id, usuario_id)
    values
      (v_mov.oficina_id, v_mov.produto_id, 'saida', v_mov.quantidade,
       'Estorno da nota ' || coalesce(v_nota.numero, 's/n'), p_nota_id, auth.uid());
  end loop;

  update public.notas_fiscais_entrada
     set status = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid()
   where id = p_nota_id;
end;
$$;

-- Orçamento ------------------------------------------------------------------
-- Grava o orçamento e troca os itens de uma vez. Também evita a armadilha da
-- inserção em lote pelo PostgREST, em que a linha sem uma coluna recebe NULL e
-- derruba o lote inteiro (ver migration 0015).
create or replace function public.salvar_orcamento_com_itens(
  p_orcamento_id uuid,
  p_cliente_id uuid,
  p_moto_id uuid,
  p_km_registrado integer,
  p_validade_dias integer,
  p_garantia_dias integer,
  p_observacoes text,
  p_desconto numeric,
  p_desconto_percentual numeric,
  p_itens jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_oficina_id uuid := public.oficina_do_usuario();
  v_id uuid := p_orcamento_id;
  v_total numeric(12, 2) := 0;
  v_status public.status_orcamento;
  v_item record;
begin
  if v_oficina_id is null then
    raise exception 'Usuário sem oficina ativa.' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(sum((x.quantidade * x.valor_unitario)::numeric(12, 2)), 0)
    into v_total
  from jsonb_to_recordset(coalesce(p_itens, '[]'::jsonb))
    as x(tipo text, produto_id uuid, servico_id uuid, descricao text,
         quantidade numeric, valor_unitario numeric);

  v_total := greatest(v_total - coalesce(p_desconto, 0), 0);

  if v_id is null then
    insert into public.orcamentos
      (oficina_id, cliente_id, moto_id, km_registrado, validade_dias, garantia_dias,
       observacoes, desconto, desconto_percentual, valor_total, criado_por)
    values
      (v_oficina_id, p_cliente_id, p_moto_id, p_km_registrado,
       coalesce(p_validade_dias, 7), coalesce(p_garantia_dias, 90),
       p_observacoes, coalesce(p_desconto, 0), p_desconto_percentual, v_total, auth.uid())
    returning id into v_id;
  else
    select status into v_status from public.orcamentos where id = v_id;

    if v_status is null then
      raise exception 'Orçamento não encontrado.' using errcode = 'no_data_found';
    end if;

    -- Aprovado virou documento: a OS já nasceu dele. Editar depois faria a OS
    -- contar uma história diferente da que o cliente aprovou.
    if v_status in ('aprovado', 'recusado') then
      raise exception 'Este orçamento já foi %. Não pode mais ser alterado.', v_status
        using errcode = 'check_violation';
    end if;

    update public.orcamentos
       set cliente_id = p_cliente_id,
           moto_id = p_moto_id,
           km_registrado = p_km_registrado,
           validade_dias = coalesce(p_validade_dias, 7),
           garantia_dias = coalesce(p_garantia_dias, 90),
           observacoes = p_observacoes,
           desconto = coalesce(p_desconto, 0),
           desconto_percentual = p_desconto_percentual,
           valor_total = v_total
     where id = v_id;

    delete from public.orcamento_itens where orcamento_id = v_id;
  end if;

  for v_item in
    select * from jsonb_to_recordset(coalesce(p_itens, '[]'::jsonb))
      as x(tipo text, produto_id uuid, servico_id uuid, descricao text,
           quantidade numeric, valor_unitario numeric)
  loop
    insert into public.orcamento_itens
      (oficina_id, orcamento_id, tipo, produto_id, servico_id, descricao,
       quantidade, valor_unitario, valor_total)
    values
      (v_oficina_id, v_id, v_item.tipo::public.tipo_item, v_item.produto_id, v_item.servico_id,
       v_item.descricao, v_item.quantidade, v_item.valor_unitario,
       (v_item.quantidade * v_item.valor_unitario)::numeric(12, 2));
  end loop;

  -- A quilometragem da moto vale a do orçamento mais recente: foi lida do painel
  -- agora, com a moto na frente de quem digitou.
  if p_km_registrado is not null then
    update public.motos
       set km_atual = p_km_registrado
     where id = p_moto_id and km_atual < p_km_registrado;
  end if;

  return v_id;
end;
$$;

create or replace function public.duplicar_orcamento(p_orcamento_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_origem record;
  v_novo_id uuid;
begin
  select * into v_origem from public.orcamentos where id = p_orcamento_id;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'no_data_found';
  end if;

  insert into public.orcamentos
    (oficina_id, cliente_id, moto_id, km_registrado, validade_dias, garantia_dias,
     observacoes, desconto, desconto_percentual, valor_total, criado_por, status)
  values
    (v_origem.oficina_id, v_origem.cliente_id, v_origem.moto_id, v_origem.km_registrado,
     v_origem.validade_dias, v_origem.garantia_dias, v_origem.observacoes,
     v_origem.desconto, v_origem.desconto_percentual, v_origem.valor_total,
     auth.uid(), 'rascunho')
  returning id into v_novo_id;

  insert into public.orcamento_itens
    (oficina_id, orcamento_id, tipo, produto_id, servico_id, descricao,
     quantidade, valor_unitario, valor_total)
  select oficina_id, v_novo_id, tipo, produto_id, servico_id, descricao,
         quantidade, valor_unitario, valor_total
  from public.orcamento_itens
  where orcamento_id = p_orcamento_id;

  return v_novo_id;
end;
$$;

-- Aprovação ------------------------------------------------------------------
-- Vira ordem de serviço com os itens copiados e o responsável escolhido.
-- O estoque NÃO se mexe aqui: a baixa acontece quando a OS for finalizada, na
-- Fase 3. Dar baixa na aprovação obrigaria a estornar toda vez que uma peça
-- fosse trocada durante o serviço.
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
begin
  select * into v_orc from public.orcamentos where id = p_orcamento_id;
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
     km_entrada, garantia_ate, observacoes)
  values
    (v_orc.oficina_id, v_orc.id, v_orc.cliente_id, v_orc.moto_id, p_responsavel_id,
     'aberta', v_orc.km_registrado, current_date + v_orc.garantia_dias, v_orc.observacoes)
  returning id into v_os_id;

  insert into public.os_itens
    (oficina_id, ordem_servico_id, tipo, produto_id, servico_id, descricao,
     quantidade, valor_unitario, valor_total)
  select oficina_id, v_os_id, tipo, produto_id, servico_id, descricao,
         quantidade, valor_unitario, valor_total
  from public.orcamento_itens
  where orcamento_id = p_orcamento_id;

  update public.orcamentos set status = 'aprovado' where id = p_orcamento_id;

  return v_os_id;
end;
$$;

create or replace function public.recusar_orcamento(
  p_orcamento_id uuid,
  p_motivo text
)
returns void
language plpgsql
as $$
begin
  update public.orcamentos
     set status = 'recusado', motivo_recusa = nullif(trim(coalesce(p_motivo, '')), '')
   where id = p_orcamento_id and status <> 'aprovado';

  if not found then
    raise exception 'Não foi possível recusar: o orçamento não existe ou já foi aprovado.'
      using errcode = 'check_violation';
  end if;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'salvar_nota_com_itens(text, text, date, numeric, text, jsonb)',
    'cancelar_nota(uuid)',
    'salvar_orcamento_com_itens(uuid, uuid, uuid, integer, integer, integer, text, numeric, numeric, jsonb)',
    'duplicar_orcamento(uuid)',
    'aprovar_orcamento(uuid, uuid)',
    'recusar_orcamento(uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
