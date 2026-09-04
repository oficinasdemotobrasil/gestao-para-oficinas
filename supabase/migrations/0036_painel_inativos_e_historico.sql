-- 0036 — O painel, os clientes sumidos e o histórico da placa
--
-- Três coisas que o dono olha, e todas com o mesmo problema: a resposta é uma
-- conta sobre muitas linhas. Feita no aplicativo, seria baixar o movimento
-- inteiro do mês para somar no celular — caro na internet da oficina e lento na
-- tela. Feita aqui, volta um número.
--
-- O histórico da placa tem uma regra extra, e ela é de privacidade: a moto
-- trocou de dono, e o dono novo pode ver o que já foi feito nela — mas não o
-- telefone, o e-mail nem o CPF de quem teve a moto antes. Só o nome. RLS filtra
-- linha e não coluna, então isso também é função que roda como dona do banco e
-- entrega campo por campo.

-- Quantos dias sem aparecer é "sumido" ----------------------------------------
alter table public.oficinas
  add column if not exists dias_para_cliente_inativo integer not null default 30
    check (dias_para_cliente_inativo between 1 and 3650);

comment on column public.oficinas.dias_para_cliente_inativo is
  'Depois de quantos dias sem serviço concluído o cliente entra na lista de sumidos.';

-- O painel ---------------------------------------------------------------------
create or replace function public.painel(
  p_de date,
  p_ate date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_oficina uuid := public.oficina_do_usuario();
  v_orc jsonb;
  v_os jsonb;
  v_fin jsonb;
  v_ranking jsonb;
  v_evolucao jsonb;
begin
  if v_oficina is null then
    raise exception 'Usuário sem oficina ativa.' using errcode = 'insufficient_privilege';
  end if;
  -- Definer passa por cima do RLS: a permissão é esta linha, escrita à vista.
  if not public.eh_admin() then
    raise exception 'O painel é de quem cuida do dinheiro da oficina.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Orçamentos: emitidos no período, e o que aconteceu com eles ---------------
  select jsonb_build_object(
    'emitidos', count(*),
    'aprovados', count(*) filter (where status = 'aprovado'),
    'recusados', count(*) filter (where status = 'recusado'),
    -- "Em aberto" inclui o que venceu sem resposta: para o dono é a mesma
    -- coisa, um orçamento que não virou serviço e ainda pode virar.
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

  -- Serviços -------------------------------------------------------------------
  select jsonb_build_object(
    'abertas', count(*) filter (where status = 'aberta'),
    'em_andamento', count(*) filter (where status in ('em_andamento', 'pausada')),
    'aguardando_conferencia', count(*) filter (where status = 'aguardando_conferencia'),
    'finalizadas', count(*) filter (where status in ('finalizada', 'entregue')),
    'canceladas', count(*) filter (where status = 'cancelada'),
    'valor_finalizado', coalesce(
      sum(valor_total) filter (where status in ('finalizada', 'entregue')), 0),
    -- Da abertura à conclusão, em horas. Conta só as que concluíram: incluir as
    -- abertas puxaria a média para baixo com serviço que ainda nem começou.
    'horas_medias', coalesce(round(avg(
      extract(epoch from (data_conclusao - data_abertura)) / 3600
    ) filter (where data_conclusao is not null), 1), 0)
  )
  into v_os
  from public.ordens_servico
  where oficina_id = v_oficina and data_abertura::date between p_de and p_ate;

  -- Quem fez o quê ---------------------------------------------------------------
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

  -- Dinheiro ---------------------------------------------------------------------
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

  -- Uma linha por dia, para o gráfico de evolução --------------------------------
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

  return jsonb_build_object(
    'de', p_de,
    'ate', p_ate,
    'orcamentos', v_orc,
    'servicos', v_os,
    'ranking', v_ranking,
    'financeiro', v_fin,
    'evolucao', v_evolucao,
    'produtos_para_repor', (
      select count(*) from public.produtos
      where oficina_id = v_oficina and ativo
        and estoque_minimo > 0 and estoque_atual <= estoque_minimo
    )
  );
end;
$$;

-- Clientes que sumiram -----------------------------------------------------------
create or replace function public.clientes_inativos(p_dias integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_oficina uuid := public.oficina_do_usuario();
  v_dias integer;
begin
  if v_oficina is null then
    raise exception 'Usuário sem oficina ativa.' using errcode = 'insufficient_privilege';
  end if;
  if not public.eh_atendimento() then
    raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(p_dias, dias_para_cliente_inativo) into v_dias
  from public.oficinas where id = v_oficina;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'cliente_id', x.cliente_id,
      'nome', x.nome,
      'telefone', x.telefone,
      'ultima_visita', x.ultima_visita,
      'dias_sem_voltar', x.dias,
      'placa', x.placa,
      'marca', x.marca,
      'modelo', x.modelo,
      'ultimo_servico', x.ultimo_servico
    ) order by x.dias desc)
    from (
      select distinct on (os.cliente_id)
        os.cliente_id,
        c.nome,
        c.telefone,
        os.data_conclusao::date as ultima_visita,
        (current_date - os.data_conclusao::date) as dias,
        m.placa, m.marca, m.modelo,
        (
          select i.descricao from public.os_itens i
          where i.ordem_servico_id = os.id and i.tipo = 'servico'
          order by i.valor_total desc limit 1
        ) as ultimo_servico
      from public.ordens_servico os
      join public.clientes c on c.id = os.cliente_id
      left join public.motos m on m.id = os.moto_id
      where os.oficina_id = v_oficina
        and os.status in ('finalizada', 'entregue')
        and os.data_conclusao is not null
      order by os.cliente_id, os.data_conclusao desc
    ) x
    where x.dias >= v_dias
      -- Quem voltou depois já não está sumido: a linha acima é a visita mais
      -- recente dele, então basta ela ser antiga.
      and not exists (
        select 1 from public.ordens_servico o2
        where o2.cliente_id = x.cliente_id
          and o2.oficina_id = v_oficina
          and o2.status in ('aberta', 'em_andamento', 'pausada', 'aguardando_conferencia')
      )
  ), '[]'::jsonb);
end;
$$;

comment on function public.clientes_inativos is
  'Quem não conclui serviço há N dias e não tem nada em aberto agora. Ordenado do mais sumido para o menos.';

-- O histórico da placa -----------------------------------------------------------
-- Segue a MOTO, não o cliente. O dono novo vê tudo o que já foi feito nela,
-- porque é isso que importa para cuidar da moto — mas do dono antigo sai só o
-- nome. Telefone, e-mail e CPF dele não são assunto de quem comprou a moto.
create or replace function public.historico_da_placa(p_moto_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_oficina uuid := public.oficina_do_usuario();
begin
  if v_oficina is null then
    raise exception 'Usuário sem oficina ativa.' using errcode = 'insufficient_privilege';
  end if;
  if not public.eh_atendimento() then
    raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.motos where id = p_moto_id and oficina_id = v_oficina
  ) then
    raise exception 'Moto não encontrada.' using errcode = 'no_data_found';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', os.id,
      'numero', os.numero,
      'data', os.data_conclusao,
      'km', os.km_entrada,
      'valor', os.valor_total,
      -- Só o nome. É de propósito, e o comentário fica para quem for
      -- acrescentar campo aqui um dia sem pensar duas vezes.
      'dono_na_epoca', (
        select c.nome
        from public.moto_proprietarios mp
        join public.clientes c on c.id = mp.cliente_id
        where mp.moto_id = os.moto_id
          and mp.data_inicio <= os.data_conclusao::date
          and (mp.data_fim is null or mp.data_fim >= os.data_conclusao::date)
        order by mp.data_inicio desc
        limit 1
      ),
      'servicos', coalesce((
        select jsonb_agg(i.descricao order by i.valor_total desc)
        from public.os_itens i
        where i.ordem_servico_id = os.id and i.tipo in ('servico', 'avulso')
      ), '[]'::jsonb),
      'pecas', coalesce((
        select jsonb_agg(i.descricao order by i.valor_total desc)
        from public.os_itens i
        where i.ordem_servico_id = os.id and i.tipo = 'produto'
      ), '[]'::jsonb)
    ) order by os.data_conclusao desc)
    from public.ordens_servico os
    where os.moto_id = p_moto_id
      and os.oficina_id = v_oficina
      and os.status in ('finalizada', 'entregue')
      and os.data_conclusao is not null
  ), '[]'::jsonb);
end;
$$;

select public.conferir_fechadura();
