-- 0039 — O que cada plano deixa fazer
--
-- Dois limites, conforme combinado: quantas pessoas com acesso, e se o
-- financeiro está incluído.
--
-- Os números moram numa função só. Mudar preço e pacote é decisão de negócio e
-- acontece muito mais do que mudar código — espalhá-los por dez políticas
-- garantiria que um dia um deles ficasse para trás.
--
-- Uma escolha que vale explicar: rebaixar o plano NÃO desativa ninguém. Uma
-- oficina que cai do completo para o essencial com quatro colaboradores fica
-- com os quatro; ela só não cadastra o quinto. Desligar o acesso de alguém que
-- está no meio de um serviço por causa de uma troca de plano seria o sistema
-- atrapalhando o trabalho para cobrar — e quem sofreria é o mecânico, que não
-- decidiu nada.

create or replace function public.limite_de_colaboradores(p_plano public.plano_oficina)
returns integer
language sql
immutable
as $$
  select case p_plano
    when 'gratuito' then 2
    when 'essencial' then 5
    -- Nulo é sem limite.
    when 'completo' then null
  end;
$$;

comment on function public.limite_de_colaboradores is
  'Quantas pessoas com acesso cada plano permite. Nulo é sem limite. Mudar o pacote é mudar aqui.';

create or replace function public.plano_tem_financeiro(p_plano public.plano_oficina)
returns boolean
language sql
immutable
as $$
  select p_plano = 'completo';
$$;

-- O financeiro da oficina de quem está logado --------------------------------
create or replace function public.minha_oficina_tem_financeiro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.plano_tem_financeiro(o.plano)
  from public.oficinas o
  join public.usuarios u on u.oficina_id = o.id
  where u.id = auth.uid() and u.ativo;
$$;

-- Limite de colaboradores ------------------------------------------------------
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
  v_limite := public.limite_de_colaboradores(v_plano);
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

drop trigger if exists usuarios_conferir_limite on public.usuarios;
create trigger usuarios_conferir_limite
  before insert or update on public.usuarios
  for each row execute function public.conferir_limite_de_colaboradores();

-- Financeiro só no plano que o inclui ------------------------------------------
-- Aqui é política de RLS, e não gatilho, porque o limite precisa valer também
-- na LEITURA: no plano sem financeiro a tabela tem de vir vazia, e não apenas
-- recusar escrita. São duas políticas, não quarenta — o risco de mexer é
-- pequeno e o teste cobre as duas pontas.
drop policy if exists "admin gerencia contas a receber" on public.contas_receber;
create policy "admin gerencia contas a receber"
  on public.contas_receber for all to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_admin()
    and public.minha_oficina_tem_financeiro()
  )
  with check (
    oficina_id = public.oficina_do_usuario()
    and public.eh_admin()
    and public.minha_oficina_tem_financeiro()
  );

drop policy if exists "admin gerencia contas a pagar" on public.contas_pagar;
create policy "admin gerencia contas a pagar"
  on public.contas_pagar for all to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_admin()
    and public.minha_oficina_tem_financeiro()
  )
  with check (
    oficina_id = public.oficina_do_usuario()
    and public.eh_admin()
    and public.minha_oficina_tem_financeiro()
  );

-- O painel respeita o plano ----------------------------------------------------
-- A função do painel roda como dona do banco e soma contas_receber e
-- contas_pagar direto — ou seja, ela passa por cima da política que acabou de
-- trancar o financeiro. Sem esta correção, o plano sem financeiro esconderia a
-- tela e mostraria os mesmos números no painel.
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

select public.conferir_fechadura();
