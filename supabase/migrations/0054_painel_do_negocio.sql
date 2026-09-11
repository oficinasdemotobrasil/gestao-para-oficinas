-- 0054 — O painel do negócio
--
-- Um painel que só mostra totais não serve para nada: quem administra a
-- plataforma não precisa saber quantas oficinas existem, precisa saber **o que
-- fazer hoje**. Por isso cada número aqui ou é uma decisão de negócio, ou é
-- uma lista de gente que precisa de atenção.
--
-- Três cuidados que valem explicar:
--
-- 1. A receita recorrente conta quem TEM CONTRATO, não quem tem acesso. São
--    coisas diferentes: uma oficina liberada sem prazo — cortesia, piloto —
--    aparece como ativa e não paga nada. Contá-la seria inventar receita, que
--    é o jeito mais rápido de acreditar num negócio que não existe.
--
-- 2. O que entrou no mês é contado por COBRANÇA, não por evento. O provedor
--    manda "confirmado" e "recebido" para a mesma cobrança, em momentos
--    diferentes; somar os dois dobraria o faturamento.
--
-- 3. A cidade vem digitada à mão pela oficina. Agrupamos como veio, sem
--    inventar padronização — um mapa errado é pior do que nenhum.

create or replace function public.plataforma_painel()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  mes as (select date_trunc('month', now()) as inicio),

  situacoes as (
    select o.id, o.nome, o.cidade, o.plano, o.criado_em, o.acesso_ate,
           o.teste_ate, o.exclusao_pedida_em,
           public.situacao_da_oficina(o.id) as situacao
    from public.oficinas o
  ),

  -- Cada cobrança contada uma vez, mesmo tendo gerado dois eventos.
  cobrancas as (
    select distinct on (e.conteudo -> 'payment' ->> 'id')
      e.conteudo -> 'payment' ->> 'id' as cobranca,
      (e.conteudo -> 'payment' ->> 'value')::numeric as valor,
      e.oficina_id,
      e.criado_em
    from public.eventos_asaas e
    where e.tipo in ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED')
      and e.conteudo -> 'payment' ->> 'id' is not null
    order by e.conteudo -> 'payment' ->> 'id', e.criado_em
  ),

  -- Quem tem contrato de verdade. É daqui que sai a receita, e não da lista
  -- de quem está com o acesso aberto.
  assinantes as (
    select distinct a.oficina_id, a.plano
    from public.assinaturas a
    where a.situacao = 'ativa'
  ),

  ultimo_acesso as (
    select u.oficina_id, max(au.last_sign_in_at) as quando
    from public.usuarios u
    join auth.users au on au.id = u.id
    where u.ativo
    group by u.oficina_id
  )

  select jsonb_build_object(
    'dinheiro', jsonb_build_object(
      -- Só quem paga de fato entra na recorrente.
      'receita_recorrente', coalesce((
        select sum(p.preco_mensal)
        from assinantes a
        join public.planos p on p.id = a.plano
        join situacoes s on s.id = a.oficina_id
        where s.situacao = 'ativa'
      ), 0),
      -- O que está prestes a parar de entrar, se ninguém fizer nada: quem tem
      -- contrato e parou de pagar.
      'em_risco', coalesce((
        select sum(p.preco_mensal)
        from assinantes a
        join public.planos p on p.id = a.plano
        join situacoes s on s.id = a.oficina_id
        where s.situacao in ('atrasada', 'bloqueada')
      ), 0),
      'recebido_no_mes', coalesce((
        select sum(c.valor) from cobrancas c, mes where c.criado_em >= mes.inicio
      ), 0),
      'ticket_medio', coalesce((
        select round(avg(p.preco_mensal), 2)
        from assinantes a join public.planos p on p.id = a.plano
        where p.preco_mensal > 0
      ), 0),
      'por_plano', coalesce((
        select jsonb_agg(t order by t->>'ordem')
        from (
          select jsonb_build_object(
            'plano', p.nome, 'ordem', p.ordem,
            'oficinas', count(s.id),
            'receita', coalesce((
              select sum(p2.preco_mensal)
              from assinantes a2 join public.planos p2 on p2.id = a2.plano
              where a2.plano = p.id
            ), 0)
          ) as t
          from public.planos p
          left join situacoes s on s.plano = p.id
          group by p.id, p.nome, p.ordem
        ) x
      ), '[]'::jsonb)
    ),

    'clientes', jsonb_build_object(
      'total', (select count(*) from situacoes),
      'por_situacao', coalesce((
        select jsonb_object_agg(situacao, quantas)
        from (select situacao, count(*) as quantas from situacoes group by situacao) t
      ), '{}'::jsonb),
      'novas_no_mes', (select count(*) from situacoes s, mes where s.criado_em >= mes.inicio),
      -- Dos que já passaram pelo teste, quantos viraram pagantes.
      'com_contrato', (select count(*) from assinantes),
      'ja_assinaram_alguma_vez', (
        select count(distinct a.oficina_id) from public.assinaturas a
      ),
      'cancelamentos_no_mes', (
        select count(*) from public.assinaturas a, mes
        where a.cancelada_em >= mes.inicio
      )
    ),

    -- O que a oficina disse ao sair. É a informação que diz o que consertar,
    -- e o provedor de pagamento não guarda nada disso.
    'cancelamentos', coalesce((
      select jsonb_agg(t order by t->>'quando' desc)
      from (
        select jsonb_build_object(
          'oficina', o.nome,
          'plano', p.nome,
          'quando', a.cancelada_em,
          'motivo', coalesce(a.motivo_cancelamento, 'não disse'),
          'durou_dias', greatest(0, (a.cancelada_em::date - a.inicio)::int)
        ) as t
        from public.assinaturas a
        join public.oficinas o on o.id = a.oficina_id
        join public.planos p on p.id = a.plano
        where a.cancelada_em is not null
        order by a.cancelada_em desc
        limit 20
      ) x
    ), '[]'::jsonb),

    'geografia', coalesce((
      select jsonb_agg(t order by (t->>'oficinas')::int desc)
      from (
        select jsonb_build_object(
          'cidade', coalesce(nullif(btrim(s.cidade), ''), 'sem cidade'),
          'oficinas', count(*),
          'pagantes', count(*) filter (where s.situacao = 'ativa')
        ) as t
        from situacoes s
        group by coalesce(nullif(btrim(s.cidade), ''), 'sem cidade')
      ) x
    ), '[]'::jsonb),

    -- A parte que vale mais: quem precisa de atenção HOJE, com o porquê.
    'atencao', coalesce((
      select jsonb_agg(t order by (t->>'urgencia')::int, t->>'oficina')
      from (
        select jsonb_build_object(
          'oficina', s.nome,
          'oficina_id', s.id,
          'urgencia', case
            when s.exclusao_pedida_em is not null then 1
            when s.situacao = 'bloqueada' then 2
            when s.situacao = 'atrasada' then 3
            when s.situacao = 'teste' and s.acesso_ate - current_date <= 3 then 4
            else 5
          end,
          'motivo', case
            when s.exclusao_pedida_em is not null then 'pediu para encerrar a conta'
            when s.situacao = 'bloqueada' then 'bloqueada por falta de pagamento'
            when s.situacao = 'atrasada' then 'pagamento em atraso, na carência'
            when s.situacao = 'teste' then 'teste terminando em ' || (s.acesso_ate - current_date) || ' dia(s)'
            else 'sem acesso há ' || extract(day from now() - ua.quando)::int || ' dias'
          end
        ) as t
        from situacoes s
        left join ultimo_acesso ua on ua.oficina_id = s.id
        where s.exclusao_pedida_em is not null
           or s.situacao in ('atrasada', 'bloqueada')
           or (s.situacao = 'teste' and s.acesso_ate - current_date <= 3)
           -- Sumiu: quem não entra há duas semanas costuma ser quem cancela.
           or (ua.quando is not null and ua.quando < now() - interval '14 days')
        limit 30
      ) x
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.plataforma_painel() from public, anon, authenticated;

comment on function public.plataforma_painel is
  'Os números do negócio e quem precisa de atenção hoje. Só a service_role executa.';

select public.conferir_fechadura();
