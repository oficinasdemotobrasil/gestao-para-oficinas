-- 0083 — Desconto na hora de receber
--
-- O pedido veio de uma oficina: o cliente pagou à vista no PIX e ganhou um
-- desconto. Até aqui, o desconto só existia no orçamento, na hora de montar.
-- Na hora de receber, registrar R$ 450 numa conta de R$ 500 deixava a conta
-- aberta com R$ 50 — e o cliente aparecia como devendo em todo lugar.
--
-- Como o desconto é guardado é a decisão que segura o resto do sistema:
-- o VALOR DA CONTA passa a ser o valor com desconto, e o quanto se descontou
-- fica ao lado, em `desconto`. Assim saldo, "quem está devendo", painel,
-- PIX e planilhas — tudo que já calcula `valor - valor_recebido` — continua
-- certo sem mudar uma linha. O valor original não se perde: é
-- `valor + desconto`. (A 0034 avisou que mudar o valor apagaria "de quanto era
-- a dívida"; com a coluna ao lado, não apaga.)
--
-- O orçamento e a ordem de serviço NÃO mudam: o que foi aprovado continua
-- registrado como foi aprovado. O desconto é do pagamento.
--
-- Decisões do Ed (07/10/2026):
--   1. só o dono dá desconto — o financeiro já é só dele (RLS da 0039), e a
--      função confere de novo;
--   2. a comissão do indicador cai junto: a base diminui o mesmo tanto. Se a
--      comissão já foi paga, ela não muda, e a tela avisa;
--   3. o desconto aparece no PDF da OS que vai para o cliente.
--
-- Todo desconto (e todo desfazer) fica no histórico de correções da 0071,
-- com quem, quando e por quê.

-- Colunas ------------------------------------------------------------------
alter table public.contas_receber
  add column if not exists desconto numeric(12, 2) not null default 0
    check (desconto >= 0),
  add column if not exists motivo_do_desconto text;

comment on column public.contas_receber.desconto is
  'Desconto dado na hora de receber. O valor da conta já está com ele abatido; o original é valor + desconto.';
comment on column public.contas_receber.motivo_do_desconto is
  'Por que o desconto foi dado (ex.: pagou à vista no PIX). Vai para o PDF da OS.';

-- Dinheiro em português ----------------------------------------------------
/*
 * `to_char` com G e D segue o idioma do servidor, e o Supabase roda em inglês
 * ("R$ 1,234.50"). Mesma saída da 0072: formata no padrão americano e troca os
 * dois separadores.
 */
create or replace function public.em_reais(p_valor numeric)
returns text
language sql
immutable
as $$
  select 'R$ ' || translate(to_char(p_valor, 'FM999,999,990.00'), ',.', '.,');
$$;

-- Dar desconto -------------------------------------------------------------
/*
 * Abate o desconto do que falta receber e, se pedido, já recebe o resto —
 * tudo numa transação só: ou fica o desconto E a baixa, ou nada.
 *
 * Devolve a conta e o que aconteceu com a comissão do indicador:
 *   'ajustada' — estava a pagar e caiu junto;
 *   'ja_paga'  — já tinha sido paga ao indicador, então não mudou;
 *   null       — a conta não tem comissão ligada.
 */
create or replace function public.dar_desconto(
  p_conta_id uuid,
  p_desconto numeric,
  p_motivo text,
  p_receber boolean default false,
  p_valor_recebido numeric default null,
  p_data date default current_date,
  p_forma_pagamento text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_conta public.contas_receber;
  v_falta numeric(12, 2);
  v_desconto numeric(12, 2) := round(coalesce(p_desconto, 0), 2);
  v_antes text;
  v_comissao public.comissoes;
  v_sobre_comissao text := null;
begin
  -- O financeiro já é só do dono pela RLS; aqui a regra fica escrita.
  if not public.eh_admin() then
    raise exception 'Só o dono da oficina pode dar desconto.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_motivo), '') = '' or length(trim(p_motivo)) < 3 then
    raise exception 'Diga o motivo do desconto — ele aparece para o cliente no PDF da OS.'
      using errcode = 'check_violation';
  end if;
  if v_desconto <= 0 then
    raise exception 'Informe um desconto maior que zero.' using errcode = 'check_violation';
  end if;

  select * into v_conta from public.contas_receber where id = p_conta_id for update;
  if not found then
    raise exception 'Conta não encontrada.' using errcode = 'no_data_found';
  end if;
  if v_conta.status = 'cancelada' then
    raise exception 'Esta conta foi cancelada.' using errcode = 'check_violation';
  end if;
  if v_conta.status = 'paga' then
    raise exception 'Esta conta já foi paga. Desconto se dá antes de receber.'
      using errcode = 'check_violation';
  end if;

  v_falta := v_conta.valor - v_conta.valor_recebido;
  if v_desconto > v_falta then
    raise exception 'O desconto (%) passa do que falta receber (%).',
      public.em_reais(v_desconto), public.em_reais(v_falta)
      using errcode = 'check_violation';
  end if;

  v_antes := public.em_reais(v_conta.valor);

  update public.contas_receber
     set valor = valor - v_desconto,
         desconto = desconto + v_desconto,
         motivo_do_desconto = trim(p_motivo),
         -- O desconto que cobre todo o saldo quita a conta (ex.: já tinha
         -- recebido R$ 450 de uma de R$ 500 e deu os R$ 50).
         status = case when valor_recebido >= valor - v_desconto
                       then 'paga'::public.status_conta else status end,
         data_pagamento = case when valor_recebido >= valor - v_desconto
                               then coalesce(data_pagamento, p_data) else data_pagamento end
   where id = p_conta_id
  returning * into v_conta;

  -- A comissão cai junto (decisão 2). Uma OS tem no máximo uma comissão.
  if v_conta.ordem_servico_id is not null then
    select * into v_comissao from public.comissoes
     where ordem_servico_id = v_conta.ordem_servico_id
       and status <> 'cancelada'
     for update;
    if found then
      if v_comissao.status = 'a_pagar' then
        update public.comissoes
           set base = greatest(base - v_desconto, 0),
               valor = round(greatest(base - v_desconto, 0) * percentual / 100, 2)
         where id = v_comissao.id;
        v_sobre_comissao := 'ajustada';
      else
        v_sobre_comissao := 'ja_paga';
      end if;
    end if;
  end if;

  perform set_config('app.correcao_financeira', 'sim', true);
  insert into public.correcoes_financeiras
    (oficina_id, conta_receber_id, usuario_id, de, para, motivo)
  values
    (v_conta.oficina_id, v_conta.id, auth.uid(), v_antes,
     public.em_reais(v_conta.valor)
       || ' (desconto de ' || public.em_reais(v_desconto) || ')',
     'Desconto: ' || trim(p_motivo));
  perform set_config('app.correcao_financeira', '', true);

  -- E, se pedido, recebe o que sobrou — pela função de sempre.
  if p_receber and v_conta.status <> 'paga' then
    v_conta := public.receber_conta(p_conta_id, p_valor_recebido, p_data, p_forma_pagamento);
  end if;

  return jsonb_build_object('conta', to_jsonb(v_conta), 'comissao', v_sobre_comissao);
end;
$$;

-- Desfazer o desconto ------------------------------------------------------
/*
 * Volta a conta ao valor original. Se o que já entrou não cobre mais o valor,
 * a conta reabre: o cliente volta a dever a diferença. A comissão que tinha
 * caído com o desconto volta junto, se ainda não foi paga.
 */
create or replace function public.desfazer_desconto(p_conta_id uuid, p_motivo text)
returns jsonb
language plpgsql
as $$
declare
  v_conta public.contas_receber;
  v_desconto numeric(12, 2);
  v_antes text;
  v_comissao public.comissoes;
  v_sobre_comissao text := null;
begin
  if not public.eh_admin() then
    raise exception 'Só o dono da oficina pode desfazer um desconto.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_motivo), '') = '' or length(trim(p_motivo)) < 3 then
    raise exception 'Diga o motivo — fica registrado no histórico da conta.'
      using errcode = 'check_violation';
  end if;

  select * into v_conta from public.contas_receber where id = p_conta_id for update;
  if not found then
    raise exception 'Conta não encontrada.' using errcode = 'no_data_found';
  end if;
  if v_conta.status = 'cancelada' then
    raise exception 'Esta conta foi cancelada.' using errcode = 'check_violation';
  end if;
  v_desconto := v_conta.desconto;
  if v_desconto <= 0 then
    raise exception 'Esta conta não tem desconto.' using errcode = 'check_violation';
  end if;

  v_antes := public.em_reais(v_conta.valor)
    || ' (desconto de ' || public.em_reais(v_desconto) || ')';

  update public.contas_receber
     set valor = valor + v_desconto,
         desconto = 0,
         motivo_do_desconto = null,
         status = case when valor_recebido >= valor + v_desconto
                       then 'paga'::public.status_conta else 'aberta'::public.status_conta end,
         data_pagamento = case when valor_recebido >= valor + v_desconto
                               then data_pagamento else null end
   where id = p_conta_id
  returning * into v_conta;

  if v_conta.ordem_servico_id is not null then
    select * into v_comissao from public.comissoes
     where ordem_servico_id = v_conta.ordem_servico_id
       and status <> 'cancelada'
     for update;
    if found then
      if v_comissao.status = 'a_pagar' then
        update public.comissoes
           set base = base + v_desconto,
               valor = round((base + v_desconto) * percentual / 100, 2)
         where id = v_comissao.id;
        v_sobre_comissao := 'ajustada';
      else
        v_sobre_comissao := 'ja_paga';
      end if;
    end if;
  end if;

  perform set_config('app.correcao_financeira', 'sim', true);
  insert into public.correcoes_financeiras
    (oficina_id, conta_receber_id, usuario_id, de, para, motivo)
  values
    (v_conta.oficina_id, v_conta.id, auth.uid(), v_antes,
     public.em_reais(v_conta.valor) || ' (sem desconto)',
     'Desconto desfeito: ' || trim(p_motivo));
  perform set_config('app.correcao_financeira', '', true);

  return jsonb_build_object('conta', to_jsonb(v_conta), 'comissao', v_sobre_comissao);
end;
$$;

-- O desconto no PDF da OS --------------------------------------------------
/*
 * O PDF da OS é gerado por quem atende (dono ou balcão), e o balcão não lê o
 * financeiro (RLS da 0039). Esta função entrega só o necessário para o PDF —
 * quanto foi descontado e por quê —, e só para quem enxerga a OS no balcão.
 * O mecânico, que não vê preço, não recebe nada.
 */
create or replace function public.desconto_no_pagamento_da_os(p_os uuid)
returns table (desconto numeric, motivo text)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(c.desconto), 0)::numeric,
         string_agg(distinct c.motivo_do_desconto, '; ')
    from public.contas_receber c
   where c.ordem_servico_id = p_os
     and c.oficina_id = public.oficina_do_usuario()
     and c.status <> 'cancelada'
     and c.desconto > 0
     and public.eh_atendimento();
$$;

revoke all on function public.dar_desconto(uuid, numeric, text, boolean, numeric, date, text)
  from public, anon, authenticated;
revoke all on function public.desfazer_desconto(uuid, text)
  from public, anon, authenticated;
revoke all on function public.desconto_no_pagamento_da_os(uuid)
  from public, anon, authenticated;

grant execute on function public.dar_desconto(uuid, numeric, text, boolean, numeric, date, text)
  to authenticated;
grant execute on function public.desfazer_desconto(uuid, text) to authenticated;
grant execute on function public.desconto_no_pagamento_da_os(uuid) to authenticated;

select public.conferir_fechadura();
