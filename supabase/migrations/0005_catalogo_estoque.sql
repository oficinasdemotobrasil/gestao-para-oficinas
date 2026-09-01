-- 0005 — Catálogo (produtos e serviços) e estoque
-- A Fase 1 só cadastra produtos e serviços. Notas de entrada e movimentações
-- nascem aqui para a estrutura não mudar depois, mas ficam sem tela até a Fase 2.

create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  codigo text,
  nome text not null check (length(trim(nome)) > 0),
  descricao text,
  unidade text not null default 'un',
  preco_custo numeric(12, 2) not null default 0 check (preco_custo >= 0),
  preco_venda numeric(12, 2) not null default 0 check (preco_venda >= 0),
  estoque_atual numeric(12, 3) not null default 0,
  estoque_minimo numeric(12, 3) not null default 0 check (estoque_minimo >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, oficina_id)
);

comment on column public.produtos.preco_custo is
  'Só o admin lê esta coluna. O vendedor consulta o catálogo pela view vw_produtos, que não a expõe.';

create unique index produtos_codigo_por_oficina_idx
  on public.produtos (oficina_id, codigo)
  where codigo is not null;

create table public.servicos (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  descricao text,
  preco numeric(12, 2) not null default 0 check (preco >= 0),
  tempo_estimado_minutos integer check (tempo_estimado_minutos is null or tempo_estimado_minutos > 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, oficina_id)
);

create table public.notas_fiscais_entrada (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  numero text not null,
  fornecedor text,
  data_emissao date,
  valor_total numeric(12, 2) not null default 0 check (valor_total >= 0),
  arquivo_url text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, oficina_id)
);

create table public.movimentacoes_estoque (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  produto_id uuid not null,
  tipo public.tipo_movimentacao not null,
  quantidade numeric(12, 3) not null check (quantidade <> 0),
  motivo text,
  nota_fiscal_id uuid,
  ordem_servico_id uuid, -- chave estrangeira criada em 0006, quando a tabela existir
  usuario_id uuid references public.usuarios (id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint movimentacoes_estoque_produto_fk
    foreign key (produto_id, oficina_id) references public.produtos (id, oficina_id) on delete restrict,
  constraint movimentacoes_estoque_nota_fk
    -- restrict, e não set null: a chave é composta e oficina_id é NOT NULL,
    -- então zerar o par na exclusão quebraria a linha.
    foreign key (nota_fiscal_id, oficina_id) references public.notas_fiscais_entrada (id, oficina_id) on delete restrict
);

create trigger produtos_atualizado_em
  before update on public.produtos
  for each row execute function public.marcar_atualizacao();

create trigger servicos_atualizado_em
  before update on public.servicos
  for each row execute function public.marcar_atualizacao();

create trigger notas_fiscais_entrada_atualizado_em
  before update on public.notas_fiscais_entrada
  for each row execute function public.marcar_atualizacao();
