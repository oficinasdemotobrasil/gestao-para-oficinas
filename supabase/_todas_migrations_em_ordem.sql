-- ============================================================
-- ARQUIVO GERADO — não edite aqui.
--
-- Junta as migrations de supabase/migrations na ordem, para colar de uma vez
-- no SQL Editor do Supabase. A fonte da verdade são os arquivos numerados;
-- este aqui é só a cópia colável. Para atualizar: npm run migrations:juntar
--
-- Migrations incluídas: 15
-- ============================================================

-- ============================================================
-- 0001_extensoes_e_tipos.sql
-- ============================================================

-- 0001 — Extensões e tipos enumerados
-- Todos os estados do sistema são enums do Postgres: um status inválido nem
-- chega a ser gravado, em vez de virar texto livre que ninguém consegue mais limpar.

create extension if not exists "pgcrypto" with schema extensions;

-- Perfis de acesso. A restrição de cada um vive nas políticas de RLS
-- (migrations 0009 a 0011), não apenas na interface.
create type public.perfil_usuario as enum ('admin', 'vendedor', 'mecanico');

create type public.plano_oficina as enum ('gratuito', 'essencial', 'completo');
create type public.status_oficina as enum ('ativa', 'suspensa', 'cancelada');
create type public.tipo_chave_pix as enum ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria');

create type public.tipo_item as enum ('produto', 'servico');

create type public.status_orcamento as enum (
  'rascunho', 'enviado', 'aprovado', 'recusado', 'expirado'
);

create type public.status_os as enum (
  'aberta', 'em_andamento', 'pausada', 'finalizada', 'entregue', 'cancelada'
);

create type public.tipo_movimentacao as enum ('entrada', 'saida', 'ajuste');

create type public.status_conta as enum ('aberta', 'paga', 'atrasada', 'cancelada');

-- Carimbo de atualização, usado por trigger em todas as tabelas.
-- Fica aqui, antes das tabelas, porque os triggers de 0002 já dependem dele.
create or replace function public.marcar_atualizacao()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

-- ============================================================
-- 0002_nucleo.sql
-- ============================================================

-- 0002 — Núcleo: oficinas e usuários
-- Vem antes das funções auxiliares (0003) porque elas leem public.usuarios e o
-- Postgres valida o corpo de função SQL na hora de criar.

create table public.oficinas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  cnpj text,
  telefone text,
  endereco text,
  logo_url text,
  cor_primaria text not null default '#F5C518',
  chave_pix text,
  tipo_chave_pix public.tipo_chave_pix,
  plano public.plano_oficina not null default 'gratuito',
  status public.status_oficina not null default 'ativa',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.oficinas is
  'Um registro por oficina cliente. É o tenant: toda tabela de negócio aponta para cá.';

-- Espelho de auth.users com o vínculo de tenant e o perfil de acesso.
-- O id é o mesmo do Supabase Auth; apagar o usuário no Auth apaga aqui.
create table public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  oficina_id uuid not null references public.oficinas (id) on delete restrict,
  nome text not null check (length(trim(nome)) > 0),
  email text not null,
  telefone text,
  perfil public.perfil_usuario not null default 'vendedor',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- Permite que outras tabelas referenciem o par (usuário, oficina) e o banco
  -- garanta que um mecânico só seja atribuído a uma OS da própria oficina.
  unique (id, oficina_id)
);

comment on table public.usuarios is
  'Colaborador da oficina. O perfil daqui alimenta todas as políticas de RLS.';

create index usuarios_oficina_id_idx on public.usuarios (oficina_id);
create unique index usuarios_email_unico_idx on public.usuarios (lower(email));

create trigger oficinas_atualizado_em
  before update on public.oficinas
  for each row execute function public.marcar_atualizacao();

create trigger usuarios_atualizado_em
  before update on public.usuarios
  for each row execute function public.marcar_atualizacao();

-- ============================================================
-- 0003_funcoes_auxiliares.sql
-- ============================================================

-- 0002 — Funções auxiliares de multi-tenant e perfil
--
-- Estas funções são a base de TODA política de RLS do sistema.
--
-- Por que 'security definer': elas leem public.usuarios, que também tem RLS.
-- Sem 'security definer' a política de usuarios chamaria uma função que lê
-- usuarios, que dispara a política de novo — recursão infinita e erro em toda
-- consulta. Rodando como dono, a função enxerga a tabela sem passar pelo RLS.
--
-- Por que 'set search_path = public': sem isso, um schema malicioso no caminho
-- de busca poderia sequestrar o nome da tabela dentro de uma função privilegiada.
--
-- Por que 'stable': o resultado não muda dentro da mesma consulta, então o
-- Postgres chama uma vez e reaproveita, em vez de uma vez por linha lida.

-- Oficina do usuário logado. É o valor comparado em cada política do sistema.
-- Usuário desativado devolve null e, por consequência, não enxerga linha nenhuma.
create or replace function public.oficina_do_usuario()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select oficina_id
  from public.usuarios
  where id = auth.uid()
    and ativo
$$;

create or replace function public.perfil_do_usuario()
returns public.perfil_usuario
language sql
stable
security definer
set search_path = public
as $$
  select perfil
  from public.usuarios
  where id = auth.uid()
    and ativo
$$;

create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.perfil_do_usuario() = 'admin', false)
$$;

create or replace function public.eh_vendedor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.perfil_do_usuario() = 'vendedor', false)
$$;

create or replace function public.eh_mecanico()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.perfil_do_usuario() = 'mecanico', false)
$$;

-- Quem opera o balcão: cadastra cliente, moto e (na Fase 2) orçamento.
create or replace function public.eh_atendimento()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.perfil_do_usuario() in ('admin', 'vendedor'), false)
$$;

revoke all on function public.oficina_do_usuario() from public, anon;
revoke all on function public.perfil_do_usuario() from public, anon;
revoke all on function public.eh_admin() from public, anon;
revoke all on function public.eh_vendedor() from public, anon;
revoke all on function public.eh_mecanico() from public, anon;
revoke all on function public.eh_atendimento() from public, anon;

grant execute on function public.oficina_do_usuario() to authenticated;
grant execute on function public.perfil_do_usuario() to authenticated;
grant execute on function public.eh_admin() to authenticated;
grant execute on function public.eh_vendedor() to authenticated;
grant execute on function public.eh_mecanico() to authenticated;
grant execute on function public.eh_atendimento() to authenticated;

-- ============================================================
-- 0004_clientes_motos.sql
-- ============================================================

-- 0004 — Clientes, motos e histórico de proprietários
--
-- Regra de negócio central: a moto é uma entidade independente do cliente.
-- O histórico de serviços pertence à PLACA, não ao dono. Por isso não existe
-- cliente_id em motos: o vínculo mora em moto_proprietarios, com data de início
-- e de fim, e a moto trocar de dono não apaga nada do que já foi feito nela.
--
-- Sobre o par unique (id, oficina_id) que aparece em toda tabela: ele existe para
-- que as chaves estrangeiras carreguem o oficina_id junto. Sem isso, um usuário
-- mal-intencionado poderia gravar na sua oficina uma linha apontando para o
-- cliente de outra oficina — o RLS o impediria de LER, mas não de escrever a
-- referência. Com a chave composta, o banco recusa a referência cruzada.

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  telefone text,
  email text,
  cpf_cnpj text,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, oficina_id)
);

create table public.motos (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  placa text not null,
  marca text,
  modelo text,
  ano integer check (ano is null or ano between 1900 and 2100),
  cor text,
  chassi text,
  km_atual integer not null default 0 check (km_atual >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, oficina_id)
);

comment on column public.motos.placa is
  'Guardada sempre normalizada: maiúscula, sem hífen nem espaço. Ver trigger normalizar_placa.';

-- A placa é a chave de busca do dia a dia. Única dentro da oficina, nunca global:
-- duas oficinas diferentes podem atender a mesma moto.
create unique index motos_placa_por_oficina_idx on public.motos (oficina_id, placa);

-- Normaliza e valida a placa no banco, não só na tela. Aceita o padrão antigo
-- (ABC1234) e o Mercosul (ABC1D23) — o quinto caractere é dígito ou letra.
create or replace function public.normalizar_placa()
returns trigger
language plpgsql
as $$
begin
  new.placa = upper(regexp_replace(coalesce(new.placa, ''), '[^A-Za-z0-9]', '', 'g'));

  if new.placa !~ '^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$' then
    raise exception 'Placa inválida: %. Use o formato ABC1234 ou ABC1D23.', new.placa
      using errcode = 'check_violation';
  end if;

  new.chassi = nullif(upper(regexp_replace(coalesce(new.chassi, ''), '\s', '', 'g')), '');
  return new;
end;
$$;

create trigger motos_normalizar_placa
  before insert or update of placa, chassi on public.motos
  for each row execute function public.normalizar_placa();

-- Histórico de donos da moto. data_fim nula = dono atual.
create table public.moto_proprietarios (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  moto_id uuid not null,
  cliente_id uuid not null,
  data_inicio date not null default current_date,
  data_fim date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint moto_proprietarios_moto_fk
    foreign key (moto_id, oficina_id) references public.motos (id, oficina_id) on delete cascade,
  constraint moto_proprietarios_cliente_fk
    foreign key (cliente_id, oficina_id) references public.clientes (id, oficina_id) on delete restrict,
  constraint moto_proprietarios_periodo_valido
    check (data_fim is null or data_fim >= data_inicio)
);

-- Uma moto tem no máximo um dono atual por vez.
create unique index moto_proprietarios_dono_atual_idx
  on public.moto_proprietarios (moto_id)
  where data_fim is null;

create trigger clientes_atualizado_em
  before update on public.clientes
  for each row execute function public.marcar_atualizacao();

create trigger motos_atualizado_em
  before update on public.motos
  for each row execute function public.marcar_atualizacao();

create trigger moto_proprietarios_atualizado_em
  before update on public.moto_proprietarios
  for each row execute function public.marcar_atualizacao();

-- ============================================================
-- 0005_catalogo_estoque.sql
-- ============================================================

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

-- ============================================================
-- 0006_orcamentos_os.sql
-- ============================================================

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

-- ============================================================
-- 0007_financeiro.sql
-- ============================================================

-- 0007 — Financeiro
-- Sem tela na Fase 1. No RLS (0010) estas duas tabelas são exclusivas do admin:
-- vendedor e mecânico não leem nem escrevem nada aqui.

create table public.contas_receber (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  ordem_servico_id uuid,
  cliente_id uuid,
  descricao text not null,
  valor numeric(12, 2) not null check (valor >= 0),
  vencimento date not null,
  data_pagamento date,
  forma_pagamento text,
  status public.status_conta not null default 'aberta',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint contas_receber_os_fk
    foreign key (ordem_servico_id, oficina_id) references public.ordens_servico (id, oficina_id) on delete restrict,
  constraint contas_receber_cliente_fk
    foreign key (cliente_id, oficina_id) references public.clientes (id, oficina_id) on delete restrict,
  constraint contas_receber_pagamento_coerente
    check ((status = 'paga') = (data_pagamento is not null))
);

create table public.contas_pagar (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  fornecedor text,
  descricao text not null,
  categoria text,
  valor numeric(12, 2) not null check (valor >= 0),
  vencimento date not null,
  data_pagamento date,
  status public.status_conta not null default 'aberta',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint contas_pagar_pagamento_coerente
    check ((status = 'paga') = (data_pagamento is not null))
);

create trigger contas_receber_atualizado_em
  before update on public.contas_receber
  for each row execute function public.marcar_atualizacao();

create trigger contas_pagar_atualizado_em
  before update on public.contas_pagar
  for each row execute function public.marcar_atualizacao();

-- ============================================================
-- 0008_indices.sql
-- ============================================================

-- 0008 — Índices
-- oficina_id entra em toda política de RLS, ou seja, em toda consulta do sistema:
-- sem índice nele, cada tela vira varredura de tabela inteira.

create index clientes_oficina_id_idx on public.clientes (oficina_id);
create index motos_oficina_id_idx on public.motos (oficina_id);
create index moto_proprietarios_oficina_id_idx on public.moto_proprietarios (oficina_id);
create index produtos_oficina_id_idx on public.produtos (oficina_id);
create index servicos_oficina_id_idx on public.servicos (oficina_id);
create index notas_fiscais_entrada_oficina_id_idx on public.notas_fiscais_entrada (oficina_id);
create index movimentacoes_estoque_oficina_id_idx on public.movimentacoes_estoque (oficina_id);
create index orcamentos_oficina_id_idx on public.orcamentos (oficina_id);
create index orcamento_itens_oficina_id_idx on public.orcamento_itens (oficina_id);
create index ordens_servico_oficina_id_idx on public.ordens_servico (oficina_id);
create index os_itens_oficina_id_idx on public.os_itens (oficina_id);
create index apontamentos_tempo_oficina_id_idx on public.apontamentos_tempo (oficina_id);
create index contas_receber_oficina_id_idx on public.contas_receber (oficina_id);
create index contas_pagar_oficina_id_idx on public.contas_pagar (oficina_id);

-- Busca do balcão: "chegou a placa ABC1D23".
create index motos_placa_idx on public.motos (placa);

-- Busca por telefone é como o balcão acha o cliente que ligou.
create index clientes_telefone_idx on public.clientes (telefone);

-- Busca por nome sem diferenciar maiúscula/minúscula.
create index clientes_nome_idx on public.clientes (oficina_id, lower(nome));

create index ordens_servico_status_idx on public.ordens_servico (oficina_id, status);
create index ordens_servico_mecanico_idx on public.ordens_servico (mecanico_id);

create index contas_receber_vencimento_idx on public.contas_receber (oficina_id, vencimento);
create index contas_pagar_vencimento_idx on public.contas_pagar (oficina_id, vencimento);

-- Percorrer o histórico de uma moto e os itens de um documento.
create index moto_proprietarios_moto_idx on public.moto_proprietarios (moto_id);
create index moto_proprietarios_cliente_idx on public.moto_proprietarios (cliente_id);
create index orcamento_itens_orcamento_idx on public.orcamento_itens (orcamento_id);
create index os_itens_os_idx on public.os_itens (ordem_servico_id);
create index apontamentos_tempo_os_idx on public.apontamentos_tempo (ordem_servico_id);
create index movimentacoes_estoque_produto_idx on public.movimentacoes_estoque (produto_id);

-- ============================================================
-- 0009_rls_nucleo.sql
-- ============================================================

-- 0009 — RLS do núcleo: oficinas e usuários
--
-- Regra do projeto: o frontend filtra por conveniência, o banco filtra por
-- segurança. Toda política abaixo compara oficina_id com public.oficina_do_usuario().
--
-- Não usamos 'force row level security': o dono das tabelas é o postgres e a view
-- vw_produtos (migration 0012) depende justamente de rodar como dono para
-- entregar ao vendedor o catálogo sem a coluna de custo.

alter table public.oficinas enable row level security;
alter table public.usuarios enable row level security;

-- Oficinas ------------------------------------------------------------------
-- Cada usuário enxerga uma linha só: a própria oficina.
create policy "oficina propria e visivel"
  on public.oficinas for select to authenticated
  using (id = public.oficina_do_usuario());

-- Configurações da oficina são exclusivas do admin (escopo, item 9).
create policy "admin edita a propria oficina"
  on public.oficinas for update to authenticated
  using (id = public.oficina_do_usuario() and public.eh_admin())
  with check (id = public.oficina_do_usuario() and public.eh_admin());

-- Sem política de insert ou delete: criar e encerrar oficina é operação de
-- plataforma, feita pela service_role fora do aplicativo.

-- Usuários ------------------------------------------------------------------
-- O mecânico não navega pela equipe; enxerga apenas o próprio cadastro.
create policy "equipe visivel na propria oficina"
  on public.usuarios for select to authenticated
  using (
    id = auth.uid()
    or (oficina_id = public.oficina_do_usuario() and not public.eh_mecanico())
  );

-- Na prática o colaborador é criado pela Edge Function criar-colaborador, que
-- usa a service_role. Esta política existe para o caso de inserção pelo próprio
-- admin autenticado e mantém a regra explícita no banco.
create policy "admin cadastra colaborador"
  on public.usuarios for insert to authenticated
  with check (oficina_id = public.oficina_do_usuario() and public.eh_admin());

create policy "admin edita colaborador e cada um edita a si"
  on public.usuarios for update to authenticated
  using (
    (oficina_id = public.oficina_do_usuario() and public.eh_admin())
    or id = auth.uid()
  )
  with check (
    (oficina_id = public.oficina_do_usuario() and public.eh_admin())
    or id = auth.uid()
  );

-- Sem política de delete: colaborador que sai é desativado, não apagado, senão
-- o histórico de quem fez cada serviço se perde.

-- Trava contra escalada de privilégio ---------------------------------------
-- A política de update acima deixa cada um editar a própria linha (nome,
-- telefone). Sem esta trava, o mesmo caminho permitiria a um vendedor trocar
-- o próprio perfil para admin, ou mudar de oficina, com um único PATCH.
create or replace function public.impedir_escalada_de_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

create trigger usuarios_impedir_escalada
  before update on public.usuarios
  for each row execute function public.impedir_escalada_de_perfil();

-- A oficina nunca pode ficar sem administrador ativo, senão ninguém mais entra
-- nas configurações nem cadastra colaborador.
create or replace function public.garantir_admin_ativo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  restantes integer;
begin
  if old.perfil = 'admin' and old.ativo
     and (new.perfil is distinct from 'admin' or not new.ativo)
  then
    select count(*) into restantes
    from public.usuarios
    where oficina_id = old.oficina_id
      and perfil = 'admin'
      and ativo
      and id <> old.id;

    if restantes = 0 then
      raise exception 'A oficina precisa de pelo menos um administrador ativo.'
        using errcode = 'restrict_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger usuarios_garantir_admin_ativo
  before update on public.usuarios
  for each row execute function public.garantir_admin_ativo();

-- ============================================================
-- 0010_rls_negocio.sql
-- ============================================================

-- 0010 — RLS das tabelas de negócio (admin e vendedor)
-- O recorte do mecânico vem na 0011, em políticas separadas, para ficar fácil
-- de auditar o que exatamente aquele perfil alcança.
--
-- Leitura de toda política daqui: "linha da minha oficina" + "meu perfil pode".

alter table public.clientes enable row level security;
alter table public.motos enable row level security;
alter table public.moto_proprietarios enable row level security;
alter table public.produtos enable row level security;
alter table public.servicos enable row level security;
alter table public.notas_fiscais_entrada enable row level security;
alter table public.movimentacoes_estoque enable row level security;
alter table public.orcamentos enable row level security;
alter table public.orcamento_itens enable row level security;
alter table public.ordens_servico enable row level security;
alter table public.os_itens enable row level security;
alter table public.apontamentos_tempo enable row level security;
alter table public.contas_receber enable row level security;
alter table public.contas_pagar enable row level security;

-- Clientes ------------------------------------------------------------------
create policy "atendimento le clientes"
  on public.clientes for select to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "atendimento cadastra clientes"
  on public.clientes for insert to authenticated
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "atendimento edita clientes"
  on public.clientes for update to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "admin apaga clientes"
  on public.clientes for delete to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin());

-- Motos ---------------------------------------------------------------------
create policy "atendimento le motos"
  on public.motos for select to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "atendimento cadastra motos"
  on public.motos for insert to authenticated
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "atendimento edita motos"
  on public.motos for update to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "admin apaga motos"
  on public.motos for delete to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin());

-- Proprietários da moto -----------------------------------------------------
create policy "atendimento le proprietarios"
  on public.moto_proprietarios for select to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "atendimento registra proprietario"
  on public.moto_proprietarios for insert to authenticated
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "atendimento encerra proprietario"
  on public.moto_proprietarios for update to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "admin apaga proprietario"
  on public.moto_proprietarios for delete to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin());

-- Produtos ------------------------------------------------------------------
-- Só o admin lê a tabela direto, porque a linha inteira carrega preco_custo e
-- RLS filtra linha, não coluna. O vendedor consulta pela view vw_produtos (0012).
create policy "admin le produtos"
  on public.produtos for select to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin());

create policy "admin cadastra produtos"
  on public.produtos for insert to authenticated
  with check (oficina_id = public.oficina_do_usuario() and public.eh_admin());

create policy "admin edita produtos"
  on public.produtos for update to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_admin());

create policy "admin apaga produtos"
  on public.produtos for delete to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin());

-- Serviços ------------------------------------------------------------------
-- Serviço não tem custo nem margem, então o vendedor lê a tabela direto.
create policy "atendimento le servicos"
  on public.servicos for select to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "admin cadastra servicos"
  on public.servicos for insert to authenticated
  with check (oficina_id = public.oficina_do_usuario() and public.eh_admin());

create policy "admin edita servicos"
  on public.servicos for update to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_admin());

create policy "admin apaga servicos"
  on public.servicos for delete to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin());

-- Notas de entrada e movimentação de estoque --------------------------------
-- Nota de entrada mostra o que a oficina pagou no fornecedor: admin apenas.
create policy "admin gerencia notas de entrada"
  on public.notas_fiscais_entrada for all to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_admin());

create policy "admin gerencia movimentacoes"
  on public.movimentacoes_estoque for all to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_admin());

-- Orçamentos ----------------------------------------------------------------
create policy "atendimento gerencia orcamentos"
  on public.orcamentos for all to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "atendimento gerencia itens do orcamento"
  on public.orcamento_itens for all to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

-- Ordens de serviço ---------------------------------------------------------
create policy "atendimento le ordens de servico"
  on public.ordens_servico for select to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "atendimento abre ordem de servico"
  on public.ordens_servico for insert to authenticated
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "atendimento edita ordem de servico"
  on public.ordens_servico for update to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "admin cancela ordem de servico"
  on public.ordens_servico for delete to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin());

create policy "atendimento gerencia itens da os"
  on public.os_itens for all to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "atendimento le apontamentos"
  on public.apontamentos_tempo for select to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

-- Financeiro ----------------------------------------------------------------
-- Vendedor e mecânico não veem financeiro. Nenhuma política os alcança.
create policy "admin gerencia contas a receber"
  on public.contas_receber for all to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_admin());

create policy "admin gerencia contas a pagar"
  on public.contas_pagar for all to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_admin());

-- ============================================================
-- 0011_rls_mecanico.sql
-- ============================================================

-- 0011 — RLS do mecânico
--
-- O mecânico enxerga SOMENTE as ordens de serviço atribuídas a ele, e enxerga
-- cliente e moto apenas por derivação dessas OS. Ele não alcança financeiro,
-- custo de peça, margem, catálogo de produtos nem clientes de outros serviços.
--
-- Políticas do mesmo comando são combinadas com OU. Por isso o recorte do
-- mecânico fica em políticas próprias: elas não afrouxam as da 0010, apenas
-- abrem uma porta estreita a mais.
--
-- Observação de escopo: na Fase 1 não existe tela de ordem de serviço, então na
-- prática o mecânico entra e não encontra nada — que é o comportamento correto,
-- e não um erro de configuração.

-- Ordens de serviço atribuídas a ele ----------------------------------------
create policy "mecanico le as proprias ordens"
  on public.ordens_servico for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and mecanico_id = auth.uid()
  );

-- Ele mexe no andamento do próprio serviço, mas não muda de dono a OS: a
-- verificação impede que ele atribua a OS a outra pessoa ou a si mesmo.
create policy "mecanico atualiza as proprias ordens"
  on public.ordens_servico for update to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and mecanico_id = auth.uid()
  )
  with check (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and mecanico_id = auth.uid()
  );

-- Itens da OS dele: ele precisa saber quais peças e serviços executar.
-- A view enxerga descrição, quantidade e valor do item, nunca o custo do produto.
create policy "mecanico le itens das proprias ordens"
  on public.os_itens for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and exists (
      select 1
      from public.ordens_servico os
      where os.id = os_itens.ordem_servico_id
        and os.mecanico_id = auth.uid()
    )
  );

-- Cliente e moto da OS dele -------------------------------------------------
-- Sem isto o mecânico veria uma OS sem saber de que moto se trata. O 'exists'
-- limita a leitura ao que está atribuído a ele: nenhum outro cliente aparece.
create policy "mecanico le o cliente da propria ordem"
  on public.clientes for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and exists (
      select 1
      from public.ordens_servico os
      where os.cliente_id = clientes.id
        and os.mecanico_id = auth.uid()
    )
  );

create policy "mecanico le a moto da propria ordem"
  on public.motos for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and exists (
      select 1
      from public.ordens_servico os
      where os.moto_id = motos.id
        and os.mecanico_id = auth.uid()
    )
  );

-- Serviços do catálogo ------------------------------------------------------
-- Só o que está ativo, e sem nenhuma referência a custo — a tabela de serviços
-- guarda preço de venda e tempo estimado, nada de margem.
create policy "mecanico consulta servicos ativos"
  on public.servicos for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and ativo
  );

-- Apontamento de tempo (Fase 2) ---------------------------------------------
create policy "mecanico le os proprios apontamentos"
  on public.apontamentos_tempo for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and mecanico_id = auth.uid()
  );

create policy "mecanico registra o proprio apontamento"
  on public.apontamentos_tempo for insert to authenticated
  with check (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and mecanico_id = auth.uid()
    and exists (
      select 1
      from public.ordens_servico os
      where os.id = apontamentos_tempo.ordem_servico_id
        and os.mecanico_id = auth.uid()
    )
  );

create policy "mecanico encerra o proprio apontamento"
  on public.apontamentos_tempo for update to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and mecanico_id = auth.uid()
  )
  with check (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and mecanico_id = auth.uid()
  );

-- ============================================================
-- 0012_view_produtos_sem_custo.sql
-- ============================================================

-- 0012 — Catálogo de produtos sem preço de custo
--
-- O problema: RLS filtra LINHA, não COLUNA. Não existe política capaz de
-- entregar a mesma linha de produto com preco_custo para o admin e sem ele
-- para o vendedor. Por isso a tabela produtos é de leitura exclusiva do admin
-- (política em 0010) e o vendedor consulta este recorte.
--
-- A view roda como dono (security_invoker = false), ou seja, passa por cima do
-- RLS de produtos — é exatamente o que se quer aqui, e é também o ponto que
-- exige cuidado: o isolamento entre oficinas passa a depender do WHERE abaixo.
-- Ele está coberto pelo script de teste de isolamento, que tenta ler a view
-- logado como a outra oficina.
--
-- security_barrier impede que uma função barata do usuário seja avaliada antes
-- do filtro de oficina e vaze linha por mensagem de erro.

create view public.vw_produtos
with (security_invoker = false, security_barrier = true)
as
select
  p.id,
  p.oficina_id,
  p.codigo,
  p.nome,
  p.descricao,
  p.unidade,
  p.preco_venda,
  p.estoque_atual,
  p.estoque_minimo,
  p.ativo,
  p.criado_em,
  p.atualizado_em
from public.produtos p
where p.oficina_id = public.oficina_do_usuario()
  and not public.eh_mecanico();

comment on view public.vw_produtos is
  'Catálogo de produtos sem preco_custo, para o perfil vendedor. O admin lê a tabela produtos direto.';

revoke all on public.vw_produtos from public, anon;
grant select on public.vw_produtos to authenticated;

-- ============================================================
-- 0013_rpc_moto_com_proprietario.sql
-- ============================================================

-- 0013 — Cadastro de moto já vinculada ao dono
--
-- A moto e o vínculo com o cliente precisam nascer juntos: uma moto gravada sem
-- proprietário, porque a segunda chamada falhou no meio, é um registro órfão que
-- ninguém encontra depois. Aqui as duas escritas estão na mesma transação.
--
-- security invoker (padrão do plpgsql): a função roda com as permissões de quem
-- chamou, então o RLS continua valendo. Um vendedor da oficina A não consegue
-- usar esta função para gravar moto na oficina B.

create or replace function public.criar_moto_com_proprietario(
  p_cliente_id uuid,
  p_placa text,
  p_marca text default null,
  p_modelo text default null,
  p_ano integer default null,
  p_cor text default null,
  p_chassi text default null,
  p_km_atual integer default 0
)
returns public.motos
language plpgsql
as $$
declare
  v_oficina_id uuid := public.oficina_do_usuario();
  v_moto public.motos;
begin
  if v_oficina_id is null then
    raise exception 'Usuário sem oficina ativa.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.motos (oficina_id, placa, marca, modelo, ano, cor, chassi, km_atual)
  values (v_oficina_id, p_placa, p_marca, p_modelo, p_ano, p_cor, p_chassi, coalesce(p_km_atual, 0))
  returning * into v_moto;

  insert into public.moto_proprietarios (oficina_id, moto_id, cliente_id, data_inicio)
  values (v_oficina_id, v_moto.id, p_cliente_id, current_date);

  return v_moto;
end;
$$;

revoke all on function public.criar_moto_com_proprietario(uuid, text, text, text, integer, text, text, integer) from public, anon;
grant execute on function public.criar_moto_com_proprietario(uuid, text, text, text, integer, text, text, integer) to authenticated;

-- ============================================================
-- 0014_verificacao_rls.sql
-- ============================================================

-- 0014 — Fechadura final e verificação automática
--
-- "Nenhuma tabela sem RLS" é critério de aceite da Fase 1. Deixar isso na mão
-- de conferência manual significa que, na décima tabela nova, alguém esquece.
-- Aqui vira migration: se sobrar uma tabela sem RLS ou sem política, o deploy
-- para com erro em vez de subir um vazamento.

-- Ninguém sem login toca em nada. O aplicativo inteiro exige sessão.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;

do $$
declare
  pendentes text;
begin
  -- 1. Toda tabela de public precisa ter RLS ligado.
  select string_agg(c.relname, ', ' order by c.relname)
  into pendentes
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if pendentes is not null then
    raise exception 'Tabelas sem RLS ativado: %', pendentes;
  end if;

  -- 2. RLS ligado sem nenhuma política nega tudo em silêncio — o que também é
  --    um defeito: significa uma tabela que ninguém consegue usar.
  select string_agg(c.relname, ', ' order by c.relname)
  into pendentes
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

  if pendentes is not null then
    raise exception 'Tabelas com RLS mas sem nenhuma política: %', pendentes;
  end if;

  -- 3. Toda tabela de negócio precisa da coluna de tenant.
  select string_agg(c.relname, ', ' order by c.relname)
  into pendentes
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname not in ('oficinas')
    and not exists (
      select 1 from pg_attribute a
      where a.attrelid = c.oid
        and a.attname = 'oficina_id'
        and not a.attisdropped
    );

  if pendentes is not null then
    raise exception 'Tabelas sem coluna oficina_id: %', pendentes;
  end if;

  raise notice 'Verificação de RLS concluída: todas as tabelas protegidas.';
end $$;

-- ============================================================
-- 0015_defaults_resistentes_a_lote.sql
-- ============================================================

-- 0015 — Defaults que sobrevivem à inserção em lote
--
-- O problema, descoberto testando a tela da moto:
--
-- Quando o PostgREST recebe vários registros numa única chamada, ele monta UM
-- comando INSERT com a união das colunas de todos os registros. O registro que
-- não traz uma coluna recebe NULL explícito — e NULL não aciona o DEFAULT da
-- coluna, ele viola o NOT NULL. Ou seja: um lote onde alguns registros contam
-- com o valor padrão falha inteiro, com uma mensagem que não explica nada para
-- quem está na oficina.
--
-- Isso não afeta o cadastro de moto de hoje, que passa pela função
-- criar_moto_com_proprietario e sempre envia a data. Mas a Fase 2 é feita de
-- inserção em lote (itens de orçamento, itens de OS), e a armadilha ficaria
-- armada. Um gatilho que preenche o valor quando vier nulo resolve na origem.
--
-- Só vale para colunas cujo NULL não significa nada: a posse de uma moto sempre
-- começa em algum dia. Onde NULL carrega sentido — data_fim, que quer dizer
-- "é o dono atual" — nada é preenchido.

create or replace function public.preencher_inicio_da_posse()
returns trigger
language plpgsql
as $$
begin
  if new.data_inicio is null then
    new.data_inicio = current_date;
  end if;
  return new;
end;
$$;

create trigger moto_proprietarios_preencher_inicio
  before insert on public.moto_proprietarios
  for each row execute function public.preencher_inicio_da_posse();

comment on column public.moto_proprietarios.data_inicio is
  'Início da posse. Preenchido com a data de hoje quando vier nulo, para que a inserção em lote pelo PostgREST não quebre. Ver gatilho moto_proprietarios_preencher_inicio.';

