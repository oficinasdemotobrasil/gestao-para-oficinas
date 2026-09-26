-- 0069 — O valor total é do servidor, não de quem manda o pedido
--
-- O que estava aberto, e foi testado em produção antes de existir esta
-- migração: a política de orçamentos é `for all` para o atendimento, sem
-- recorte de coluna. Um vendedor gravou `valor_total = 50000` num orçamento
-- cujos itens somam 50, por um PATCH comum da API, sem erro nenhum.
--
-- Não é só o orçamento. Dali sai a ordem de serviço, e da ordem sai a conta a
-- receber — o que o cliente da oficina paga. E nenhuma tela mostra que o total
-- não bate com a soma dos itens: o orçamento impresso continua com as peças de
-- sempre e um número maior embaixo.
--
-- A 0068 tapou só a comissão, calculando a base pelos itens. Aqui a coisa é
-- fechada na origem, com duas soluções diferentes porque os dois casos são
-- diferentes:
--
-- * No ORÇAMENTO, `valor_total` passa a ser coluna derivada: escreva o que
--   escrever, o banco recalcula a partir dos itens e do desconto. É a mesma
--   conta que `salvar_orcamento_com_itens` já fazia, então nada muda para quem
--   usa o sistema pelo caminho normal. Conferido antes: os 5 orçamentos e as 4
--   ordens que existem hoje em produção já batem com essa conta, então ligar
--   isto não mexe em nenhum número real.
--
-- * Na ORDEM DE SERVIÇO, derivar seria arriscado: o desconto dela pode ser
--   percentual, e recalcular do percentual pode dar um centavo de diferença do
--   total que o cliente aprovou — justamente o centavo que a 0026 tomou o
--   cuidado de casar. Então aqui a regra é outra: a coluna só aceita escrita de
--   quem calculou, marcado pela chave de sessão, como na 0060 e na 0068.

-- O total do orçamento ----------------------------------------------------------
create or replace function public.soma_dos_itens_do_orcamento(p_orcamento uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(valor_total), 0)::numeric(12, 2)
  from public.orcamento_itens
  where orcamento_id = p_orcamento;
$$;

comment on function public.soma_dos_itens_do_orcamento is
  'A soma dos itens, sem desconto. O desconto entra em quem chama, porque o gatilho precisa usar o desconto NOVO.';

/*
 * Antes de gravar, o total é recalculado.
 *
 * O desconto vem de `new` de propósito: quem muda só o desconto espera que o
 * total acompanhe, e com `old` ele ficaria parado até alguém tocar num item.
 *
 * `desconto` aqui é o valor em reais. O percentual fica guardado ao lado, em
 * `desconto_percentual`, só para a tela lembrar como a pessoa escolheu — a
 * conta é a mesma de `salvar_orcamento_com_itens` desde a 0021, e mudar isso
 * faria os dois discordarem.
 */
create or replace function public.total_do_orcamento_antes_de_gravar()
returns trigger
language plpgsql
as $$
declare
  v_itens numeric(12, 2);
  v_abatimento numeric(12, 2);
begin
  v_itens := public.soma_dos_itens_do_orcamento(new.id);

  /*
   * O desconto é lido do jeito que a pessoa o escolheu, igual à conta da OS
   * (`total_da_os`, 0026). Usar só a coluna em reais deixaria uma fresta boba:
   * quem gravasse `desconto_percentual = 90` sem mexer na outra teria um
   * orçamento impresso anunciando noventa por cento e cobrando o preço cheio.
   *
   * Com as duas tabelas na mesma regra, a ordem de serviço nasce com o mesmo
   * número do orçamento por construção, e não por causa da cópia.
   */
  v_abatimento := case
    when new.desconto_percentual is not null
      then v_itens * least(greatest(new.desconto_percentual, 0), 100) / 100
    else coalesce(new.desconto, 0)
  end;

  new.valor_total := greatest(v_itens - least(v_abatimento, v_itens), 0)::numeric(12, 2);
  return new;
end;
$$;

drop trigger if exists orcamentos_total_do_servidor on public.orcamentos;
create trigger orcamentos_total_do_servidor
  before insert or update on public.orcamentos
  for each row execute function public.total_do_orcamento_antes_de_gravar();

-- Definer pela mesma razão da 0026: o total é invariante do sistema, e não
-- edição de ninguém. Sem isto, quem mexe num item dispararia um update em
-- orçamentos que a política dele poderia recusar.
create or replace function public.recalcular_total_do_orcamento(p_orcamento uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.orcamentos set valor_total = 0 where id = p_orcamento;
$$;

comment on function public.recalcular_total_do_orcamento is
  'Toca o orçamento para o gatilho refazer a conta. O zero é irrelevante: o BEFORE sobrescreve.';

create or replace function public.total_do_orcamento_apos_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalcular_total_do_orcamento(old.orcamento_id);
    return old;
  end if;

  perform public.recalcular_total_do_orcamento(new.orcamento_id);
  if tg_op = 'UPDATE' and old.orcamento_id is distinct from new.orcamento_id then
    perform public.recalcular_total_do_orcamento(old.orcamento_id);
  end if;
  return new;
end;
$$;

drop trigger if exists orcamento_itens_recalcular_total on public.orcamento_itens;
create trigger orcamento_itens_recalcular_total
  after insert or update or delete on public.orcamento_itens
  for each row execute function public.total_do_orcamento_apos_item();

-- O total da ordem de serviço ---------------------------------------------------
/*
 * Aqui a coluna não é recalculada, é protegida.
 *
 * Três funções escrevem nela com razão: `recalcular_total_da_os`, que é o
 * gatilho dos itens desde a 0026; a aprovação, que copia o total aprovado ao
 * centavo; e o serviço antigo. As três marcam a chave. Qualquer outra escrita —
 * um PATCH da API, por exemplo — é recusada, e o valor antigo permanece.
 *
 * Na inserção o total nasce zero e os itens o levantam pelo gatilho, então não
 * há caminho legítimo em que alguém precise informá-lo de fora.
 */
create or replace function public.total_da_os_e_do_servidor()
returns trigger
language plpgsql
as $$
begin
  -- Duas chaves: a desta migração, e a que o serviço antigo (0060) já marcava
  -- em volta do mesmo update. Reaproveitar a dele evita reescrever uma função
  -- de cento e trinta linhas para mudar zero linhas de comportamento.
  if current_setting('app.total_calculado', true) = 'sim'
     or current_setting('app.lancamento_historico', true) = 'sim' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.valor_total := 0;
    return new;
  end if;

  if new.valor_total is distinct from old.valor_total then
    raise exception
      'O valor da ordem de serviço é calculado pelo sistema, a partir dos itens e do desconto.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists ordens_servico_total_do_servidor on public.ordens_servico;
create trigger ordens_servico_total_do_servidor
  before insert or update on public.ordens_servico
  for each row execute function public.total_da_os_e_do_servidor();

-- Quem calcula, marca a chave ----------------------------------------------------
create or replace function public.recalcular_total_da_os(p_ordem_servico_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.total_calculado', 'sim', true);
  update public.ordens_servico
     set valor_total = public.total_da_os(p_ordem_servico_id)
   where id = p_ordem_servico_id;
  perform set_config('app.total_calculado', '', true);
end;
$$;

/*
 * A aprovação, marcando a chave no update que casa o centavo.
 *
 * Corpo igual ao da 0068 — a diferença são as duas linhas de `set_config` em
 * volta do `update ... set valor_total`. Aquele update existe desde a 0026 para
 * a OS nascer com o mesmo centavo do orçamento aprovado, e é escrita de quem
 * calculou: é ele que a chave descreve.
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
  v_base numeric(12, 2);
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

  -- A comissão do indicador ---------------------------------------------------
  if v_orc.indicador_id is not null then
    select coalesce(i.percentual, o.comissao_indicador_percentual)
      into v_percentual
    from public.indicadores i
    join public.oficinas o on o.id = i.oficina_id
    where i.id = v_orc.indicador_id;

    -- A base continua vindo dos itens (0068). Agora `valor_total` também é
    -- calculado pelo banco, então os dois números são o mesmo — e a conta fica
    -- escrita aqui para quem ler esta função não precisar confiar na outra.
    select greatest(coalesce(sum(valor_total), 0) - coalesce(v_orc.desconto, 0), 0)
      into v_base
    from public.orcamento_itens
    where orcamento_id = v_orc.id;

    perform set_config('app.comissao_da_aprovacao', 'sim', true);

    insert into public.comissoes
      (oficina_id, indicador_id, orcamento_id, ordem_servico_id, base, percentual, valor)
    values
      (v_orc.oficina_id, v_orc.indicador_id, v_orc.id, v_os_id,
       v_base, v_percentual,
       round(v_base * v_percentual / 100, 2));

    perform set_config('app.comissao_da_aprovacao', '', true);
  end if;

  return v_os_id;
end;
$$;

/*
 * As duas funções de recálculo saem do alcance da API.
 *
 * Elas são `security definer`, então rodam com poderes de dono do banco e não
 * enxergam RLS. Chamadas pelos gatilhos — que também são definer — isso é o que
 * se quer. Expostas pelo PostgREST, viravam uma maneira de escrever numa linha
 * de outra oficina, ainda que só para pôr nela o número certo. O mesmo cuidado
 * que a 0019 teve com `recalcular_estoque`.
 *
 * Repare que `soma_dos_itens_do_orcamento` NÃO entra: ela é chamada pelo gatilho
 * BEFORE, que é invoker, então quem salva um orçamento precisa poder executá-la.
 */
revoke all on function public.recalcular_total_do_orcamento(uuid) from public, anon;
revoke all on function public.recalcular_total_da_os(uuid) from public, anon;

select public.conferir_fechadura();
