-- 0060 — Serviço antigo: o passado da oficina, lançado de uma vez
--
-- A oficina chega ao sistema com meses de serviço feito no caderno. Para o
-- cliente, a moto e o faturamento começarem certos desde o primeiro dia, o
-- admin pode lançar esses serviços com a data em que aconteceram.
--
-- Um serviço antigo não percorre o ciclo (orçamento → aprovação → OS →
-- conclusão → pagamento): ele já aconteceu. Por isso nasce pronto, numa
-- chamada só, e as datas são gravadas num lugar só — se cada etapa pudesse
-- receber uma data, bastaria esquecer uma para o registro sair com metade em
-- março e metade hoje.
--
-- As travas, todas aqui e não na tela:
--   - só o admin lança;
--   - só datas até o dia em que a oficina entrou no sistema. Dali em diante o
--     sistema já registrava tudo sozinho, com a data real;
--   - só na criação. Não existe caminho para mudar a data de um registro que
--     já existe — isso é o que impede alguém de reescrever o passado;
--   - não mexe no estoque. As peças daquele serviço saíram há meses; o
--     estoque de hoje foi contado depois disso e já não as tem;
--   - o momento real do lançamento fica gravado (historico_lancado_em), e a
--     linha do andamento da OS mostra quem lançou e quando, com a hora real.

alter table public.orcamentos
  add column if not exists historico_lancado_em timestamptz;
alter table public.ordens_servico
  add column if not exists historico_lancado_em timestamptz;

comment on column public.orcamentos.historico_lancado_em is
  'Preenchida só no serviço antigo: o momento real do lançamento. criado_em guarda a data em que o serviço aconteceu.';
comment on column public.ordens_servico.historico_lancado_em is
  'Preenchida só no serviço antigo: o momento real do lançamento. data_abertura e data_conclusao guardam a data do serviço.';

-- A trava do ciclo ganha uma exceção, e só uma --------------------------------
-- A ordem antiga nasce 'aberta' (para os itens entrarem pelo caminho de
-- sempre, que recalcula o total) e vai direto para 'entregue'. Esse salto não
-- existe no ciclo normal, e continua não existindo: a exceção vale só dentro
-- de lancar_servico_antigo, que liga a marca na própria transação.
create or replace function public.conferir_mudanca_de_status_da_os()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if coalesce(current_setting('app.lancamento_historico', true), '') = 'sim'
     and old.status = 'aberta' and new.status = 'entregue' then
    return new;
  end if;

  if not public.transicao_de_os_valida(old.status, new.status) then
    raise exception 'A ordem está % e não pode passar para %.',
      public.nome_do_status_os(old.status), public.nome_do_status_os(new.status)
      using errcode = 'check_violation';
  end if;

  -- O mecânico anda só no pedaço dele. Sem isto, bastaria uma chamada direta à
  -- API para ele finalizar a própria ordem e dar baixa no estoque.
  if public.eh_mecanico()
     and new.status not in ('em_andamento', 'pausada', 'aguardando_conferencia') then
    if new.status = 'cancelada' then
      raise exception 'Cancelar a ordem é de quem atende o cliente.'
        using errcode = 'insufficient_privilege';
    end if;
    raise exception 'Marque a ordem como pronta para conferência. Finalizar é de quem confere o serviço.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- O lançamento ----------------------------------------------------------------
create or replace function public.lancar_servico_antigo(
  p_cliente_id uuid,
  p_moto_id uuid,
  p_km_registrado integer,
  p_garantia_dias integer,
  p_observacoes text,
  p_desconto numeric,
  p_desconto_percentual numeric,
  p_itens jsonb,
  p_data_servico date,
  p_data_pagamento date,
  p_forma_pagamento text
)
returns uuid
language plpgsql
as $$
declare
  v_oficina_id uuid := public.oficina_do_usuario();
  v_entrou_em date;
  v_quando timestamptz;
  v_total numeric(12, 2);
  v_orcamento_id uuid;
  v_os_id uuid;
  v_numero_os integer;
begin
  if v_oficina_id is null then
    raise exception 'Usuário sem oficina ativa.' using errcode = 'insufficient_privilege';
  end if;
  if not public.eh_admin() then
    raise exception 'Só o administrador da oficina lança serviço antigo.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_data_servico is null then
    raise exception 'Informe a data em que o serviço foi feito.' using errcode = 'check_violation';
  end if;
  if p_data_servico > current_date then
    raise exception 'A data do serviço não pode ser no futuro.' using errcode = 'check_violation';
  end if;

  select (criado_em at time zone 'America/Sao_Paulo')::date into v_entrou_em
  from public.oficinas where id = v_oficina_id;

  if p_data_servico > v_entrou_em then
    raise exception 'Serviço antigo é para o que foi feito antes de a oficina entrar no sistema (até %). Depois disso, lance pelo caminho normal.',
      to_char(v_entrou_em, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;

  if p_data_pagamento is not null
     and (p_data_pagamento < p_data_servico or p_data_pagamento > current_date) then
    raise exception 'A data do pagamento tem que ser entre a data do serviço e hoje.'
      using errcode = 'check_violation';
  end if;

  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then
    raise exception 'Adicione pelo menos um item.' using errcode = 'check_violation';
  end if;

  -- Meio-dia no horário de Brasília: longe o bastante da meia-noite para a
  -- data não escorregar para o dia anterior quando alguém converter o fuso.
  v_quando := (p_data_servico + time '12:00') at time zone 'America/Sao_Paulo';

  select coalesce(sum((x.quantidade * x.valor_unitario)::numeric(12, 2)), 0)
    into v_total
  from jsonb_to_recordset(p_itens)
    as x(quantidade numeric, valor_unitario numeric);
  v_total := greatest(v_total - coalesce(p_desconto, 0), 0);

  -- O orçamento, já aprovado ---------------------------------------------------
  insert into public.orcamentos
    (oficina_id, cliente_id, moto_id, status, km_registrado, garantia_dias,
     observacoes, desconto, desconto_percentual, valor_total, criado_por,
     criado_em, historico_lancado_em)
  values
    (v_oficina_id, p_cliente_id, p_moto_id, 'aprovado', p_km_registrado,
     coalesce(p_garantia_dias, 90), p_observacoes, coalesce(p_desconto, 0),
     p_desconto_percentual, v_total, auth.uid(), v_quando, now())
  returning id into v_orcamento_id;

  insert into public.orcamento_itens
    (oficina_id, orcamento_id, tipo, produto_id, servico_id, descricao,
     quantidade, valor_unitario, valor_total, criado_em)
  select v_oficina_id, v_orcamento_id, x.tipo::public.tipo_item, x.produto_id, x.servico_id,
         x.descricao, x.quantidade, x.valor_unitario,
         (x.quantidade * x.valor_unitario)::numeric(12, 2), v_quando
  from jsonb_to_recordset(p_itens)
    as x(tipo text, produto_id uuid, servico_id uuid, descricao text,
         quantidade numeric, valor_unitario numeric);

  -- A ordem ---------------------------------------------------------------------
  insert into public.ordens_servico
    (oficina_id, orcamento_id, cliente_id, moto_id, status, km_entrada,
     data_abertura, garantia_ate, observacoes, desconto, desconto_tipo,
     valor_total, criado_em, historico_lancado_em)
  values
    (v_oficina_id, v_orcamento_id, p_cliente_id, p_moto_id, 'aberta', p_km_registrado,
     v_quando, p_data_servico + coalesce(p_garantia_dias, 90), p_observacoes,
     case when p_desconto_percentual is not null
          then p_desconto_percentual else coalesce(p_desconto, 0) end,
     case when p_desconto_percentual is not null then 'percentual' else 'valor' end,
     0, v_quando, now())
  returning id, numero into v_os_id, v_numero_os;

  -- Os itens entram já marcados como feitos: o serviço aconteceu.
  insert into public.os_itens
    (oficina_id, ordem_servico_id, tipo, produto_id, servico_id, descricao,
     quantidade, valor_unitario, valor_total, criado_em, executado_em)
  select oficina_id, v_os_id, tipo, produto_id, servico_id, descricao,
         quantidade, valor_unitario, valor_total, v_quando, v_quando
  from public.orcamento_itens
  where orcamento_id = v_orcamento_id;

  -- Mesmo acerto de aprovar_orcamento: vale o valor combinado, ao centavo.
  -- Nenhuma movimentação de estoque é criada — ver o cabeçalho.
  perform set_config('app.lancamento_historico', 'sim', true);
  update public.ordens_servico
     set valor_total = v_total,
         status = 'entregue',
         data_conclusao = v_quando
   where id = v_os_id;
  perform set_config('app.lancamento_historico', '', true);

  -- O dinheiro ------------------------------------------------------------------
  -- Só em plano com financeiro: sem ele a tabela nem aceita a linha, e o
  -- serviço antigo continua valendo como histórico da moto e do cliente.
  if p_data_pagamento is not null and v_total > 0 and public.minha_oficina_tem_financeiro() then
    insert into public.contas_receber
      (oficina_id, ordem_servico_id, cliente_id, descricao, valor, valor_recebido,
       vencimento, data_pagamento, forma_pagamento, status, criado_em)
    values
      (v_oficina_id, v_os_id, p_cliente_id,
       format('OS nº %s', lpad(v_numero_os::text, 4, '0')),
       v_total, v_total, p_data_pagamento, p_data_pagamento,
       p_forma_pagamento, 'paga', v_quando);
  end if;

  -- A quilometragem da moto só sobe: o km de um serviço antigo quase sempre é
  -- menor que o de hoje, e não pode puxar o cadastro para trás.
  if p_km_registrado is not null then
    update public.motos
       set km_atual = p_km_registrado
     where id = p_moto_id and km_atual < p_km_registrado;
  end if;

  return v_orcamento_id;
end;
$$;

revoke all on function public.lancar_servico_antigo(
  uuid, uuid, integer, integer, text, numeric, numeric, jsonb, date, date, text
) from public, anon;
grant execute on function public.lancar_servico_antigo(
  uuid, uuid, integer, integer, text, numeric, numeric, jsonb, date, date, text
) to authenticated;

select public.conferir_fechadura();
