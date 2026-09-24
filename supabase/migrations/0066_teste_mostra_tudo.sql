-- 0066 — No teste, a oficina vê tudo
--
-- Até aqui o teste era o plano "Teste 7 Dias", sem financeiro. Quem entrava
-- para conhecer o sistema não via justamente a parte que faz o dono assinar —
-- e depois teria de acreditar na descrição do plano.
--
-- Agora vale o contrário: durante o teste, a oficina tem o que o plano maior
-- tem. Na hora de assinar, se ela escolher um plano menor, a tela diz o que
-- ela perde e pergunta se é isso mesmo.
--
-- A regra fica em UM lugar, `oficina_tem_financeiro`, porque ela é consultada
-- de três pontos diferentes — a política das tabelas de dinheiro, a trava de
-- colaboradores e o painel. Espalhada, um deles ficaria para trás e a oficina
-- veria a tela de Financeiro vazia sem entender por quê.

-- Qual plano a oficina escolheu ao se cadastrar ------------------------------
-- Fica guardado porque, durante o teste, o plano em uso é o maior de todos: é
-- esta coluna que lembra o que ela pediu, para a hora de assinar.
alter table public.oficinas
  add column if not exists plano_escolhido public.plano_oficina;

comment on column public.oficinas.plano_escolhido is
  'O plano que a oficina escolheu no cadastro. Durante o teste ela usa o plano maior; este é o que ela pretende assinar.';

create or replace function public.oficina_em_teste(p_oficina uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.situacao_da_oficina(p_oficina) = 'teste'::public.status_oficina;
$$;

comment on function public.oficina_em_teste is
  'Se a oficina está no período de teste hoje. Durante ele, todos os recursos ficam liberados.';

/*
 * O financeiro está aberto para esta oficina?
 *
 * Duas portas: o plano inclui, ou ela está em teste. Quem responde isso é esta
 * função, e não `plano_tem_financeiro`, que só conhece o plano e não saberia
 * do teste.
 */
create or replace function public.oficina_tem_financeiro(p_oficina uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select public.plano_tem_financeiro(o.plano) from public.oficinas o where o.id = p_oficina),
    false
  ) or public.oficina_em_teste(p_oficina);
$$;

create or replace function public.minha_oficina_tem_financeiro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.oficina_tem_financeiro(public.oficina_do_usuario());
$$;

comment on function public.minha_oficina_tem_financeiro is
  'O financeiro da oficina de quem está logado: pelo plano, ou pelo teste em curso.';

/*
 * Quantas pessoas cabem nesta oficina hoje.
 *
 * Em teste, o limite é o maior entre os planos: a oficina que está conhecendo
 * o sistema precisa poder botar a equipe inteira dentro para decidir.
 */
create or replace function public.limite_da_oficina(p_oficina uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.oficina_em_teste(p_oficina)
      then (select max(limite_colaboradores) from public.planos where ativo)
    else (
      select public.limite_de_colaboradores(o.plano)
      from public.oficinas o where o.id = p_oficina
    )
  end;
$$;

create or replace function public.conferir_limite_de_colaboradores()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite integer;
  v_quantos integer;
  v_plano public.plano_oficina;
begin
  -- Só interessa quem passa a ocupar uma vaga: cadastro novo, ou alguém
  -- inativo que volta a ser ativo.
  if tg_op = 'UPDATE' and not (new.ativo and not old.ativo) then
    return new;
  end if;
  if tg_op = 'INSERT' and not new.ativo then
    return new;
  end if;

  select plano into v_plano from public.oficinas where id = new.oficina_id;
  v_limite := public.limite_da_oficina(new.oficina_id);
  if v_limite is null then
    return new;
  end if;

  select count(*) into v_quantos
  from public.usuarios
  where oficina_id = new.oficina_id and ativo and id <> new.id;

  if v_quantos >= v_limite then
    raise exception
      'O plano % permite % pessoas com acesso, e a oficina já tem %. Desative alguém ou mude de plano.',
      v_plano, v_limite, v_quantos
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

/*
 * O painel, agora perguntando pela OFICINA e não pelo plano.
 *
 * Mesmo corpo da 0061 — inclusive o bloco do serviço antigo fora do período.
 * A única linha diferente é a que decide se o bloco de dinheiro aparece.
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

  -- A linha que mudou: o teste também abre o financeiro.
  v_com_financeiro := public.oficina_tem_financeiro(v_oficina);

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

revoke all on function public.oficina_em_teste(uuid) from public, anon;
revoke all on function public.oficina_tem_financeiro(uuid) from public, anon;
revoke all on function public.limite_da_oficina(uuid) from public, anon;
grant execute on function public.oficina_em_teste(uuid) to authenticated;
grant execute on function public.oficina_tem_financeiro(uuid) to authenticated;
grant execute on function public.limite_da_oficina(uuid) to authenticated;

select public.conferir_fechadura();
