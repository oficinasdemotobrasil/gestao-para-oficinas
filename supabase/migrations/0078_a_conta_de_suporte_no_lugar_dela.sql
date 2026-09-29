-- 0078 — A conta de suporte no lugar dela
--
-- Quatro achados da revisão profunda (ultrareview), confirmados em produção
-- antes de corrigir, e um quinto encontrado no caminho. Nenhum abria acesso
-- indevido — a sessão com prazo é a trava de verdade, e ela sempre fechou. Mas
-- os cinco faziam o sistema dizer coisas falsas:
--
-- 1. O "sair" devolvia erro 500. A conta de suporte é `perfil = 'admin'`, e dois
--    gatilhos da 0009 barravam o servidor de desativá-la: o de escalada (que só
--    deixa admin mexer em `ativo`, e o servidor não é admin de oficina nenhuma)
--    e o de último administrador. O acesso fechava, porque a sessão é encerrada
--    antes; o desligar da conta falhava depois, e ela ficava ativa para sempre.
--
-- 2. O botão de pânico — sair sem dizer a oficina — respondia "ok" e não
--    fechava nada. Corrigido na função da plataforma, não aqui.
--
-- 3. O painel da plataforma contava a conta de suporte como gente da oficina,
--    e, pior, o ÚLTIMO ACESSO dela entrava no da oficina. O próprio comentário
--    da função diz que esse é "o número mais útil desta lista": é ele que mostra
--    quem está prestes a ir embora. Cada visita de suporte a uma oficina parada
--    a fazia parecer ativa — o suporte apagava o alerta que existe para você.
--
-- 4. Dois atendimentos abertos juntos na mesma oficina deixavam duas sessões
--    abertas, contrariando o que a própria função promete.
--
-- 5. (achado no caminho, não estava na revisão) A conta de suporte CONTAVA como
--    administrador da oficina. Se o dono real se desativasse enquanto houvesse
--    uma conta de suporte ativa, o banco deixava — e a oficina ficava sem
--    nenhum administrador de verdade.
--
-- Como as quatro funções abaixo foram escritas: COPIADAS do arquivo mais recente
-- de cada uma e editadas em pontos exatos, por programa, e não redigitadas.
-- Redigitando foi que eu apaguei regras duas vezes nesta mesma semana — a da
-- conta encerrada na 0073 e a de não mover colaborador na 0074.

-- 1. O servidor liga e desliga a conta de suporte ----------------------------
create or replace function public.impedir_escalada_de_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Só a plataforma cria conta de suporte, e ela fala com o banco sem sessão
    -- de usuário. As demais regras não valem no cadastro: quem pode cadastrar
    -- já é filtrado pela política de insert.
    if new.de_suporte and auth.uid() is not null then
      raise exception 'A marcação de conta de suporte é definida pela plataforma.'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if new.de_suporte is distinct from old.de_suporte and auth.uid() is not null then
    raise exception 'A marcação de conta de suporte é definida pela plataforma.'
      using errcode = 'insufficient_privilege';
  end if;

  -- O servidor liga a conta de suporte ao abrir um atendimento e a desliga ao
  -- fechar. É a única mudança que ele faz nela, e ela só passa aqui se a
  -- linha JÁ era de suporte antes e continua depois — condição que ninguém
  -- logado consegue fabricar, porque a marcação é protegida logo acima.
  -- Perfil e oficina continuam intocáveis: a regra de não mover vale abaixo.
  if old.de_suporte and new.de_suporte and auth.uid() is null
     and new.perfil is not distinct from old.perfil then
    if new.oficina_id is distinct from old.oficina_id then
      raise exception 'Não é possível mover um colaborador para outra oficina.'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if not public.eh_admin() then
    if new.perfil is distinct from old.perfil
      or new.oficina_id is distinct from old.oficina_id
      or new.ativo is distinct from old.ativo
    then
      raise exception 'Somente o administrador pode alterar perfil, oficina ou situação de um colaborador.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Nem o admin muda um colaborador de oficina: isso levaria dados de uma
  -- oficina para outra sem deixar rastro.
  if new.oficina_id is distinct from old.oficina_id then
    raise exception 'Não é possível mover um colaborador para outra oficina.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- 5. A conta de suporte não conta como administrador --------------------------
create or replace function public.garantir_admin_ativo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  restantes integer;
begin
  -- A conta de suporte não é administradora da oficina: ela não precisa ser
  -- preservada, e não pode ser contada como a que sobra. Ver 0078.
  if old.de_suporte then
    return new;
  end if;

  if old.perfil = 'admin' and old.ativo
     and (new.perfil is distinct from 'admin' or not new.ativo)
  then
    select count(*) into restantes
    from public.usuarios
    where oficina_id = old.oficina_id
      and perfil = 'admin'
      and ativo
      and not de_suporte
      and id <> old.id;

    if restantes = 0 then
      raise exception 'A oficina precisa de pelo menos um administrador ativo.'
        using errcode = 'restrict_violation';
    end if;
  end if;

  return new;
end;
$$;

-- 3. O painel da plataforma ignora a conta de suporte ------------------------
create or replace function public.plataforma_oficinas()
returns table (
  id uuid,
  nome text,
  cidade text,
  plano public.plano_oficina,
  status public.status_oficina,
  situacao public.status_oficina,
  pessoas integer,
  ordens_no_mes integer,
  orcamentos_no_mes integer,
  ultimo_acesso timestamptz,
  acesso_ate date,
  excluir_em timestamptz,
  criado_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with mes as (select date_trunc('month', now()) as inicio)
  select
    o.id,
    o.nome,
    o.cidade,
    o.plano,
    o.status,
    public.situacao_da_oficina(o.id) as situacao,
    (select count(*)::int from public.usuarios u
      where u.oficina_id = o.id and u.ativo and not u.de_suporte),
    (select count(*)::int from public.ordens_servico os, mes
      where os.oficina_id = o.id and os.criado_em >= mes.inicio),
    (select count(*)::int from public.orcamentos orc, mes
      where orc.oficina_id = o.id and orc.criado_em >= mes.inicio),
    -- Quem não entra há semanas é quem está prestes a sair. É o número mais
    -- útil desta lista, e o único que não dá para adivinhar pelos outros.
    (select max(au.last_sign_in_at)
       from public.usuarios u
       join auth.users au on au.id = u.id
      where u.oficina_id = o.id and not u.de_suporte),
    o.acesso_ate,
    o.excluir_em,
    o.criado_em
  from public.oficinas o
  order by o.criado_em desc;
$$;

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
    where u.ativo and not u.de_suporte
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

-- Uma sessão aberta por conta de suporte ---------------------------------------
-- A função fecha a anterior e abre a nova em dois passos separados; entre eles,
-- um segundo atendimento podia abrir outra. Mesma família da corrida que a 0077
-- fechou para as contas, com a mesma resposta: o banco recusa a segunda, e a
-- função trata o erro seguindo com a sessão que venceu.
create unique index if not exists sessoes_de_suporte_uma_aberta_por_conta
  on public.sessoes_de_suporte (usuario_id)
  where encerrada_em is null;

-- As funções do painel continuam só da plataforma. `create or replace` preserva
-- as permissões, mas elas ficam reescritas aqui — e incluindo `authenticated`,
-- que não herda de `public` no Supabase (lição da 0070).
revoke execute on function public.plataforma_oficinas() from public, anon, authenticated;
revoke execute on function public.plataforma_painel() from public, anon, authenticated;

select public.conferir_fechadura();
