-- 0065 — Indicador, código e comissão
--
-- Quem manda cliente para a oficina ganha por isso. O indicador escolhe o
-- próprio código — "JOAOMOTOS", "LAVAJATO2" —, o cliente chega dizendo o
-- código, e a oficina sabe a quem deve.
--
-- Três decisões tomadas com o dono da oficina, e o que cada uma custa:
--
-- 1. O percentual padrão é da OFICINA, em Configurações, e cada indicador pode
--    ter o seu. Sem o percentual próprio, dar 15% a um parceiro que traz muito
--    serviço obrigaria a mudar o de todo mundo.
--
-- 2. A comissão nasce na APROVAÇÃO do orçamento — foi o que ele escolheu.
--    É a opção mais arriscada das três que existiam, e o risco é conhecido:
--    orçamento aprovado que depois é cancelado teria gerado dívida com o
--    indicador. Por isso cancelar a OS cancela a comissão junto, no mesmo
--    caminho, sem depender de alguém lembrar.
--
-- 3. A comissão é registro da oficina, não conta a pagar automática. Ela
--    aparece como "a pagar" numa lista própria e alguém marca quando pagou.
--    Criar conta a pagar sozinha misturaria o acerto do parceiro com as
--    contas do mês, e o estorno do cancelamento teria de desfazer isso também.

alter table public.oficinas
  add column if not exists comissao_indicador_percentual numeric(5, 2) not null default 10
    check (comissao_indicador_percentual >= 0 and comissao_indicador_percentual <= 100);

comment on column public.oficinas.comissao_indicador_percentual is
  'Percentual padrão de comissão dos indicadores. Cada indicador pode ter o seu, e o dele vence este.';

create table if not exists public.indicadores (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  nome text not null check (length(trim(nome)) >= 2),
  telefone text,
  /*
   * O código é escolhido pelo indicador, e é ele que o cliente fala no balcão.
   * Guardado em caixa alta e sem espaço: quem dita "joao motos" e quem digita
   * "JOAOMOTOS" têm de chegar no mesmo lugar.
   */
  codigo text not null check (codigo ~ '^[A-Z0-9][A-Z0-9._-]{1,19}$'),
  /** Nulo usa o percentual da oficina. Preenchido, vence o da oficina. */
  percentual numeric(5, 2) check (percentual is null or (percentual >= 0 and percentual <= 100)),
  ativo boolean not null default true,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, oficina_id),
  unique (oficina_id, codigo)
);

create index if not exists indicadores_oficina_idx on public.indicadores (oficina_id, ativo);

create or replace function public.normalizar_codigo_do_indicador()
returns trigger
language plpgsql
as $$
begin
  new.codigo := upper(regexp_replace(coalesce(new.codigo, ''), '\s', '', 'g'));
  new.nome := trim(new.nome);
  new.telefone := nullif(regexp_replace(coalesce(new.telefone, ''), '\D', '', 'g'), '');
  return new;
end;
$$;

drop trigger if exists indicadores_normalizar on public.indicadores;
create trigger indicadores_normalizar
  before insert or update on public.indicadores
  for each row execute function public.normalizar_codigo_do_indicador();

drop trigger if exists indicadores_atualizado_em on public.indicadores;
create trigger indicadores_atualizado_em
  before update on public.indicadores
  for each row execute function public.marcar_atualizacao();

-- O orçamento passa a saber quem indicou -------------------------------------
alter table public.orcamentos
  add column if not exists indicador_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orcamentos_indicador_fk') then
    alter table public.orcamentos
      add constraint orcamentos_indicador_fk
      foreign key (indicador_id, oficina_id)
      references public.indicadores (id, oficina_id) on delete restrict;
  end if;
end $$;

-- A comissão ------------------------------------------------------------------
create table if not exists public.comissoes (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  indicador_id uuid not null,
  orcamento_id uuid not null,
  ordem_servico_id uuid,
  /** O valor do orçamento aprovado. Guardado porque a OS muda depois. */
  base numeric(12, 2) not null check (base >= 0),
  /** O percentual do dia. Mudar a regra amanhã não mexe no que já foi combinado. */
  percentual numeric(5, 2) not null check (percentual >= 0 and percentual <= 100),
  valor numeric(12, 2) not null check (valor >= 0),
  status text not null default 'a_pagar' check (status in ('a_pagar', 'paga', 'cancelada')),
  data_pagamento date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- Um orçamento gera uma comissão. Aprovar duas vezes não paga duas vezes.
  unique (orcamento_id),
  constraint comissoes_indicador_fk
    foreign key (indicador_id, oficina_id) references public.indicadores (id, oficina_id) on delete restrict,
  constraint comissoes_orcamento_fk
    foreign key (orcamento_id, oficina_id) references public.orcamentos (id, oficina_id) on delete cascade,
  constraint comissoes_os_fk
    foreign key (ordem_servico_id, oficina_id) references public.ordens_servico (id, oficina_id) on delete set null (ordem_servico_id),
  constraint comissoes_pagamento_coerente
    check ((status = 'paga') = (data_pagamento is not null))
);

create index if not exists comissoes_oficina_idx on public.comissoes (oficina_id, status);
create index if not exists comissoes_indicador_idx on public.comissoes (indicador_id, status);

drop trigger if exists comissoes_atualizado_em on public.comissoes;
create trigger comissoes_atualizado_em
  before update on public.comissoes
  for each row execute function public.marcar_atualizacao();

-- Quem vê e quem mexe ---------------------------------------------------------
alter table public.indicadores enable row level security;
alter table public.comissoes enable row level security;

-- O vendedor precisa LER os indicadores: é ele que monta o orçamento e anota
-- quem indicou o cliente. Mexer no cadastro e no percentual é do admin.
drop policy if exists "atendimento le indicadores" on public.indicadores;
create policy "atendimento le indicadores"
  on public.indicadores for select to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

drop policy if exists "admin gerencia indicadores" on public.indicadores;
create policy "admin gerencia indicadores"
  on public.indicadores for all to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_admin());

-- Comissão é dinheiro: só o admin. O vendedor sabe que indicou; quanto se deve
-- ao indicador é conversa de dono.
drop policy if exists "admin gerencia comissoes" on public.comissoes;
create policy "admin gerencia comissoes"
  on public.comissoes for all to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_admin());

-- A oficina suspensa continua lendo, mas não escreve.
do $$
declare t text;
begin
  foreach t in array array['indicadores', 'comissoes'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_exigir_oficina_ativa', t);
    execute format(
      'create trigger %I before insert or update or delete on public.%I
         for each row execute function public.exigir_oficina_ativa()',
      t || '_exigir_oficina_ativa', t);
  end loop;
end $$;

-- Achar o indicador pelo código ------------------------------------------------
-- Existe para a tela do orçamento aceitar o código ditado pelo cliente sem
-- baixar a lista inteira de indicadores no celular.
create or replace function public.indicador_por_codigo(p_codigo text)
returns table (id uuid, nome text, codigo text, percentual numeric, ativo boolean)
language sql
stable
as $$
  select i.id, i.nome, i.codigo,
         coalesce(i.percentual, o.comissao_indicador_percentual),
         i.ativo
  from public.indicadores i
  join public.oficinas o on o.id = i.oficina_id
  where i.oficina_id = public.oficina_do_usuario()
    and i.codigo = upper(regexp_replace(coalesce(p_codigo, ''), '\s', '', 'g'));
$$;

/*
 * A aprovação do orçamento, agora gerando a comissão.
 *
 * O resto do corpo é o mesmo da 0026. O que entra é o bloco do fim: se o
 * orçamento veio com indicador, nasce a comissão, com o percentual e o valor
 * congelados no dia — mudar a regra amanhã não mexe no que já foi combinado.
 */
create or replace function public.aprovar_orcamento(
  p_orcamento_id uuid,
  p_responsavel_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_orc record;
  v_os_id uuid;
  v_percentual numeric(5, 2);
begin
  select * into v_orc from public.orcamentos where id = p_orcamento_id;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'no_data_found';
  end if;

  if v_orc.status = 'aprovado' then
    raise exception 'Este orçamento já foi aprovado.' using errcode = 'check_violation';
  end if;
  if v_orc.status = 'recusado' then
    raise exception 'Este orçamento foi recusado e não pode ser aprovado.' using errcode = 'check_violation';
  end if;

  insert into public.ordens_servico
    (oficina_id, orcamento_id, cliente_id, moto_id, responsavel_id, status,
     km_entrada, garantia_ate, observacoes,
     desconto, desconto_tipo, valor_total)
  values
    (v_orc.oficina_id, v_orc.id, v_orc.cliente_id, v_orc.moto_id, p_responsavel_id,
     'aberta', v_orc.km_registrado, current_date + v_orc.garantia_dias, v_orc.observacoes,
     case when v_orc.desconto_percentual is not null
          then v_orc.desconto_percentual else coalesce(v_orc.desconto, 0) end,
     case when v_orc.desconto_percentual is not null then 'percentual' else 'valor' end,
     0)
  returning id into v_os_id;

  insert into public.os_itens
    (oficina_id, ordem_servico_id, tipo, produto_id, servico_id, descricao,
     quantidade, valor_unitario, valor_total)
  select oficina_id, v_os_id, tipo, produto_id, servico_id, descricao,
         quantidade, valor_unitario, valor_total
  from public.orcamento_itens
  where orcamento_id = p_orcamento_id;

  update public.ordens_servico
     set valor_total = v_orc.valor_total
   where id = v_os_id;

  update public.orcamentos set status = 'aprovado' where id = p_orcamento_id;

  -- A comissão do indicador ---------------------------------------------------
  if v_orc.indicador_id is not null then
    select coalesce(i.percentual, o.comissao_indicador_percentual)
      into v_percentual
    from public.indicadores i
    join public.oficinas o on o.id = i.oficina_id
    where i.id = v_orc.indicador_id;

    insert into public.comissoes
      (oficina_id, indicador_id, orcamento_id, ordem_servico_id, base, percentual, valor)
    values
      (v_orc.oficina_id, v_orc.indicador_id, v_orc.id, v_os_id,
       v_orc.valor_total, v_percentual,
       round(v_orc.valor_total * v_percentual / 100, 2))
    -- Aprovar de novo não paga de novo. A trava real é a unique de orcamento_id;
    -- isto só evita o erro feio na tela.
    on conflict (orcamento_id) do nothing;
  end if;

  return v_os_id;
end;
$$;

/*
 * Cancelar a ordem cancela a comissão.
 *
 * É o contrapeso da decisão de gerar comissão na aprovação: sem isto, um
 * orçamento aprovado e depois cancelado deixaria dívida com o indicador por um
 * serviço que nunca aconteceu — e alguém teria de lembrar de apagar na mão.
 *
 * Comissão já PAGA não volta a zero: o dinheiro saiu, e apagar o registro
 * esconderia isso. Ela fica paga, e o acerto com o indicador é conversa.
 */
create or replace function public.cancelar_comissao_da_os()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelada' and old.status is distinct from 'cancelada' then
    update public.comissoes
       set status = 'cancelada'
     where ordem_servico_id = new.id and status = 'a_pagar';
  end if;
  return new;
end;
$$;

drop trigger if exists ordens_servico_cancelar_comissao on public.ordens_servico;
create trigger ordens_servico_cancelar_comissao
  after update on public.ordens_servico
  for each row execute function public.cancelar_comissao_da_os();

create or replace function public.pagar_comissao(
  p_comissao_id uuid,
  p_data date default current_date
)
returns public.comissoes
language plpgsql
as $$
declare
  v_comissao public.comissoes;
begin
  update public.comissoes
     set status = 'paga', data_pagamento = p_data
   where id = p_comissao_id and status = 'a_pagar'
  returning * into v_comissao;

  if not found then
    raise exception 'Comissão não encontrada ou já resolvida.' using errcode = 'no_data_found';
  end if;
  return v_comissao;
end;
$$;

create or replace function public.desfazer_pagamento_da_comissao(p_comissao_id uuid)
returns public.comissoes
language plpgsql
as $$
declare
  v_comissao public.comissoes;
begin
  update public.comissoes
     set status = 'a_pagar', data_pagamento = null
   where id = p_comissao_id and status = 'paga'
  returning * into v_comissao;

  if not found then
    raise exception 'Comissão não encontrada ou não estava paga.' using errcode = 'no_data_found';
  end if;
  return v_comissao;
end;
$$;

/*
 * O que a oficina deve a cada indicador, e quanto ele já rendeu.
 *
 * Uma chamada só: a lista de indicadores com os números ao lado é a tela
 * inteira, e buscar os totais um a um seria uma consulta por linha.
 */
create or replace function public.indicadores_com_comissoes()
returns jsonb
language plpgsql
stable
as $$
declare
  v_oficina uuid := public.oficina_do_usuario();
begin
  if v_oficina is null then
    raise exception 'Usuário sem oficina ativa.' using errcode = 'insufficient_privilege';
  end if;
  if not public.eh_admin() then
    raise exception 'A comissão dos indicadores é de quem cuida do dinheiro.'
      using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'percentual_padrao', (
      select comissao_indicador_percentual from public.oficinas where id = v_oficina
    ),
    'indicadores', coalesce((
      select jsonb_agg(x order by x->>'nome')
      from (
        select jsonb_build_object(
          'id', i.id,
          'nome', i.nome,
          'codigo', i.codigo,
          'telefone', i.telefone,
          'ativo', i.ativo,
          'percentual', i.percentual,
          'percentual_efetivo', coalesce(i.percentual, o.comissao_indicador_percentual),
          'indicacoes', coalesce(c.indicacoes, 0),
          'a_pagar', coalesce(c.a_pagar, 0),
          'pago', coalesce(c.pago, 0),
          'gerado', coalesce(c.gerado, 0)
        ) as x
        from public.indicadores i
        join public.oficinas o on o.id = i.oficina_id
        left join lateral (
          select count(*) filter (where cm.status <> 'cancelada') as indicacoes,
                 coalesce(sum(cm.valor) filter (where cm.status = 'a_pagar'), 0) as a_pagar,
                 coalesce(sum(cm.valor) filter (where cm.status = 'paga'), 0) as pago,
                 coalesce(sum(cm.base) filter (where cm.status <> 'cancelada'), 0) as gerado
          from public.comissoes cm
          where cm.indicador_id = i.id
        ) c on true
        where i.oficina_id = v_oficina
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.indicador_por_codigo(text) from public, anon;
revoke all on function public.pagar_comissao(uuid, date) from public, anon;
revoke all on function public.desfazer_pagamento_da_comissao(uuid) from public, anon;
revoke all on function public.indicadores_com_comissoes() from public, anon;
grant execute on function public.indicador_por_codigo(text) to authenticated;
grant execute on function public.pagar_comissao(uuid, date) to authenticated;
grant execute on function public.desfazer_pagamento_da_comissao(uuid) to authenticated;
grant execute on function public.indicadores_com_comissoes() to authenticated;

/*
 * O orçamento passa a gravar quem indicou.
 *
 * DROP antes de recriar: a lista de parâmetros mudou, e `create or replace`
 * com assinatura diferente não substitui — cria uma SOBRECARGA. As duas
 * versões passam a existir, o PostgREST não sabe qual chamar e a tela quebra
 * com "function is not unique". Já aconteceu duas vezes neste banco.
 */
drop function if exists public.salvar_orcamento_com_itens(
  uuid, uuid, uuid, integer, integer, integer, text, numeric, numeric, jsonb
);

create or replace function public.salvar_orcamento_com_itens(
  p_orcamento_id uuid,
  p_cliente_id uuid,
  p_moto_id uuid,
  p_km_registrado integer,
  p_validade_dias integer,
  p_garantia_dias integer,
  p_observacoes text,
  p_desconto numeric,
  p_desconto_percentual numeric,
  p_itens jsonb,
  p_indicador_id uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_oficina_id uuid := public.oficina_do_usuario();
  v_id uuid := p_orcamento_id;
  v_total numeric(12, 2) := 0;
  v_status public.status_orcamento;
  v_item record;
begin
  if v_oficina_id is null then
    raise exception 'Usuário sem oficina ativa.' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(sum((x.quantidade * x.valor_unitario)::numeric(12, 2)), 0)
    into v_total
  from jsonb_to_recordset(coalesce(p_itens, '[]'::jsonb))
    as x(tipo text, produto_id uuid, servico_id uuid, descricao text,
         quantidade numeric, valor_unitario numeric);

  v_total := greatest(v_total - coalesce(p_desconto, 0), 0);

  if v_id is null then
    insert into public.orcamentos
      (oficina_id, cliente_id, moto_id, km_registrado, validade_dias, garantia_dias,
       observacoes, desconto, desconto_percentual, valor_total, criado_por, indicador_id)
    values
      (v_oficina_id, p_cliente_id, p_moto_id, p_km_registrado,
       coalesce(p_validade_dias, 7), coalesce(p_garantia_dias, 90),
       p_observacoes, coalesce(p_desconto, 0), p_desconto_percentual, v_total, auth.uid(),
       p_indicador_id)
    returning id into v_id;
  else
    select status into v_status from public.orcamentos where id = v_id;

    if v_status is null then
      raise exception 'Orçamento não encontrado.' using errcode = 'no_data_found';
    end if;

    -- Aprovado virou documento: a OS já nasceu dele, e a comissão do indicador
    -- também. Editar depois faria a OS contar uma história diferente da que o
    -- cliente aprovou.
    if v_status in ('aprovado', 'recusado') then
      raise exception 'Este orçamento já foi %. Não pode mais ser alterado.', v_status
        using errcode = 'check_violation';
    end if;

    update public.orcamentos
       set cliente_id = p_cliente_id,
           moto_id = p_moto_id,
           km_registrado = p_km_registrado,
           validade_dias = coalesce(p_validade_dias, 7),
           garantia_dias = coalesce(p_garantia_dias, 90),
           observacoes = p_observacoes,
           desconto = coalesce(p_desconto, 0),
           desconto_percentual = p_desconto_percentual,
           valor_total = v_total,
           indicador_id = p_indicador_id
     where id = v_id;

    delete from public.orcamento_itens where orcamento_id = v_id;
  end if;

  for v_item in
    select * from jsonb_to_recordset(coalesce(p_itens, '[]'::jsonb))
      as x(tipo text, produto_id uuid, servico_id uuid, descricao text,
           quantidade numeric, valor_unitario numeric)
  loop
    insert into public.orcamento_itens
      (oficina_id, orcamento_id, tipo, produto_id, servico_id, descricao,
       quantidade, valor_unitario, valor_total)
    values
      (v_oficina_id, v_id, v_item.tipo::public.tipo_item, v_item.produto_id, v_item.servico_id,
       v_item.descricao, v_item.quantidade, v_item.valor_unitario,
       (v_item.quantidade * v_item.valor_unitario)::numeric(12, 2));
  end loop;

  -- A quilometragem da moto vale a do orçamento mais recente: foi lida do painel
  -- agora, com a moto na frente de quem digitou.
  if p_km_registrado is not null then
    update public.motos
       set km_atual = p_km_registrado
     where id = p_moto_id and km_atual < p_km_registrado;
  end if;

  return v_id;
end;
$$;

revoke all on function public.salvar_orcamento_com_itens(
  uuid, uuid, uuid, integer, integer, integer, text, numeric, numeric, jsonb, uuid
) from public, anon;
grant execute on function public.salvar_orcamento_com_itens(
  uuid, uuid, uuid, integer, integer, integer, text, numeric, numeric, jsonb, uuid
) to authenticated;

select public.conferir_fechadura();
