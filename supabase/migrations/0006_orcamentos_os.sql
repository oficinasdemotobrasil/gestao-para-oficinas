-- 0006 — Orçamentos e ordens de serviço
-- Nenhuma tela na Fase 1. A estrutura nasce agora porque mudar o desenho de
-- multi-tenant depois, com dados de cliente dentro, custa caro.

create table public.orcamentos (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  numero integer not null,
  cliente_id uuid not null,
  moto_id uuid not null,
  status public.status_orcamento not null default 'rascunho',
  km_registrado integer check (km_registrado is null or km_registrado >= 0),
  validade_dias integer not null default 15 check (validade_dias > 0),
  garantia_dias integer not null default 90 check (garantia_dias >= 0),
  observacoes text,
  desconto numeric(12, 2) not null default 0 check (desconto >= 0),
  valor_total numeric(12, 2) not null default 0 check (valor_total >= 0),
  criado_por uuid references public.usuarios (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, oficina_id),
  unique (oficina_id, numero),
  constraint orcamentos_cliente_fk
    foreign key (cliente_id, oficina_id) references public.clientes (id, oficina_id) on delete restrict,
  constraint orcamentos_moto_fk
    foreign key (moto_id, oficina_id) references public.motos (id, oficina_id) on delete restrict
);

create table public.orcamento_itens (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  orcamento_id uuid not null,
  tipo public.tipo_item not null,
  produto_id uuid,
  servico_id uuid,
  descricao text not null,
  quantidade numeric(12, 3) not null default 1 check (quantidade > 0),
  valor_unitario numeric(12, 2) not null default 0 check (valor_unitario >= 0),
  valor_total numeric(12, 2) not null default 0 check (valor_total >= 0),
  criado_em timestamptz not null default now(),
  constraint orcamento_itens_orcamento_fk
    foreign key (orcamento_id, oficina_id) references public.orcamentos (id, oficina_id) on delete cascade,
  constraint orcamento_itens_produto_fk
    foreign key (produto_id, oficina_id) references public.produtos (id, oficina_id) on delete restrict,
  constraint orcamento_itens_servico_fk
    foreign key (servico_id, oficina_id) references public.servicos (id, oficina_id) on delete restrict,
  -- Item de produto aponta para produto; item de serviço aponta para serviço.
  -- Nunca os dois, nunca nenhum de um tipo que exija referência.
  constraint orcamento_itens_referencia_coerente check (
    (tipo = 'produto' and servico_id is null)
    or (tipo = 'servico' and produto_id is null)
  )
);

create table public.ordens_servico (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  orcamento_id uuid,
  numero integer not null,
  cliente_id uuid not null,
  moto_id uuid not null,
  mecanico_id uuid,
  status public.status_os not null default 'aberta',
  km_entrada integer check (km_entrada is null or km_entrada >= 0),
  data_abertura timestamptz not null default now(),
  data_conclusao timestamptz,
  garantia_ate date,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, oficina_id),
  unique (oficina_id, numero),
  constraint ordens_servico_orcamento_fk
    foreign key (orcamento_id, oficina_id) references public.orcamentos (id, oficina_id) on delete restrict,
  constraint ordens_servico_cliente_fk
    foreign key (cliente_id, oficina_id) references public.clientes (id, oficina_id) on delete restrict,
  constraint ordens_servico_moto_fk
    foreign key (moto_id, oficina_id) references public.motos (id, oficina_id) on delete restrict,
  -- O mecânico atribuído precisa ser da mesma oficina: é ele quem o RLS vai
  -- usar para decidir o que esse perfil enxerga.
  constraint ordens_servico_mecanico_fk
    -- restrict protege o histórico: colaborador que saiu é desativado, não apagado.
    foreign key (mecanico_id, oficina_id) references public.usuarios (id, oficina_id) on delete restrict
);

create table public.os_itens (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  ordem_servico_id uuid not null,
  tipo public.tipo_item not null,
  produto_id uuid,
  servico_id uuid,
  descricao text not null,
  quantidade numeric(12, 3) not null default 1 check (quantidade > 0),
  valor_unitario numeric(12, 2) not null default 0 check (valor_unitario >= 0),
  valor_total numeric(12, 2) not null default 0 check (valor_total >= 0),
  criado_em timestamptz not null default now(),
  constraint os_itens_os_fk
    foreign key (ordem_servico_id, oficina_id) references public.ordens_servico (id, oficina_id) on delete cascade,
  constraint os_itens_produto_fk
    foreign key (produto_id, oficina_id) references public.produtos (id, oficina_id) on delete restrict,
  constraint os_itens_servico_fk
    foreign key (servico_id, oficina_id) references public.servicos (id, oficina_id) on delete restrict,
  constraint os_itens_referencia_coerente check (
    (tipo = 'produto' and servico_id is null)
    or (tipo = 'servico' and produto_id is null)
  )
);

create table public.apontamentos_tempo (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  ordem_servico_id uuid not null,
  mecanico_id uuid not null,
  inicio timestamptz not null default now(),
  fim timestamptz,
  duracao_minutos integer generated always as (
    case when fim is null then null
    else greatest(0, (extract(epoch from (fim - inicio)) / 60)::integer)
    end
  ) stored,
  criado_em timestamptz not null default now(),
  constraint apontamentos_tempo_os_fk
    foreign key (ordem_servico_id, oficina_id) references public.ordens_servico (id, oficina_id) on delete cascade,
  constraint apontamentos_tempo_mecanico_fk
    foreign key (mecanico_id, oficina_id) references public.usuarios (id, oficina_id) on delete restrict,
  constraint apontamentos_tempo_periodo_valido check (fim is null or fim >= inicio)
);

-- Agora que ordens_servico existe, a movimentação de estoque pode apontar para ela.
alter table public.movimentacoes_estoque
  add constraint movimentacoes_estoque_os_fk
  foreign key (ordem_servico_id, oficina_id)
  references public.ordens_servico (id, oficina_id) on delete restrict;

create trigger orcamentos_atualizado_em
  before update on public.orcamentos
  for each row execute function public.marcar_atualizacao();

create trigger ordens_servico_atualizado_em
  before update on public.ordens_servico
  for each row execute function public.marcar_atualizacao();
