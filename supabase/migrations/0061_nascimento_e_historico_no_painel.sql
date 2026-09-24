-- 0061 — Aniversário do cliente, e o passado visível no painel
--
-- Duas coisas pequenas que vieram da reunião com a oficina.
--
-- 1. A data de nascimento do cliente. Opcional, porque ninguém vai parar o
--    atendimento para perguntar — mas quem tem essa data na mão consegue
--    lembrar do cliente no aniversário, que é a única mensagem que oficina
--    manda e o cliente agradece.
--
-- 2. O painel passa a contar quanto existe de serviço antigo FORA do período
--    que está na tela.
--
--    O painel abre no mês, e serviço antigo é, por definição, de antes de a
--    oficina entrar no sistema: quase tudo que ela lançar cai fora da janela.
--    Foi o que aconteceu na primeira semana — R$ 2.379,90 lançados, nada na
--    tela inicial, e a impressão de que o sistema tinha perdido o dinheiro.
--    Somar isso no faturamento do mês seria mentira; não dizer nada foi pior.
--    Então o painel diz que existe, e quanto, sem misturar com o mês.

alter table public.clientes
  add column if not exists data_nascimento date
    check (data_nascimento is null or data_nascimento > date '1900-01-01');

comment on column public.clientes.data_nascimento is
  'Opcional. Serve para lembrar do cliente no aniversário — nunca é exigida no atendimento.';

/*
 * O painel, agora com o bloco 'historico'.
 *
 * Mesma função da 0039, com uma consulta a mais no fim. O resto do corpo é
 * igual: quem comparar as duas versões deve ver só o bloco novo.
 */
create or replace function public.painel(p_de date, p_ate date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_oficina uuid := public.oficina_do_usuario();
  v_com_financeiro boolean;
  v_orc jsonb;
  v_os jsonb;
  v_fin jsonb;
  v_ranking jsonb;
  v_evolucao jsonb;
  v_historico jsonb;
begin
  if v_oficina is null then
    raise exception 'Usuário sem oficina ativa.' using errcode = 'insufficient_privilege';
  end if;
  if not public.eh_admin() then
    raise exception 'O painel é de quem cuida do dinheiro da oficina.'
      using errcode = 'insufficient_privilege';
  end if;

  select public.plano_tem_financeiro(plano) into v_com_financeiro
  from public.oficinas where id = v_oficina;

  select jsonb_build_object(
    'emitidos', count(*),
    'aprovados', count(*) filter (where status = 'aprovado'),
    'recusados', count(*) filter (where status = 'recusado'),
    'em_aberto', count(*) filter (where status in ('rascunho', 'enviado')),
    'valor_aprovado', coalesce(sum(valor_total) filter (where status = 'aprovado'), 0),
    'ticket_medio', coalesce(
      round(avg(valor_total) filter (where status = 'aprovado'), 2), 0),
    'conversao', case
      when count(*) = 0 then null
      else round(100.0 * count(*) filter (where status = 'aprovado') / count(*), 1)
    end
  )
  into v_orc
  from public.orcamentos
  where oficina_id = v_oficina and criado_em::date between p_de and p_ate;

  select jsonb_build_object(
    'abertas', count(*) filter (where status = 'aberta'),
    'em_andamento', count(*) filter (where status in ('em_andamento', 'pausada')),
    'aguardando_conferencia', count(*) filter (where status = 'aguardando_conferencia'),
    'finalizadas', count(*) filter (where status in ('finalizada', 'entregue')),
    'canceladas', count(*) filter (where status = 'cancelada'),
    'valor_finalizado', coalesce(
      sum(valor_total) filter (where status in ('finalizada', 'entregue')), 0),
    'horas_medias', coalesce(round(avg(
      extract(epoch from (data_conclusao - data_abertura)) / 3600
    ) filter (where data_conclusao is not null), 1), 0)
  )
  into v_os
  from public.ordens_servico
  where oficina_id = v_oficina and data_abertura::date between p_de and p_ate;

  select coalesce(jsonb_agg(l order by l->>'ordem'), '[]'::jsonb)
  into v_ranking
  from (
    select jsonb_build_object(
      'nome', u.nome,
      'ordens', count(*),
      'minutos', coalesce(sum(t.minutos), 0),
      'ordem', lpad((9999 - count(*))::text, 4, '0')
    ) as l
    from public.ordens_servico os
    join public.usuarios u on u.id = os.responsavel_id
    left join lateral (
      select sum(a.duracao_minutos) as minutos
      from public.apontamentos_tempo a
      where a.ordem_servico_id = os.id
    ) t on true
    where os.oficina_id = v_oficina
      and os.data_abertura::date between p_de and p_ate
      and os.status in ('finalizada', 'entregue')
    group by u.id, u.nome
  ) x;

  if v_com_financeiro then
    select jsonb_build_object(
      'a_receber', coalesce(sum(valor - valor_recebido) filter (
        where status = 'aberta' and valor_recebido < valor), 0),
      'em_atraso', coalesce(sum(valor - valor_recebido) filter (
        where status = 'aberta' and valor_recebido < valor and vencimento < current_date), 0),
      'recebido', coalesce(sum(valor_recebido) filter (where status <> 'cancelada'), 0)
    )
    into v_fin
    from public.contas_receber
    where oficina_id = v_oficina and vencimento between p_de and p_ate;

    v_fin := v_fin || (
      select jsonb_build_object(
        'a_pagar', coalesce(sum(valor) filter (where status = 'aberta'), 0),
        'pago', coalesce(sum(valor) filter (where status = 'paga'), 0)
      )
      from public.contas_pagar
      where oficina_id = v_oficina and vencimento between p_de and p_ate
    );
  else
    -- Sem financeiro no plano, o painel não inventa números: ele diz que não há.
    v_fin := null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'dia', d.dia,
    'valor', coalesce(f.valor, 0)
  ) order by d.dia), '[]'::jsonb)
  into v_evolucao
  from generate_series(p_de, p_ate, interval '1 day') as d(dia)
  left join (
    select data_abertura::date as dia, sum(valor_total) as valor
    from public.ordens_servico
    where oficina_id = v_oficina
      and data_abertura::date between p_de and p_ate
      and status in ('finalizada', 'entregue')
    group by 1
  ) f on f.dia = d.dia;

  -- O serviço antigo que ficou de fora da janela desta tela.
  select jsonb_build_object(
    'quantidade', count(*),
    'valor', coalesce(sum(valor_total), 0),
    'primeiro_dia', min(data_abertura::date),
    'ultimo_dia', max(data_abertura::date)
  )
  into v_historico
  from public.ordens_servico
  where oficina_id = v_oficina
    and historico_lancado_em is not null
    and status <> 'cancelada'
    and data_abertura::date not between p_de and p_ate;

  return jsonb_build_object(
    'de', p_de,
    'ate', p_ate,
    'orcamentos', v_orc,
    'servicos', v_os,
    'ranking', v_ranking,
    'financeiro', v_fin,
    'evolucao', v_evolucao,
    'historico_fora_do_periodo', v_historico,
    'produtos_para_repor', (
      select count(*) from public.produtos
      where oficina_id = v_oficina and ativo
        and estoque_minimo > 0 and estoque_atual <= estoque_minimo
    )
  );
end;
$$;

select public.conferir_fechadura();
