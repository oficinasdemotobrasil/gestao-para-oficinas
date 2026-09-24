-- 0064 — A ficha completa do cliente e da moto
--
-- A busca acha; a ficha responde. E a pergunta do balcão nunca é só "existe
-- esta placa?": é o que já fizemos nela, quanto o cliente gastou, o que ele
-- ainda deve, que peça entrou, que nota saiu.
--
-- Hoje isso está espalhado em seis tabelas e em três telas diferentes. Aqui
-- vira uma chamada por ficha — a mesma razão da busca: a internet da oficina é
-- ruim, e seis idas e voltas com o cliente na frente parecem sistema travado.
--
-- Duas decisões que valem explicar:
--
-- 1. Estas funções são SECURITY DEFINER, ao contrário da busca. É de
--    propósito, e é o ponto delicado desta migration: o vendedor passa a ver o
--    que o cliente deve, e a política de contas_receber é só do admin.
--
--    A abertura é estreita: sai o saldo e as contas em aberto DAQUELE cliente,
--    para quem atende o balcão (admin e vendedor). Não sai contas a pagar, não
--    sai o financeiro da oficina, e o mecânico não entra aqui — para ele a
--    função recusa, como já recusa o histórico da placa (0037).
--
-- 2. Cada lista vem com até 50 linhas e a contagem total. A tela mostra 5 e
--    abre o resto sem nova consulta: numa moto de dez anos, carregar tudo de
--    uma vez é o que faz a ficha demorar justamente para o cliente mais antigo.

create or replace function public.ficha_do_cliente(p_cliente uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_oficina uuid := public.oficina_do_usuario();
  v_com_financeiro boolean;
  v_cliente record;
begin
  if v_oficina is null then
    raise exception 'Usuário sem oficina ativa.' using errcode = 'insufficient_privilege';
  end if;
  -- O mecânico não passa daqui: a ficha cruza dinheiro, e o app dele não vê
  -- dinheiro em lugar nenhum (0033).
  if not public.eh_atendimento() then
    raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_cliente from public.clientes
  where id = p_cliente and oficina_id = v_oficina;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'no_data_found';
  end if;

  select public.plano_tem_financeiro(plano) into v_com_financeiro
  from public.oficinas where id = v_oficina;

  return jsonb_build_object(
    'resumo', (
      select jsonb_build_object(
        'servicos', count(*) filter (where os.status in ('finalizada', 'entregue')),
        'total_gasto', coalesce(sum(os.valor_total)
          filter (where os.status in ('finalizada', 'entregue')), 0),
        'ultimo_servico', max(os.data_conclusao)
          filter (where os.status in ('finalizada', 'entregue')),
        'em_andamento', count(*) filter (where os.status in
          ('aberta', 'em_andamento', 'pausada', 'aguardando_conferencia'))
      )
      from public.ordens_servico os
      where os.cliente_id = p_cliente and os.oficina_id = v_oficina
    ),
    'motos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', mo.id,
        'placa', mo.placa,
        'marca', mo.marca,
        'modelo', mo.modelo,
        'ano', mo.ano,
        'km_atual', mo.km_atual,
        'ultimo_servico', (
          select max(os.data_conclusao) from public.ordens_servico os
          where os.moto_id = mo.id and os.status in ('finalizada', 'entregue')
        )
      ) order by mo.placa), '[]'::jsonb)
      from public.moto_proprietarios mp
      join public.motos mo on mo.id = mp.moto_id
      where mp.cliente_id = p_cliente and mp.data_fim is null
    ),
    'orcamentos', public.lista_de_orcamentos(v_oficina, p_cliente, null),
    'ordens', public.lista_de_ordens(v_oficina, p_cliente, null),
    'notas', public.lista_de_notas(v_oficina, p_cliente, null),
    -- Dinheiro: só existe em plano com financeiro. Sem ele, a tela não mostra
    -- zeros — ela some com o bloco, que é diferente de dizer "não deve nada".
    'financeiro', case when not v_com_financeiro then null else (
      select jsonb_build_object(
        'em_aberto', coalesce(sum(cr.valor - cr.valor_recebido)
          filter (where cr.status = 'aberta' and cr.valor_recebido < cr.valor), 0),
        'em_atraso', coalesce(sum(cr.valor - cr.valor_recebido)
          filter (where cr.status = 'aberta' and cr.valor_recebido < cr.valor
                    and cr.vencimento < current_date), 0),
        'recebido', coalesce(sum(cr.valor_recebido) filter (where cr.status <> 'cancelada'), 0),
        'contas', coalesce((
          select jsonb_agg(c order by c->>'vencimento')
          from (
            select jsonb_build_object(
              'id', x.id,
              'descricao', x.descricao,
              'valor', x.valor,
              'valor_recebido', x.valor_recebido,
              'vencimento', x.vencimento,
              'status', public.status_da_conta(x.status, x.vencimento, x.valor, x.valor_recebido)
            ) as c
            from public.contas_receber x
            where x.cliente_id = p_cliente and x.oficina_id = v_oficina
              and x.status <> 'cancelada'
            order by x.vencimento desc
            limit 50
          ) t
        ), '[]'::jsonb)
      )
      from public.contas_receber cr
      where cr.cliente_id = p_cliente and cr.oficina_id = v_oficina
    ) end,
    'cliente', jsonb_build_object(
      'desde', v_cliente.criado_em,
      'data_nascimento', v_cliente.data_nascimento
    )
  );
end;
$$;

create or replace function public.ficha_da_moto(p_moto uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_oficina uuid := public.oficina_do_usuario();
  v_moto record;
begin
  if v_oficina is null then
    raise exception 'Usuário sem oficina ativa.' using errcode = 'insufficient_privilege';
  end if;
  if not public.eh_atendimento() then
    raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_moto from public.motos where id = p_moto and oficina_id = v_oficina;
  if not found then
    raise exception 'Moto não encontrada.' using errcode = 'no_data_found';
  end if;

  return jsonb_build_object(
    'resumo', (
      select jsonb_build_object(
        'servicos', count(*) filter (where os.status in ('finalizada', 'entregue')),
        'total_gasto', coalesce(sum(os.valor_total)
          filter (where os.status in ('finalizada', 'entregue')), 0),
        'ultimo_servico', max(os.data_conclusao)
          filter (where os.status in ('finalizada', 'entregue')),
        'em_andamento', count(*) filter (where os.status in
          ('aberta', 'em_andamento', 'pausada', 'aguardando_conferencia')),
        -- A garantia que ainda vale hoje. É a pergunta que o cliente faz de
        -- volta no balcão — "isso não tem garantia?" — e que hoje se responde
        -- procurando a OS antiga na mão.
        'garantia_ate', max(os.garantia_ate) filter (
          where os.status in ('finalizada', 'entregue') and os.garantia_ate >= current_date)
      )
      from public.ordens_servico os
      where os.moto_id = p_moto and os.oficina_id = v_oficina
    ),
    'orcamentos', public.lista_de_orcamentos(v_oficina, null, p_moto),
    'ordens', public.lista_de_ordens(v_oficina, null, p_moto),
    'notas', public.lista_de_notas(v_oficina, null, p_moto),
    -- O que já foi trocado nesta moto, somado por peça. Serve para a conversa
    -- do balcão: "a corrente foi trocada faz dois meses".
    'pecas', coalesce((
      select jsonb_agg(p order by p->>'ultima_vez' desc)
      from (
        select jsonb_build_object(
          'descricao', i.descricao,
          'quantidade', sum(i.quantidade),
          'ultima_vez', max(os.data_conclusao),
          'vezes', count(distinct os.id)
        ) as p
        from public.os_itens i
        join public.ordens_servico os on os.id = i.ordem_servico_id
        where os.moto_id = p_moto and os.oficina_id = v_oficina
          and os.status in ('finalizada', 'entregue')
          and i.tipo = 'produto'
        group by i.descricao
        limit 50
      ) t
    ), '[]'::jsonb),
    'proprietarios', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'cliente_id', mp.cliente_id,
        'nome', c.nome,
        'telefone', c.telefone,
        'desde', mp.data_inicio,
        'ate', mp.data_fim
      ) order by mp.data_inicio desc), '[]'::jsonb)
      from public.moto_proprietarios mp
      join public.clientes c on c.id = mp.cliente_id
      where mp.moto_id = p_moto
    )
  );
end;
$$;

/*
 * As três listas que as duas fichas compartilham.
 *
 * Existem como função à parte para orçamento, ordem e nota terem UMA forma só:
 * escritas duas vezes, a ficha da moto e a do cliente começariam iguais e
 * divergiriam no primeiro campo novo — e o jeito de descobrir seria alguém
 * notar que a mesma OS aparece diferente em duas telas.
 *
 * Filtram por cliente OU por moto: quem chama passa um e deixa o outro nulo.
 */
create or replace function public.lista_de_orcamentos(
  p_oficina uuid,
  p_cliente uuid,
  p_moto uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total', (
      select count(*) from public.orcamentos o
      where o.oficina_id = p_oficina
        and (p_cliente is null or o.cliente_id = p_cliente)
        and (p_moto is null or o.moto_id = p_moto)
    ),
    'itens', coalesce((
      select jsonb_agg(x order by x->>'data' desc)
      from (
        select jsonb_build_object(
          'id', o.id,
          'numero', o.numero,
          'status', o.status,
          'valor', o.valor_total,
          'data', o.criado_em,
          'historico', o.historico_lancado_em is not null,
          'validade_ate', o.validade_ate
        ) as x
        from public.orcamentos o
        where o.oficina_id = p_oficina
          and (p_cliente is null or o.cliente_id = p_cliente)
          and (p_moto is null or o.moto_id = p_moto)
        order by o.criado_em desc
        limit 50
      ) t
    ), '[]'::jsonb)
  );
$$;

create or replace function public.lista_de_ordens(
  p_oficina uuid,
  p_cliente uuid,
  p_moto uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total', (
      select count(*) from public.ordens_servico os
      where os.oficina_id = p_oficina
        and (p_cliente is null or os.cliente_id = p_cliente)
        and (p_moto is null or os.moto_id = p_moto)
    ),
    'itens', coalesce((
      select jsonb_agg(x order by x->>'data' desc)
      from (
        select jsonb_build_object(
          'id', os.id,
          'numero', os.numero,
          'status', os.status,
          'valor', os.valor_total,
          'data', os.data_abertura,
          'conclusao', os.data_conclusao,
          'garantia_ate', os.garantia_ate,
          'historico', os.historico_lancado_em is not null,
          'placa', mo.placa,
          'cliente_nome', cl.nome,
          'responsavel', u.nome
        ) as x
        from public.ordens_servico os
        left join public.motos mo on mo.id = os.moto_id
        left join public.clientes cl on cl.id = os.cliente_id
        left join public.usuarios u on u.id = os.responsavel_id
        where os.oficina_id = p_oficina
          and (p_cliente is null or os.cliente_id = p_cliente)
          and (p_moto is null or os.moto_id = p_moto)
        order by os.data_abertura desc
        limit 50
      ) t
    ), '[]'::jsonb)
  );
$$;

create or replace function public.lista_de_notas(
  p_oficina uuid,
  p_cliente uuid,
  p_moto uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total', (
      select count(*) from public.notas_fiscais_saida n
      left join public.ordens_servico os on os.id = n.ordem_servico_id
      where n.oficina_id = p_oficina
        and (p_cliente is null or n.cliente_id = p_cliente)
        and (p_moto is null or os.moto_id = p_moto)
    ),
    'itens', coalesce((
      select jsonb_agg(x order by x->>'data' desc)
      from (
        select jsonb_build_object(
          'id', n.id,
          'numero', n.numero,
          'valor', n.valor_total,
          'status', n.status,
          'data', n.criado_em,
          'ordem_servico_id', n.ordem_servico_id
        ) as x
        from public.notas_fiscais_saida n
        left join public.ordens_servico os on os.id = n.ordem_servico_id
        where n.oficina_id = p_oficina
          and (p_cliente is null or n.cliente_id = p_cliente)
          and (p_moto is null or os.moto_id = p_moto)
        order by n.criado_em desc
        limit 50
      ) t
    ), '[]'::jsonb)
  );
$$;

-- As três listas são peça interna das fichas: quem chama é a função de cima,
-- que já conferiu oficina e perfil. Ninguém as chama de fora.
revoke all on function public.lista_de_orcamentos(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.lista_de_ordens(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.lista_de_notas(uuid, uuid, uuid) from public, anon, authenticated;

revoke all on function public.ficha_do_cliente(uuid) from public, anon;
revoke all on function public.ficha_da_moto(uuid) from public, anon;
grant execute on function public.ficha_do_cliente(uuid) to authenticated;
grant execute on function public.ficha_da_moto(uuid) to authenticated;

select public.conferir_fechadura();
