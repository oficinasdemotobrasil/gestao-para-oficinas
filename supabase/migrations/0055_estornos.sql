-- 0055 — Os estornos: o que devolver, e o que já foi devolvido
--
-- Estorno é a operação que mais dá problema quando fica só na cabeça de
-- alguém. Envolve dinheiro saindo, prazo legal e cliente irritado — e acontece
-- raramente o bastante para ninguém lembrar do processo.
--
-- Duas fontes dizem o que aconteceu, e elas se completam:
--
--   1. O provedor avisa quando um estorno é feito (PAYMENT_REFUNDED, e o campo
--      `refunds` dentro da própria cobrança). Essa é a verdade, e não depende
--      de ninguém marcar nada.
--   2. A plataforma marca à mão quando o aviso se perdeu, ou quando decidiu
--      NÃO estornar. Sem isso a lista de pendências nunca esvazia e vira ruído
--      que todo mundo aprende a ignorar.
--
-- A lista não decide por você: mostra quem tem direito ao arrependimento de
-- sete dias e quanto tempo passou. O resto é julgamento.

create table if not exists public.estornos (
  /* O identificador da cobrança no provedor. É a chave natural: uma cobrança
     só se estorna uma vez. */
  cobranca_id text primary key,
  oficina_id uuid not null references public.oficinas(id) on delete cascade,
  valor numeric(10, 2),
  situacao text not null default 'feito'
    check (situacao in ('feito', 'dispensado')),
  observacao text,
  marcado_por text,
  marcado_em timestamptz not null default now()
);

comment on table public.estornos is
  'O que a plataforma decidiu sobre cada estorno. O provedor manda a verdade; isto guarda a decisão.';
comment on column public.estornos.situacao is
  '"feito" = devolvido. "dispensado" = decidimos não devolver, e o motivo fica na observação.';

alter table public.estornos enable row level security;

-- Deny-all: isto é conversa entre a plataforma e o provedor. A oficina vê o
-- dinheiro voltar na conta dela; não precisa ver a nossa anotação.
drop policy if exists "estornos sao da plataforma" on public.estornos;
create policy "estornos sao da plataforma"
  on public.estornos for select to authenticated using (false);

-- Onde mora a cobrança dentro do evento -----------------------------------------
--
-- O webhook guarda o envelope inteiro, com a cobrança em `payment`. Mas o
-- `reprocessar` da plataforma (quando o webhook ainda não existia) guardou a
-- cobrança crua, no primeiro nível. As duas formas são reais e estão no banco
-- de produção — ignorar a segunda esconderia justamente as cobranças antigas,
-- que são as mais prováveis de precisar de estorno.
create or replace function public.cobranca_do_evento(conteudo jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when conteudo -> 'payment' ->> 'id' is not null then conteudo -> 'payment'
    when conteudo ->> 'object' = 'payment' then conteudo
    else null
  end;
$$;

-- A lista ----------------------------------------------------------------------
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

  -- Cada cobrança paga, uma vez só. O provedor manda "criada", "confirmada" e
  -- "recebida" para a mesma cobrança; somar as três triplicaria tudo.
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
      -- O provedor carrega os estornos dentro da própria cobrança. Quando o
      -- evento de estorno se perde, isto ainda conta a verdade.
      (c -> 'refunds' is not null and jsonb_typeof(c -> 'refunds') = 'array'
        and jsonb_array_length(c -> 'refunds') > 0) as tem_estorno_no_provedor
    from eventos
    where c is not null
      and c ->> 'status' in ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'REFUNDED')
      and oficina_id is not null
    -- A leitura mais recente da mesma cobrança ganha: é ela que sabe do estorno.
    order by c ->> 'id', criado_em desc
  ),

  -- O provedor avisou que devolveu, em evento próprio.
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
      -- Por que esta cobrança está nesta lista, em uma frase.
      'motivo', case
        when d.cobranca_id is not null or p.tem_estorno_no_provedor
          then 'o provedor confirmou a devolução'
        when m.cobranca_id is not null
          then coalesce(m.observacao, 'marcado pela plataforma') || ' — ' || coalesce(m.marcado_por, 'plataforma')
        when a.cancelada_em is null
          then 'assinatura ativa, ninguém pediu devolução'
        when (a.cancelada_em::date - p.pago_em) <= 7
          then 'cancelou ' || (a.cancelada_em::date - p.pago_em) || ' dia(s) depois de pagar: tem direito ao arrependimento'
        else 'cancelou ' || (a.cancelada_em::date - p.pago_em) || ' dias depois de pagar — devolver é decisão sua'
      end,
      'tem_direito', (a.cancelada_em is not null and (a.cancelada_em::date - p.pago_em) <= 7),
      -- Só se desfaz o que nós marcamos. O que o provedor confirmou é fato.
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
    -- A assinatura DESTA cobrança, não a última da oficina. Uma oficina pode
    -- ter assinado, cancelado e assinado de novo; só a primeira gera estorno.
    left join public.assinaturas a on a.id_externo_assinatura = p.assinatura_externa
  ) x;
$$;

comment on function public.plataforma_estornos is
  'Cobranças pagas e o que falta devolver. Só a service_role executa.';

create or replace function public.plataforma_marcar_estorno(
  p_cobranca_id text,
  p_oficina uuid,
  p_valor numeric,
  p_situacao text,
  p_observacao text,
  p_quem text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.estornos
    (cobranca_id, oficina_id, valor, situacao, observacao, marcado_por, marcado_em)
  values (p_cobranca_id, p_oficina, p_valor, p_situacao, p_observacao, p_quem, now())
  on conflict (cobranca_id) do update
    set situacao = excluded.situacao,
        observacao = excluded.observacao,
        marcado_por = excluded.marcado_por,
        marcado_em = now();
$$;

-- Desmarcar. Errar ao marcar é fácil, e sem isto o erro fica para sempre.
create or replace function public.plataforma_desmarcar_estorno(p_cobranca_id text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.estornos where cobranca_id = p_cobranca_id;
$$;

revoke execute on function public.plataforma_estornos() from public, anon, authenticated;
revoke execute on function public.plataforma_desmarcar_estorno(text) from public, anon, authenticated;
revoke execute on function public.plataforma_marcar_estorno(text, uuid, numeric, text, text, text)
  from public, anon, authenticated;

select public.conferir_fechadura();
