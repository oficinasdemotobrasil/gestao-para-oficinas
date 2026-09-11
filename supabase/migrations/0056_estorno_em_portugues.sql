-- 0056 — A frase do estorno, em português de gente
--
-- A 0055 montava "cancelou 0 dia(s) depois de pagar". O "(s)" é gambiarra de
-- programador aparecendo na tela, e "0 dias" é pior: ninguém fala assim. Quem
-- vai ler isso está decidindo se devolve dinheiro — a frase tem que ser clara
-- na primeira leitura, não decifrável.
--
-- Só troca o texto. A lógica de quem tem direito é a mesma.

create or replace function public.dias_em_portugues(dias int)
returns text
language sql
immutable
as $$
  select case
    when dias <= 0 then 'no mesmo dia'
    when dias = 1 then 'um dia depois'
    else dias || ' dias depois'
  end;
$$;

create or replace function public.plataforma_estornos()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with eventos as (
    select e.oficina_id, e.tipo, e.criado_em, public.cobranca_do_evento(e.conteudo) as c
    from public.eventos_asaas e
  ),

  pagas as (
    select distinct on (c ->> 'id')
      c ->> 'id' as cobranca_id,
      (c ->> 'value')::numeric as valor,
      c ->> 'invoiceUrl' as endereco,
      c ->> 'transactionReceiptUrl' as recibo,
      c ->> 'subscription' as assinatura_externa,
      c ->> 'billingType' as forma,
      oficina_id,
      coalesce((c ->> 'paymentDate')::date, criado_em::date) as pago_em,
      (c -> 'refunds' is not null and jsonb_typeof(c -> 'refunds') = 'array'
        and jsonb_array_length(c -> 'refunds') > 0) as tem_estorno_no_provedor
    from eventos
    where c is not null
      and c ->> 'status' in ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'REFUNDED')
      and oficina_id is not null
    order by c ->> 'id', criado_em desc
  ),

  devolvidas as (
    select distinct public.cobranca_do_evento(e.conteudo) ->> 'id' as cobranca_id
    from public.eventos_asaas e
    where e.tipo in ('PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED')
  )

  select coalesce(jsonb_agg(t order by (t ->> 'prioridade')::int, t ->> 'pago_em' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'cobranca_id', p.cobranca_id,
      'oficina', o.nome,
      'oficina_id', o.id,
      'valor', p.valor,
      'forma', p.forma,
      'pago_em', p.pago_em,
      'endereco_no_provedor', coalesce(p.endereco, p.recibo),
      'situacao', case
        when d.cobranca_id is not null or p.tem_estorno_no_provedor then 'devolvido'
        when m.situacao = 'feito' then 'devolvido'
        when m.situacao = 'dispensado' then 'dispensado'
        when a.cancelada_em is not null then 'pendente'
        else 'sem_pedido'
      end,
      'motivo', case
        when d.cobranca_id is not null or p.tem_estorno_no_provedor
          then 'o provedor confirmou a devolução'
        when m.cobranca_id is not null
          then coalesce(m.observacao, 'marcado pela plataforma') || ' — ' || coalesce(m.marcado_por, 'plataforma')
        when a.cancelada_em is null
          then 'assinatura ativa, ninguém pediu devolução'
        when (a.cancelada_em::date - p.pago_em) <= 7
          then 'cancelou ' || public.dias_em_portugues((a.cancelada_em::date - p.pago_em)::int)
               || ' — tem direito ao arrependimento'
        else 'cancelou ' || public.dias_em_portugues((a.cancelada_em::date - p.pago_em)::int)
             || ' — devolver é decisão sua'
      end,
      'tem_direito', (a.cancelada_em is not null and (a.cancelada_em::date - p.pago_em) <= 7),
      'marcado_pela_plataforma', (m.cobranca_id is not null),
      'cancelada_em', a.cancelada_em,
      'prioridade', case
        when d.cobranca_id is not null or p.tem_estorno_no_provedor or m.cobranca_id is not null then 4
        when a.cancelada_em is not null and (a.cancelada_em::date - p.pago_em) <= 7 then 1
        when a.cancelada_em is not null then 2
        else 3
      end
    ) as t
    from pagas p
    join public.oficinas o on o.id = p.oficina_id
    left join devolvidas d on d.cobranca_id = p.cobranca_id
    left join public.estornos m on m.cobranca_id = p.cobranca_id
    left join public.assinaturas a on a.id_externo_assinatura = p.assinatura_externa
  ) x;
$$;

revoke execute on function public.plataforma_estornos() from public, anon, authenticated;

select public.conferir_fechadura();
