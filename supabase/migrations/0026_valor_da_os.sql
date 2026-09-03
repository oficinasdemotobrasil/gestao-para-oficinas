-- 0026 — A ordem de serviço passa a saber o próprio valor
--
-- Até aqui a OS copiava os itens do orçamento e mais nada. O desconto ficava
-- só no orçamento, e a tela da ordem tinha de ir buscá-lo lá para não mostrar
-- um número maior do que o cliente aprovou.
--
-- Isso para de funcionar na Fase 3, em que a OS é editada durante o serviço:
-- entra uma peça, sai outra, e o orçamento deixa de descrever o que está sendo
-- feito. A partir daqui o valor da OS é a verdade, e o orçamento é histórico.
--
-- O desconto é guardado do jeito que a pessoa o escolheu: 'valor' guarda reais,
-- 'percentual' guarda o percentual — senão, ao acrescentar uma peça no meio do
-- serviço, um desconto de 10% viraria um valor fixo e encolheria sozinho.

alter table public.ordens_servico
  add column if not exists desconto numeric(12, 2) not null default 0
    check (desconto >= 0),
  -- Texto com check, e não um enum: enum novo exige transação própria para ser
  -- usado (foi o que obrigou a migration 0016 a existir sozinha), e aqui não
  -- compensa esse custo por dois valores que não vão crescer.
  add column if not exists desconto_tipo text
    check (desconto_tipo is null or desconto_tipo in ('valor', 'percentual')),
  add column if not exists valor_total numeric(12, 2) not null default 0
    check (valor_total >= 0);

comment on column public.ordens_servico.desconto is
  'O número que a pessoa digitou. Leia junto com desconto_tipo: em reais, ou em porcentagem sobre a soma dos itens.';
comment on column public.ordens_servico.valor_total is
  'Valor da ordem, já com o desconto. Fonte de verdade do financeiro — o orçamento é histórico.';

-- Cálculo -------------------------------------------------------------------
-- A conta é a mesma do orçamento (0021), na mesma ordem e sem arredondar no
-- meio: é isso que faz a OS nascer com o centavo idêntico ao que o cliente
-- aprovou. Mudar uma das duas e não mudar a outra faz as duas discordarem.
create or replace function public.total_da_os(p_ordem_servico_id uuid)
returns numeric
language sql
stable
as $$
  with soma as (
    select coalesce(sum(valor_total), 0) as itens
    from public.os_itens
    where ordem_servico_id = p_ordem_servico_id
  ),
  os as (
    select desconto, desconto_tipo
    from public.ordens_servico
    where id = p_ordem_servico_id
  )
  select greatest(
    soma.itens - least(
      case
        when os.desconto_tipo = 'percentual'
          then soma.itens * least(greatest(os.desconto, 0), 100) / 100
        else os.desconto
      end,
      soma.itens
    ),
    0
  )::numeric(12, 2)
  from soma, os;
$$;

-- Definer de propósito: o total é invariante do sistema, não edição de
-- ninguém. Sem isto, o mecânico que marca um item como executado dispararia um
-- update em ordens_servico que a política dele poderia recusar, e o item
-- deixaria de ser salvo por causa de uma conta que ele nem pediu.
create or replace function public.recalcular_total_da_os(p_ordem_servico_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ordens_servico
     set valor_total = public.total_da_os(p_ordem_servico_id)
   where id = p_ordem_servico_id;
$$;

create or replace function public.total_da_os_apos_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Gatilho por linha, e não por comando: a inserção em lote de uma OS tem
  -- dezena de itens, não milhares, e por linha o código fica sem tabela de
  -- transição para manter.
  if tg_op = 'DELETE' then
    perform public.recalcular_total_da_os(old.ordem_servico_id);
    return old;
  end if;

  perform public.recalcular_total_da_os(new.ordem_servico_id);
  -- Item que muda de ordem (não deveria acontecer) deixaria a antiga errada.
  if tg_op = 'UPDATE' and old.ordem_servico_id is distinct from new.ordem_servico_id then
    perform public.recalcular_total_da_os(old.ordem_servico_id);
  end if;
  return new;
end;
$$;

drop trigger if exists os_itens_recalcular_total on public.os_itens;
create trigger os_itens_recalcular_total
  after insert or update or delete on public.os_itens
  for each row execute function public.total_da_os_apos_item();

-- Aprovação -----------------------------------------------------------------
-- Passa a levar o desconto junto, e a gravar o total exatamente como estava no
-- orçamento aprovado.
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
     km_entrada, garantia_ate, observacoes,
     desconto, desconto_tipo, valor_total)
  values
    (v_orc.oficina_id, v_orc.id, v_orc.cliente_id, v_orc.moto_id, p_responsavel_id,
     'aberta', v_orc.km_registrado, current_date + v_orc.garantia_dias, v_orc.observacoes,
     -- O orçamento guarda o desconto sempre em reais, e o percentual à parte
     -- como lembrança de como foi escolhido. A OS guarda o que foi digitado.
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

  -- O gatilho acima já recalculou. Aqui o valor aprovado é gravado por cima,
  -- ao centavo: é ele que o cliente aceitou, e é ele que vai para a conta a
  -- receber. Enquanto ninguém mexer nos itens, os dois números são o mesmo.
  update public.ordens_servico
     set valor_total = v_orc.valor_total
   where id = v_os_id;

  update public.orcamentos set status = 'aprovado' where id = p_orcamento_id;

  return v_os_id;
end;
$$;

-- Ordens que já existiam ----------------------------------------------------
-- Preenche o que nasceu antes destas colunas. Roda uma vez; rodar de novo não
-- estraga nada, porque reescreve com o mesmo valor.
update public.ordens_servico os
   set desconto = case when o.desconto_percentual is not null
                       then o.desconto_percentual else coalesce(o.desconto, 0) end,
       desconto_tipo = case when o.desconto_percentual is not null
                            then 'percentual' else 'valor' end,
       valor_total = o.valor_total
  from public.orcamentos o
 where o.id = os.orcamento_id;

-- OS aberta na mão, sem orçamento: o valor é a soma dos itens dela.
update public.ordens_servico os
   set desconto_tipo = coalesce(os.desconto_tipo, 'valor'),
       valor_total = public.total_da_os(os.id)
 where os.orcamento_id is null;
