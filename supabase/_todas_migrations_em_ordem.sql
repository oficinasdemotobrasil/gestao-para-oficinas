-- ============================================================
-- ARQUIVO GERADO — não edite aqui.
--
-- Junta as migrations de supabase/migrations na ordem, para colar de uma vez
-- no SQL Editor do Supabase. A fonte da verdade são os arquivos numerados;
-- este aqui é só a cópia colável. Para atualizar: npm run migrations:juntar
--
-- Migrations incluídas: 33
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

-- ============================================================
-- 0016_item_avulso.sql
-- ============================================================

-- 0016 — Item avulso no orçamento
--
-- Nem tudo que entra num orçamento está no catálogo: "solda no escapamento",
-- "peça que o cliente trouxe". Hoje o item precisa ser produto ou serviço, e
-- obrigar o cadastro de um serviço novo só para orçar uma vez enche o catálogo
-- de lixo.
--
-- Esta migration tem uma linha só de propósito: o Postgres não deixa usar um
-- valor de enum na mesma transação em que ele é criado. Se estivesse junto com
-- a alteração dos CHECK que dependem dele (0018), nenhuma das duas subiria.

alter type public.tipo_item add value if not exists 'avulso';

-- ============================================================
-- 0017_responsavel_da_os.sql
-- ============================================================

-- 0017 — A ordem de serviço vai para um responsável, não só para um mecânico
--
-- Regra nova: ao aprovar um orçamento, a OS é direcionada a qualquer
-- colaborador da oficina — admin, vendedor ou mecânico. Numa oficina pequena
-- quem executa muitas vezes é o próprio dono.
--
-- O nome mecanico_id passou a mentir. Renomear agora custa esta migration;
-- depois da Fase 3, com a tela de OS construída em cima da coluna, custa um dia.
--
-- As políticas de RLS não precisam ser reescritas: o Postgres guarda a
-- expressão delas já analisada, apontando para a coluna, não para o texto do
-- nome. O recorte do mecânico continua valendo, agora sobre responsavel_id.

alter table public.ordens_servico rename column mecanico_id to responsavel_id;

alter index public.ordens_servico_mecanico_idx rename to ordens_servico_responsavel_idx;

alter table public.ordens_servico
  rename constraint ordens_servico_mecanico_fk to ordens_servico_responsavel_fk;

comment on column public.ordens_servico.responsavel_id is
  'Colaborador encarregado da OS. Qualquer perfil pode ser responsável. O mecânico só enxerga as ordens em que ele está aqui.';

-- ============================================================
-- 0018_colunas_fase2.sql
-- ============================================================

-- 0018 — Colunas que a Fase 2 passa a usar
-- Nenhuma migration anterior é editada: o que falta entra aqui.

-- Situação da nota de entrada. Cancelar não apaga a nota nem as movimentações
-- dela: gera o estorno e deixa o rastro, que é o que auditoria de estoque exige.
create type public.status_nota as enum ('lancada', 'cancelada');

alter table public.notas_fiscais_entrada
  add column status public.status_nota not null default 'lancada',
  add column cancelada_em timestamptz,
  add column cancelada_por uuid references public.usuarios (id) on delete set null,
  add constraint notas_cancelamento_coerente
    check ((status = 'cancelada') = (cancelada_em is not null));

-- O custo de compra mora na própria movimentação de entrada: os itens da nota
-- SÃO as movimentações que ela gerou. Uma tabela a menos para divergir.
alter table public.movimentacoes_estoque
  add column custo_unitario numeric(12, 2)
    check (custo_unitario is null or custo_unitario >= 0);

comment on column public.movimentacoes_estoque.custo_unitario is
  'Custo de compra, preenchido só nas entradas por nota fiscal. É preço de custo: o vendedor lê o extrato pela view vw_movimentacoes, que não expõe esta coluna.';

-- Quem lançou. auth.uid() como padrão para o app não precisar mandar.
alter table public.movimentacoes_estoque
  alter column usuario_id set default auth.uid();

-- entrada e saída são sempre positivas — o sinal vem do tipo, não do número.
-- ajuste aceita os dois sentidos: sobrou na contagem ou faltou.
alter table public.movimentacoes_estoque
  add constraint movimentacoes_quantidade_coerente check (
    (tipo in ('entrada', 'saida') and quantidade > 0)
    or (tipo = 'ajuste' and quantidade <> 0)
  );

-- Orçamento recusado com motivo escrito vira informação; sem motivo, vira
-- mistério três meses depois.
alter table public.orcamentos
  add column motivo_recusa text,
  -- Guardamos o percentual junto do valor para conseguir reabrir o orçamento
  -- mostrando "10%" e não só "R$ 45,60".
  add column desconto_percentual numeric(5, 2)
    check (desconto_percentual is null or (desconto_percentual >= 0 and desconto_percentual <= 100)),
  -- Preenchida por gatilho a partir de criado_em + validade_dias. Coluna comum,
  -- e não gerada, porque converter timestamptz em date depende do fuso e o
  -- Postgres não aceita isso numa coluna gerada.
  add column validade_ate date;

-- Item avulso não aponta para produto nem para serviço: a descrição é tudo.
alter table public.orcamento_itens drop constraint orcamento_itens_referencia_coerente;
alter table public.orcamento_itens
  add constraint orcamento_itens_referencia_coerente check (
    (tipo = 'produto' and produto_id is not null and servico_id is null)
    or (tipo = 'servico' and servico_id is not null and produto_id is null)
    or (tipo = 'avulso' and produto_id is null and servico_id is null)
  );

alter table public.os_itens drop constraint os_itens_referencia_coerente;
alter table public.os_itens
  add constraint os_itens_referencia_coerente check (
    (tipo = 'produto' and produto_id is not null and servico_id is null)
    or (tipo = 'servico' and servico_id is not null and produto_id is null)
    or (tipo = 'avulso' and produto_id is null and servico_id is null)
  );

create index notas_fiscais_status_idx on public.notas_fiscais_entrada (oficina_id, status);
create index orcamentos_status_idx on public.orcamentos (oficina_id, status);
create index movimentacoes_criado_em_idx on public.movimentacoes_estoque (oficina_id, criado_em desc);

-- ============================================================
-- 0019_estoque.sql
-- ============================================================

-- 0019 — O estoque é a soma das movimentações
--
-- produtos.estoque_atual é cache; a verdade é o extrato. Se os dois divergirem,
-- o cache mente e a oficina compra peça que já tem. Por isso quem mexe no cache
-- é o banco, em gatilho, e nunca o aplicativo.
--
-- O 'for update' não é zelo excessivo: sem ele, duas saídas simultâneas da mesma
-- peça leem o mesmo saldo, as duas passam pela verificação e o estoque termina
-- negativo. Trava a linha do produto, aplica, libera.

create or replace function public.delta_da_movimentacao(
  p_tipo public.tipo_movimentacao,
  p_quantidade numeric
)
returns numeric
language sql
immutable
as $$
  select case p_tipo
    when 'entrada' then p_quantidade
    when 'saida'   then -p_quantidade
    when 'ajuste'  then p_quantidade  -- já vem com sinal
  end
$$;

create or replace function public.aplicar_no_estoque(
  p_produto_id uuid,
  p_delta numeric
)
returns void
language plpgsql
as $$
declare
  v_saldo numeric(12, 3);
  v_novo numeric(12, 3);
  v_nome text;
  v_unidade text;
begin
  if p_delta = 0 then return; end if;

  select estoque_atual, nome, unidade
    into v_saldo, v_nome, v_unidade
  from public.produtos
  where id = p_produto_id
  for update;

  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'foreign_key_violation';
  end if;

  v_novo := v_saldo + p_delta;

  -- Estoque físico negativo não existe. A mensagem sai pronta para a tela:
  -- diz quanto tem, quanto foi pedido e de qual peça.
  if v_novo < 0 then
    raise exception 'Não há estoque suficiente de %: tem % %, você pediu %.',
      v_nome,
      trim(to_char(v_saldo, 'FM999999990.999')),
      v_unidade,
      trim(to_char(abs(p_delta), 'FM999999990.999'))
      using errcode = 'check_violation';
  end if;

  update public.produtos set estoque_atual = v_novo where id = p_produto_id;
end;
$$;

create or replace function public.movimentar_estoque()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Desfaz o efeito da linha antiga e aplica o da nova. Cobre insert, update
  -- (inclusive troca de produto) e delete com o mesmo raciocínio.
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.aplicar_no_estoque(
      old.produto_id,
      -public.delta_da_movimentacao(old.tipo, old.quantidade)
    );
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.aplicar_no_estoque(
      new.produto_id,
      public.delta_da_movimentacao(new.tipo, new.quantidade)
    );
  end if;

  return coalesce(new, old);
end;
$$;

create trigger movimentacoes_estoque_aplicar
  after insert or update or delete on public.movimentacoes_estoque
  for each row execute function public.movimentar_estoque();

-- Rede de segurança: refaz o saldo a partir do extrato inteiro. Se algum dia o
-- cache divergir, é isto que reconcilia — e é a prova viva de que o estoque é a
-- soma das movimentações.
create or replace function public.recalcular_estoque(p_produto_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_soma numeric(12, 3);
begin
  select coalesce(sum(public.delta_da_movimentacao(tipo, quantidade)), 0)
    into v_soma
  from public.movimentacoes_estoque
  where produto_id = p_produto_id;

  update public.produtos set estoque_atual = v_soma where id = p_produto_id;
  return v_soma;
end;
$$;

-- Registrar movimentação manual sem passar pela tabela.
--
-- Por que uma função em vez de insert direto: a tabela guarda custo_unitario,
-- que é preço de custo, e o vendedor não pode ler isso. A função deixa o
-- vendedor lançar entrada, saída e ajuste sem nunca receber a coluna de custo
-- de volta — ela devolve só o saldo novo.
create or replace function public.registrar_movimentacao(
  p_produto_id uuid,
  p_tipo public.tipo_movimentacao,
  p_quantidade numeric,
  p_motivo text
)
returns numeric
language plpgsql
as $$
declare
  v_oficina_id uuid := public.oficina_do_usuario();
  v_saldo numeric(12, 3);
begin
  if v_oficina_id is null then
    raise exception 'Usuário sem oficina ativa.' using errcode = 'insufficient_privilege';
  end if;

  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da movimentação.' using errcode = 'check_violation';
  end if;

  insert into public.movimentacoes_estoque
    (oficina_id, produto_id, tipo, quantidade, motivo, usuario_id)
  values
    (v_oficina_id, p_produto_id, p_tipo, p_quantidade, trim(p_motivo), auth.uid());

  select estoque_atual into v_saldo from public.produtos where id = p_produto_id;
  return v_saldo;
end;
$$;

revoke all on function public.registrar_movimentacao(uuid, public.tipo_movimentacao, numeric, text) from public, anon;
grant execute on function public.registrar_movimentacao(uuid, public.tipo_movimentacao, numeric, text) to authenticated;
revoke all on function public.recalcular_estoque(uuid) from public, anon;
grant execute on function public.recalcular_estoque(uuid) to authenticated;

-- ============================================================
-- 0020_numeracao.sql
-- ============================================================

-- 0020 — Numeração sequencial por oficina
--
-- Cada oficina tem o seu 1, o seu 2, o seu 3. O número não pode sair do
-- frontend: dois celulares criando orçamento ao mesmo tempo leriam o mesmo
-- "último número" e gerariam dois de número 42.
--
-- A trava é a linha da própria oficina. Enquanto um insert está escolhendo o
-- número, o outro espera — mas só quem for da mesma oficina. Uma oficina nunca
-- segura a outra.

create or replace function public.definir_numero_sequencial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
begin
  if new.numero is not null then
    return new;
  end if;

  perform 1 from public.oficinas where id = new.oficina_id for update;

  if tg_table_name = 'orcamentos' then
    select coalesce(max(numero), 0) + 1 into v_numero
    from public.orcamentos where oficina_id = new.oficina_id;
  else
    select coalesce(max(numero), 0) + 1 into v_numero
    from public.ordens_servico where oficina_id = new.oficina_id;
  end if;

  new.numero := v_numero;
  return new;
end;
$$;

create trigger orcamentos_numerar
  before insert on public.orcamentos
  for each row execute function public.definir_numero_sequencial();

create trigger ordens_servico_numerar
  before insert on public.ordens_servico
  for each row execute function public.definir_numero_sequencial();

-- Validade: guardada como data para a lista poder filtrar "expirado" sem
-- calcular nada na leitura. Recalculada quando o prazo muda.
create or replace function public.definir_validade_orcamento()
returns trigger
language plpgsql
as $$
begin
  new.validade_ate := (coalesce(new.criado_em, now()))::date + new.validade_dias;
  return new;
end;
$$;

create trigger orcamentos_validade
  before insert or update of validade_dias, criado_em on public.orcamentos
  for each row execute function public.definir_validade_orcamento();

-- ============================================================
-- 0021_rpcs_fase2.sql
-- ============================================================

-- 0021 — Operações que são várias escritas e precisam ser uma só
--
-- Nota com itens, cancelamento, orçamento com itens e aprovação: em todas,
-- gravar metade é pior do que não gravar nada. Uma nota sem as entradas de
-- estoque, ou uma OS sem os itens copiados, é um registro que ninguém entende
-- depois. Aqui elas viram uma transação.
--
-- Todas rodam com as permissões de quem chamou (padrão do plpgsql), então o RLS
-- continua valendo dentro delas. Nenhuma escapa do isolamento entre oficinas.

-- Nota fiscal de entrada -----------------------------------------------------
-- Os itens da nota são as movimentações de entrada que ela gera. Uma fonte de
-- verdade em vez de duas que podem discordar.
create or replace function public.salvar_nota_com_itens(
  p_numero text,
  p_fornecedor text,
  p_data_emissao date,
  p_valor_total numeric,
  p_arquivo_url text,
  p_itens jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_oficina_id uuid := public.oficina_do_usuario();
  v_nota_id uuid;
  v_item record;
begin
  if v_oficina_id is null then
    raise exception 'Usuário sem oficina ativa.' using errcode = 'insufficient_privilege';
  end if;

  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then
    raise exception 'A nota precisa de pelo menos um item.' using errcode = 'check_violation';
  end if;

  insert into public.notas_fiscais_entrada
    (oficina_id, numero, fornecedor, data_emissao, valor_total, arquivo_url)
  values
    (v_oficina_id, p_numero, p_fornecedor, p_data_emissao, coalesce(p_valor_total, 0), p_arquivo_url)
  returning id into v_nota_id;

  for v_item in
    select * from jsonb_to_recordset(p_itens)
      as x(produto_id uuid, quantidade numeric, custo_unitario numeric)
  loop
    if v_item.quantidade is null or v_item.quantidade <= 0 then
      raise exception 'Quantidade inválida em um dos itens da nota.' using errcode = 'check_violation';
    end if;

    insert into public.movimentacoes_estoque
      (oficina_id, produto_id, tipo, quantidade, motivo, nota_fiscal_id, usuario_id, custo_unitario)
    values
      (v_oficina_id, v_item.produto_id, 'entrada', v_item.quantidade,
       'Entrada pela nota ' || coalesce(p_numero, 's/n'), v_nota_id, auth.uid(), v_item.custo_unitario);
  end loop;

  return v_nota_id;
end;
$$;

-- Cancelar não apaga: estorna.
--
-- Se a peça já saiu para um serviço, o estorno derruba o estoque abaixo de zero
-- e o gatilho recusa a operação inteira. É o comportamento certo: não dá para
-- "des-receber" uma peça que já foi usada. A mensagem que chega na tela é a do
-- estoque insuficiente, dizendo qual peça travou.
create or replace function public.cancelar_nota(p_nota_id uuid)
returns void
language plpgsql
as $$
declare
  v_nota record;
  v_mov record;
begin
  select * into v_nota from public.notas_fiscais_entrada where id = p_nota_id;

  if not found then
    raise exception 'Nota não encontrada.' using errcode = 'no_data_found';
  end if;

  if v_nota.status = 'cancelada' then
    raise exception 'Esta nota já foi cancelada.' using errcode = 'check_violation';
  end if;

  for v_mov in
    select * from public.movimentacoes_estoque
    where nota_fiscal_id = p_nota_id and tipo = 'entrada'
  loop
    insert into public.movimentacoes_estoque
      (oficina_id, produto_id, tipo, quantidade, motivo, nota_fiscal_id, usuario_id)
    values
      (v_mov.oficina_id, v_mov.produto_id, 'saida', v_mov.quantidade,
       'Estorno da nota ' || coalesce(v_nota.numero, 's/n'), p_nota_id, auth.uid());
  end loop;

  update public.notas_fiscais_entrada
     set status = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid()
   where id = p_nota_id;
end;
$$;

-- Orçamento ------------------------------------------------------------------
-- Grava o orçamento e troca os itens de uma vez. Também evita a armadilha da
-- inserção em lote pelo PostgREST, em que a linha sem uma coluna recebe NULL e
-- derruba o lote inteiro (ver migration 0015).
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
  p_itens jsonb
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
       observacoes, desconto, desconto_percentual, valor_total, criado_por)
    values
      (v_oficina_id, p_cliente_id, p_moto_id, p_km_registrado,
       coalesce(p_validade_dias, 7), coalesce(p_garantia_dias, 90),
       p_observacoes, coalesce(p_desconto, 0), p_desconto_percentual, v_total, auth.uid())
    returning id into v_id;
  else
    select status into v_status from public.orcamentos where id = v_id;

    if v_status is null then
      raise exception 'Orçamento não encontrado.' using errcode = 'no_data_found';
    end if;

    -- Aprovado virou documento: a OS já nasceu dele. Editar depois faria a OS
    -- contar uma história diferente da que o cliente aprovou.
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
           valor_total = v_total
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

create or replace function public.duplicar_orcamento(p_orcamento_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_origem record;
  v_novo_id uuid;
begin
  select * into v_origem from public.orcamentos where id = p_orcamento_id;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'no_data_found';
  end if;

  insert into public.orcamentos
    (oficina_id, cliente_id, moto_id, km_registrado, validade_dias, garantia_dias,
     observacoes, desconto, desconto_percentual, valor_total, criado_por, status)
  values
    (v_origem.oficina_id, v_origem.cliente_id, v_origem.moto_id, v_origem.km_registrado,
     v_origem.validade_dias, v_origem.garantia_dias, v_origem.observacoes,
     v_origem.desconto, v_origem.desconto_percentual, v_origem.valor_total,
     auth.uid(), 'rascunho')
  returning id into v_novo_id;

  insert into public.orcamento_itens
    (oficina_id, orcamento_id, tipo, produto_id, servico_id, descricao,
     quantidade, valor_unitario, valor_total)
  select oficina_id, v_novo_id, tipo, produto_id, servico_id, descricao,
         quantidade, valor_unitario, valor_total
  from public.orcamento_itens
  where orcamento_id = p_orcamento_id;

  return v_novo_id;
end;
$$;

-- Aprovação ------------------------------------------------------------------
-- Vira ordem de serviço com os itens copiados e o responsável escolhido.
-- O estoque NÃO se mexe aqui: a baixa acontece quando a OS for finalizada, na
-- Fase 3. Dar baixa na aprovação obrigaria a estornar toda vez que uma peça
-- fosse trocada durante o serviço.
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
     km_entrada, garantia_ate, observacoes)
  values
    (v_orc.oficina_id, v_orc.id, v_orc.cliente_id, v_orc.moto_id, p_responsavel_id,
     'aberta', v_orc.km_registrado, current_date + v_orc.garantia_dias, v_orc.observacoes)
  returning id into v_os_id;

  insert into public.os_itens
    (oficina_id, ordem_servico_id, tipo, produto_id, servico_id, descricao,
     quantidade, valor_unitario, valor_total)
  select oficina_id, v_os_id, tipo, produto_id, servico_id, descricao,
         quantidade, valor_unitario, valor_total
  from public.orcamento_itens
  where orcamento_id = p_orcamento_id;

  update public.orcamentos set status = 'aprovado' where id = p_orcamento_id;

  return v_os_id;
end;
$$;

create or replace function public.recusar_orcamento(
  p_orcamento_id uuid,
  p_motivo text
)
returns void
language plpgsql
as $$
begin
  update public.orcamentos
     set status = 'recusado', motivo_recusa = nullif(trim(coalesce(p_motivo, '')), '')
   where id = p_orcamento_id and status <> 'aprovado';

  if not found then
    raise exception 'Não foi possível recusar: o orçamento não existe ou já foi aprovado.'
      using errcode = 'check_violation';
  end if;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'salvar_nota_com_itens(text, text, date, numeric, text, jsonb)',
    'cancelar_nota(uuid)',
    'salvar_orcamento_com_itens(uuid, uuid, uuid, integer, integer, integer, text, numeric, numeric, jsonb)',
    'duplicar_orcamento(uuid)',
    'aprovar_orcamento(uuid, uuid)',
    'recusar_orcamento(uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ============================================================
-- 0022_storage_notas.sql
-- ============================================================

-- 0022 — Anexo da nota fiscal no Storage
--
-- Bucket privado: sem URL pública. O arquivo só é lido por quem apresenta uma
-- sessão da oficina dona dele.
--
-- O isolamento vem do caminho do arquivo, que é sempre
--   <oficina_id>/<nota_id>/<nome do arquivo>
-- e a política compara a primeira pasta com a oficina de quem pede. Um arquivo
-- gravado fora desse formato simplesmente não passa pelo 'with check'.
--
-- Nota fiscal é preço de custo do começo ao fim, então só o admin alcança.

insert into storage.buckets (id, name, public)
values ('notas-fiscais', 'notas-fiscais', false)
on conflict (id) do nothing;

create policy "admin le anexo de nota da propria oficina"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'notas-fiscais'
    and (storage.foldername(name))[1] = public.oficina_do_usuario()::text
    and public.eh_admin()
  );

create policy "admin envia anexo de nota da propria oficina"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'notas-fiscais'
    and (storage.foldername(name))[1] = public.oficina_do_usuario()::text
    and public.eh_admin()
  );

create policy "admin apaga anexo de nota da propria oficina"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'notas-fiscais'
    and (storage.foldername(name))[1] = public.oficina_do_usuario()::text
    and public.eh_admin()
  );

-- ============================================================
-- 0023_rls_fase2.sql
-- ============================================================

-- 0023 — RLS das tabelas que a Fase 2 coloca em uso
--
-- Duas decisões, e as duas seguem a regra que já vale desde a Fase 1: o vendedor
-- opera a oficina, mas não enxerga preço de custo.
--
-- 1. Estoque é do balcão. O vendedor precisa dar entrada de peça sem depender do
--    dono. Mas a tabela guarda custo_unitario, e RLS filtra linha, não coluna —
--    então ele lê o extrato por uma view sem custo e lança pela função
--    registrar_movimentacao, que nunca preenche custo.
-- 2. Nota fiscal é do dono. Ela é preço de compra do começo ao fim: não há
--    recorte que a torne segura para quem não pode ver custo.

-- Extrato sem custo, para quem não pode ver preço de compra.
-- Mesmo desenho da vw_produtos: roda como dono, e o isolamento entre oficinas
-- depende do WHERE abaixo — que está coberto pelo teste de isolamento.
create view public.vw_movimentacoes
with (security_invoker = false, security_barrier = true)
as
select
  m.id,
  m.oficina_id,
  m.produto_id,
  p.nome as produto_nome,
  p.unidade as produto_unidade,
  m.tipo,
  m.quantidade,
  m.motivo,
  m.nota_fiscal_id,
  m.ordem_servico_id,
  m.usuario_id,
  u.nome as usuario_nome,
  m.criado_em
from public.movimentacoes_estoque m
join public.produtos p on p.id = m.produto_id
left join public.usuarios u on u.id = m.usuario_id
where m.oficina_id = public.oficina_do_usuario()
  and public.eh_atendimento();

comment on view public.vw_movimentacoes is
  'Extrato de estoque sem custo_unitario, para admin e vendedor. O admin lê a tabela direto quando precisa do custo.';

revoke all on public.vw_movimentacoes from public, anon;
grant select on public.vw_movimentacoes to authenticated;

-- O vendedor passa a poder lançar movimentação — mas nunca com custo, e o
-- 'with check' garante isso mesmo se alguém chamar a API na mão.
create policy "vendedor lanca movimentacao sem custo"
  on public.movimentacoes_estoque for insert to authenticated
  with check (
    oficina_id = public.oficina_do_usuario()
    and public.eh_vendedor()
    and custo_unitario is null
  );

-- Orçamentos: admin e vendedor operam, mecânico não alcança.
-- As políticas de 0010 já dizem exatamente isso ('atendimento' = admin +
-- vendedor), então não há nada a mudar em orcamentos nem em orcamento_itens.
-- Esta migration existe também para deixar isso escrito, e não subentendido.

-- Ordem de serviço: quem aprova o orçamento é atendimento, e a OS nasce por RPC.
-- O mecânico continua vendo só as ordens em que ele é o responsável (0011).

do $$
declare
  pendentes text;
begin
  -- A mesma checagem da 0014, agora incluindo as tabelas que entraram em uso.
  select string_agg(c.relname, ', ' order by c.relname)
  into pendentes
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and (not c.relrowsecurity
         or not exists (select 1 from pg_policy p where p.polrelid = c.oid));

  if pendentes is not null then
    raise exception 'Tabelas sem RLS ou sem política: %', pendentes;
  end if;
end $$;

-- ============================================================
-- 0024_saldo_inicial_e_protecao.sql
-- ============================================================

-- 0024 — O saldo inicial também é uma movimentação
--
-- Defeito encontrado testando a 0019: o formulário de produto tem o campo
-- "estoque atual", e o que era digitado ali ia direto para a coluna, sem
-- movimentação nenhuma. O invariante "estoque = soma das movimentações" nascia
-- falso, e recalcular_estoque zeraria o produto — porque, para o extrato, ele
-- nunca tinha recebido nada.
--
-- Duas travas:
--
-- 1. Produto cadastrado com estoque vira um ajuste de "Saldo inicial do
--    cadastro". A quantidade entra pelo caminho normal, e o extrato conta a
--    história desde o primeiro dia.
-- 2. Ninguém mais escreve em estoque_atual direto. Quem tentar recebe uma
--    mensagem dizendo o que fazer. O único jeito de mexer no saldo passa a ser
--    registrar movimentação — que é exatamente o que foi pedido.

create or replace function public.registrar_saldo_inicial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inicial numeric(12, 3) := coalesce(new.estoque_atual, 0);
begin
  if v_inicial = 0 then
    return null;
  end if;

  -- Devolve a coluna a zero e deixa a movimentação recompor o valor. O gatilho
  -- de proteção deixa esta escrita passar porque ela vem de dentro de um gatilho.
  update public.produtos set estoque_atual = 0 where id = new.id;

  insert into public.movimentacoes_estoque
    (oficina_id, produto_id, tipo, quantidade, motivo, usuario_id)
  values
    (new.oficina_id, new.id, 'ajuste', v_inicial, 'Saldo inicial do cadastro', auth.uid());

  return null;
end;
$$;

create trigger produtos_saldo_inicial
  after insert on public.produtos
  for each row execute function public.registrar_saldo_inicial();

create or replace function public.proteger_estoque_atual()
returns trigger
language plpgsql
as $$
begin
  -- Escrita vinda de outro gatilho (o de movimentação, o de saldo inicial) ou da
  -- reconciliação: essas são as donas legítimas da coluna.
  if pg_trigger_depth() > 1
     or coalesce(current_setting('app.estoque_interno', true), 'nao') = 'sim'
  then
    return new;
  end if;

  if new.estoque_atual is distinct from old.estoque_atual then
    raise exception
      'O estoque não é alterado direto no cadastro. Registre uma entrada, uma saída ou um ajuste.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger produtos_proteger_estoque
  before update on public.produtos
  for each row execute function public.proteger_estoque_atual();

-- A reconciliação escreve na coluna por dever de ofício: avisa que é ela.
create or replace function public.recalcular_estoque(p_produto_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_soma numeric(12, 3);
begin
  select coalesce(sum(public.delta_da_movimentacao(tipo, quantidade)), 0)
    into v_soma
  from public.movimentacoes_estoque
  where produto_id = p_produto_id;

  perform set_config('app.estoque_interno', 'sim', true);
  update public.produtos set estoque_atual = v_soma where id = p_produto_id;
  perform set_config('app.estoque_interno', 'nao', true);

  return v_soma;
end;
$$;

revoke all on function public.recalcular_estoque(uuid) from public, anon;
grant execute on function public.recalcular_estoque(uuid) to authenticated;

-- ============================================================
-- 0025_mensagem_de_estoque.sql
-- ============================================================

-- 0025 — A mensagem de estoque insuficiente em português de gente
--
-- O teste contra o Supabase mostrou a mensagem saindo assim:
--   "Não há estoque suficiente de Óleo 10W30: tem 14. L, você pediu 999."
-- Sobra um ponto depois do 14, e o separador decimal é o americano. Quem lê
-- rápido, com a moto na frente, tropeça nisso.
--
-- Passa a sair:
--   "Não há estoque suficiente de Óleo 10W30: tem 14 L, você pediu 999."
--   "Não há estoque suficiente de Óleo 10W30: tem 2,5 L, você pediu 4."

create or replace function public.formatar_quantidade(p_valor numeric)
returns text
language sql
immutable
as $$
  -- to_char devolve "14." para um inteiro; tira o zero à direita, depois o
  -- ponto solto, e por fim troca o separador decimal pela vírgula.
  select replace(
    rtrim(rtrim(to_char(p_valor, 'FM999999990.999'), '0'), '.'),
    '.', ','
  )
$$;

create or replace function public.aplicar_no_estoque(
  p_produto_id uuid,
  p_delta numeric
)
returns void
language plpgsql
as $$
declare
  v_saldo numeric(12, 3);
  v_novo numeric(12, 3);
  v_nome text;
  v_unidade text;
begin
  if p_delta = 0 then return; end if;

  select estoque_atual, nome, unidade
    into v_saldo, v_nome, v_unidade
  from public.produtos
  where id = p_produto_id
  for update;

  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'foreign_key_violation';
  end if;

  v_novo := v_saldo + p_delta;

  if v_novo < 0 then
    raise exception 'Não há estoque suficiente de %: tem % %, você pediu %.',
      v_nome,
      public.formatar_quantidade(v_saldo),
      v_unidade,
      public.formatar_quantidade(abs(p_delta))
      using errcode = 'check_violation';
  end if;

  update public.produtos set estoque_atual = v_novo where id = p_produto_id;
end;
$$;

-- ============================================================
-- 0026_valor_da_os.sql
-- ============================================================

-- 0026 — A ordem de serviço passa a saber o próprio valor
--
-- Até aqui a OS copiava os itens do orçamento e mais nada. O desconto ficava
-- só no orçamento, e a tela da ordem tinha de ir buscá-lo lá para não mostrar
-- um número maior do que o cliente aprovou.
--
-- Isso para de funcionar na Fase 3, em que a OS é editada durante o serviço:
-- entra uma peça, sai outra, e o orçamento deixa de descrever o que está sendo
-- feito. A partir daqui o valor da OS é a verdade, e o orçamento é histórico.
--
-- O desconto é guardado do jeito que a pessoa o escolheu: 'valor' guarda reais,
-- 'percentual' guarda o percentual — senão, ao acrescentar uma peça no meio do
-- serviço, um desconto de 10% viraria um valor fixo e encolheria sozinho.

alter table public.ordens_servico
  add column if not exists desconto numeric(12, 2) not null default 0
    check (desconto >= 0),
  -- Texto com check, e não um enum: enum novo exige transação própria para ser
  -- usado (foi o que obrigou a migration 0016 a existir sozinha), e aqui não
  -- compensa esse custo por dois valores que não vão crescer.
  add column if not exists desconto_tipo text
    check (desconto_tipo is null or desconto_tipo in ('valor', 'percentual')),
  add column if not exists valor_total numeric(12, 2) not null default 0
    check (valor_total >= 0);

comment on column public.ordens_servico.desconto is
  'O número que a pessoa digitou. Leia junto com desconto_tipo: em reais, ou em porcentagem sobre a soma dos itens.';
comment on column public.ordens_servico.valor_total is
  'Valor da ordem, já com o desconto. Fonte de verdade do financeiro — o orçamento é histórico.';

-- Cálculo -------------------------------------------------------------------
-- A conta é a mesma do orçamento (0021), na mesma ordem e sem arredondar no
-- meio: é isso que faz a OS nascer com o centavo idêntico ao que o cliente
-- aprovou. Mudar uma das duas e não mudar a outra faz as duas discordarem.
create or replace function public.total_da_os(p_ordem_servico_id uuid)
returns numeric
language sql
stable
as $$
  with soma as (
    select coalesce(sum(valor_total), 0) as itens
    from public.os_itens
    where ordem_servico_id = p_ordem_servico_id
  ),
  os as (
    select desconto, desconto_tipo
    from public.ordens_servico
    where id = p_ordem_servico_id
  )
  select greatest(
    soma.itens - least(
      case
        when os.desconto_tipo = 'percentual'
          then soma.itens * least(greatest(os.desconto, 0), 100) / 100
        else os.desconto
      end,
      soma.itens
    ),
    0
  )::numeric(12, 2)
  from soma, os;
$$;

-- Definer de propósito: o total é invariante do sistema, não edição de
-- ninguém. Sem isto, o mecânico que marca um item como executado dispararia um
-- update em ordens_servico que a política dele poderia recusar, e o item
-- deixaria de ser salvo por causa de uma conta que ele nem pediu.
create or replace function public.recalcular_total_da_os(p_ordem_servico_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ordens_servico
     set valor_total = public.total_da_os(p_ordem_servico_id)
   where id = p_ordem_servico_id;
$$;

create or replace function public.total_da_os_apos_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Gatilho por linha, e não por comando: a inserção em lote de uma OS tem
  -- dezena de itens, não milhares, e por linha o código fica sem tabela de
  -- transição para manter.
  if tg_op = 'DELETE' then
    perform public.recalcular_total_da_os(old.ordem_servico_id);
    return old;
  end if;

  perform public.recalcular_total_da_os(new.ordem_servico_id);
  -- Item que muda de ordem (não deveria acontecer) deixaria a antiga errada.
  if tg_op = 'UPDATE' and old.ordem_servico_id is distinct from new.ordem_servico_id then
    perform public.recalcular_total_da_os(old.ordem_servico_id);
  end if;
  return new;
end;
$$;

drop trigger if exists os_itens_recalcular_total on public.os_itens;
create trigger os_itens_recalcular_total
  after insert or update or delete on public.os_itens
  for each row execute function public.total_da_os_apos_item();

-- Aprovação -----------------------------------------------------------------
-- Passa a levar o desconto junto, e a gravar o total exatamente como estava no
-- orçamento aprovado.
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
     -- O orçamento guarda o desconto sempre em reais, e o percentual à parte
     -- como lembrança de como foi escolhido. A OS guarda o que foi digitado.
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

  -- O gatilho acima já recalculou. Aqui o valor aprovado é gravado por cima,
  -- ao centavo: é ele que o cliente aceitou, e é ele que vai para a conta a
  -- receber. Enquanto ninguém mexer nos itens, os dois números são o mesmo.
  update public.ordens_servico
     set valor_total = v_orc.valor_total
   where id = v_os_id;

  update public.orcamentos set status = 'aprovado' where id = p_orcamento_id;

  return v_os_id;
end;
$$;

-- Ordens que já existiam ----------------------------------------------------
-- Preenche o que nasceu antes destas colunas. Roda uma vez; rodar de novo não
-- estraga nada, porque reescreve com o mesmo valor.
update public.ordens_servico os
   set desconto = case when o.desconto_percentual is not null
                       then o.desconto_percentual else coalesce(o.desconto, 0) end,
       desconto_tipo = case when o.desconto_percentual is not null
                            then 'percentual' else 'valor' end,
       valor_total = o.valor_total
  from public.orcamentos o
 where o.id = os.orcamento_id;

-- OS aberta na mão, sem orçamento: o valor é a soma dos itens dela.
update public.ordens_servico os
   set desconto_tipo = coalesce(os.desconto_tipo, 'valor'),
       valor_total = public.total_da_os(os.id)
 where os.orcamento_id is null;

-- ============================================================
-- 0027_status_aguardando_conferencia.sql
-- ============================================================

-- 0027 — O status que faltava entre o mecânico e o gerente
--
-- O mecânico não finaliza a ordem: ele avisa que terminou. Quem finaliza é
-- quem confere o serviço e cobra — e finalizar dá baixa no estoque, o que não
-- é decisão de quem está com a chave na mão.
--
-- 'aguardando_conferencia' entra ANTES de 'finalizada' na ordem do enum porque
-- o Postgres ordena enum pela ordem de declaração, e as listas de OS ordenam
-- por status. Entrando no fim, a ordem ficaria "finalizada, entregue,
-- cancelada, aguardando conferência" — errada na tela sem nenhum aviso.
--
-- Sozinho neste arquivo por obrigação do Postgres: valor novo de enum não pode
-- ser usado na mesma transação em que foi criado. Foi a mesma razão da 0016.

alter type public.status_os add value if not exists 'aguardando_conferencia' before 'finalizada';

-- ============================================================
-- 0028_ciclo_da_os.sql
-- ============================================================

-- 0028 — O ciclo de vida da ordem de serviço
--
-- Até aqui a OS nascia 'aberta' e ficava. Agora ela anda, e cada passo fica
-- registrado com quem deu e quando. Três regras moram no banco, e não na tela:
--
-- 1. Não se pula etapa. De 'aberta' não se vai direto para 'entregue'.
-- 2. O mecânico anda só no pedaço dele. Ele começa, pausa, retoma e avisa que
--    terminou. Finalizar, entregar e cancelar são de quem confere e cobra.
-- 3. Ordem finalizada não muda mais de itens. O que foi cobrado foi cobrado.
--
-- Na tela essas regras também aparecem, escondendo botão. Mas é aqui que elas
-- valem: dois celulares abrem a mesma OS ao mesmo tempo, e a tela do segundo
-- não sabe o que o primeiro acabou de fazer.

-- Observação técnica separada da comercial ------------------------------------
-- A OS herda 'observacoes' do orçamento — que hoje costuma ser o texto de venda
-- escrito para convencer o cliente. Mandar isso para o mecânico como se fosse
-- instrução de serviço é confundir quem está trabalhando.
alter table public.ordens_servico
  add column if not exists observacoes_tecnicas text;

comment on column public.ordens_servico.observacoes is
  'Veio do orçamento: é o texto que o cliente leu. Histórico, não instrução.';
comment on column public.ordens_servico.observacoes_tecnicas is
  'O que o mecânico escreveu enquanto trabalhava. É isto que sai no PDF da OS.';

-- Histórico de status ---------------------------------------------------------
create table if not exists public.os_status_historico (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  ordem_servico_id uuid not null,
  -- Nulo na primeira linha: a ordem não vinha de status nenhum.
  de public.status_os,
  para public.status_os not null,
  -- Nulo se a linha nasceu de um processo do banco e não de uma pessoa.
  usuario_id uuid,
  criado_em timestamptz not null default now(),
  constraint os_status_historico_os_fk
    foreign key (ordem_servico_id, oficina_id) references public.ordens_servico (id, oficina_id) on delete cascade,
  constraint os_status_historico_usuario_fk
    foreign key (usuario_id, oficina_id) references public.usuarios (id, oficina_id) on delete set null
);

create index if not exists os_status_historico_oficina_id_idx
  on public.os_status_historico (oficina_id);
create index if not exists os_status_historico_os_idx
  on public.os_status_historico (ordem_servico_id, criado_em);

alter table public.os_status_historico enable row level security;

-- Quem enxerga a ordem enxerga o andamento dela. Ninguém escreve pela mão: as
-- linhas nascem só do gatilho, que roda como dono do banco.
create policy "atendimento le o historico da os"
  on public.os_status_historico for select to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "mecanico le o historico das proprias ordens"
  on public.os_status_historico for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and exists (
      select 1 from public.ordens_servico os
      where os.id = os_status_historico.ordem_servico_id
        and os.responsavel_id = auth.uid()
    )
  );

-- Quais passos existem --------------------------------------------------------
create or replace function public.transicao_de_os_valida(
  p_de public.status_os,
  p_para public.status_os
)
returns boolean
language sql
immutable
as $$
  select case p_de
    when 'aberta' then p_para in ('em_andamento', 'cancelada')
    when 'em_andamento' then p_para in ('pausada', 'aguardando_conferencia', 'finalizada', 'cancelada')
    when 'pausada' then p_para in ('em_andamento', 'cancelada')
    -- Volta para 'em_andamento' quando a conferência acha que faltou algo.
    when 'aguardando_conferencia' then p_para in ('em_andamento', 'finalizada', 'cancelada')
    when 'finalizada' then p_para in ('entregue', 'cancelada')
    -- Entregue e cancelada são fim de linha. Ordem entregue que voltou é ordem
    -- nova, com o histórico da anterior à vista — não a mesma reaberta.
    else false
  end;
$$;

comment on function public.transicao_de_os_valida is
  'Os passos permitidos do ciclo da OS. Cancelar vale até a entrega; depois dela, não.';

create or replace function public.nome_do_status_os(p_status public.status_os)
returns text
language sql
immutable
as $$
  select case p_status
    when 'aberta' then 'aberta'
    when 'em_andamento' then 'em andamento'
    when 'pausada' then 'pausada'
    when 'aguardando_conferencia' then 'aguardando conferência'
    when 'finalizada' then 'finalizada'
    when 'entregue' then 'entregue'
    when 'cancelada' then 'cancelada'
  end;
$$;

-- A trava ---------------------------------------------------------------------
create or replace function public.conferir_mudanca_de_status_da_os()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not public.transicao_de_os_valida(old.status, new.status) then
    raise exception 'A ordem está % e não pode passar para %.',
      public.nome_do_status_os(old.status), public.nome_do_status_os(new.status)
      using errcode = 'check_violation';
  end if;

  -- O mecânico anda só no pedaço dele. Sem isto, bastaria uma chamada direta à
  -- API para ele finalizar a própria ordem e dar baixa no estoque.
  if public.eh_mecanico()
     and new.status not in ('em_andamento', 'pausada', 'aguardando_conferencia') then
    if new.status = 'cancelada' then
      raise exception 'Cancelar a ordem é de quem atende o cliente.'
        using errcode = 'insufficient_privilege';
    end if;
    raise exception 'Marque a ordem como pronta para conferência. Finalizar é de quem confere o serviço.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists ordens_servico_conferir_status on public.ordens_servico;
create trigger ordens_servico_conferir_status
  before update on public.ordens_servico
  for each row execute function public.conferir_mudanca_de_status_da_os();

-- O registro ------------------------------------------------------------------
-- Definer: a linha do histórico não é escrita por ninguém, é consequência. Se
-- dependesse da política de quem mudou o status, a ordem mudaria e o registro
-- não apareceria — que é a única forma de perder essa informação.
create or replace function public.registrar_status_da_os()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.os_status_historico (oficina_id, ordem_servico_id, de, para, usuario_id)
    values (new.oficina_id, new.id, null, new.status, auth.uid());
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.os_status_historico (oficina_id, ordem_servico_id, de, para, usuario_id)
    values (new.oficina_id, new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists ordens_servico_registrar_status on public.ordens_servico;
create trigger ordens_servico_registrar_status
  after insert or update on public.ordens_servico
  for each row execute function public.registrar_status_da_os();

-- Ordem fechada não muda de itens ---------------------------------------------
create or replace function public.conferir_edicao_de_item_da_os()
returns trigger
language plpgsql
as $$
declare
  v_os_id uuid := coalesce(new.ordem_servico_id, old.ordem_servico_id);
  v_status public.status_os;
begin
  select status into v_status from public.ordens_servico where id = v_os_id;

  if v_status is null then
    return coalesce(new, old);
  end if;

  if v_status not in ('aberta', 'em_andamento', 'pausada', 'aguardando_conferencia') then
    raise exception 'A ordem está % e não aceita mais mudança de itens.',
      public.nome_do_status_os(v_status)
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists os_itens_conferir_edicao on public.os_itens;
create trigger os_itens_conferir_edicao
  before insert or update or delete on public.os_itens
  for each row execute function public.conferir_edicao_de_item_da_os();

-- Mudar de status -------------------------------------------------------------
-- Existe para a tela ter uma porta só, e para a mensagem de erro sair pronta.
-- As regras continuam nos gatilhos: quem chamar a tabela direto passa por elas
-- do mesmo jeito.
create or replace function public.mudar_status_da_os(
  p_ordem_servico_id uuid,
  p_status public.status_os
)
returns public.ordens_servico
language plpgsql
as $$
declare
  v_os public.ordens_servico;
begin
  if p_status in ('finalizada', 'cancelada') then
    raise exception 'Finalizar e cancelar têm caminho próprio, que mexe no estoque.'
      using errcode = 'check_violation';
  end if;

  update public.ordens_servico
     set status = p_status,
         data_conclusao = case when p_status = 'entregue' then now() else data_conclusao end
   where id = p_ordem_servico_id
  returning * into v_os;

  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'no_data_found';
  end if;

  return v_os;
end;
$$;

-- A fechadura, agora reaproveitável -------------------------------------------
-- O mesmo conteúdo da 0014, virado função para as migrations desta fase
-- poderem chamar. O comentário de lá continua valendo: deixar isso na mão de
-- conferência manual significa que, na décima tabela nova, alguém esquece.
create or replace function public.conferir_fechadura()
returns void
language plpgsql
as $$
declare
  pendentes text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into pendentes
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if pendentes is not null then
    raise exception 'Tabelas sem RLS ativado: %', pendentes;
  end if;

  select string_agg(c.relname, ', ' order by c.relname) into pendentes
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid);
  if pendentes is not null then
    raise exception 'Tabelas com RLS mas sem nenhuma política: %', pendentes;
  end if;

  select string_agg(c.relname, ', ' order by c.relname) into pendentes
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('oficinas')
    and not exists (
      select 1 from pg_attribute a
      where a.attrelid = c.oid and a.attname = 'oficina_id' and not a.attisdropped
    );
  if pendentes is not null then
    raise exception 'Tabelas sem coluna oficina_id: %', pendentes;
  end if;
end;
$$;

select public.conferir_fechadura();

-- ============================================================
-- 0029_finalizar_e_cancelar_os.sql
-- ============================================================

-- 0029 — Finalizar dá baixa no estoque; cancelar devolve
--
-- A baixa acontece na finalização, e não na aprovação, porque entre uma coisa
-- e outra a moto pode nem ter entrado na oficina. Peça reservada não é peça
-- consumida.
--
-- A parte delicada é o saldo insuficiente. Hoje o banco recusa qualquer
-- movimentação que deixe o estoque negativo, e essa trava já evitou erro nos
-- testes. Mas na finalização ela mente: a peça FOI aplicada na moto: negar
-- isso é o sistema discordando da realidade, e quem perde é o dono, que fica
-- sem saber o que saiu.
--
-- Então a trava continua valendo em todo lugar — entrada, saída avulsa,
-- ajuste, cancelamento de nota — e só a finalização pode passar por cima, com
-- pedido explícito de quem está finalizando. A movimentação nasce marcada, e o
-- extrato mostra exatamente onde o cadastro descolou da realidade.

-- A brecha, estreita de propósito ---------------------------------------------
-- 'app.estoque_pode_negativar' só existe dentro da transação que a liga, e só
-- finalizar_os a liga. Mesma técnica do 'app.estoque_interno' da 0024.
create or replace function public.aplicar_no_estoque(
  p_produto_id uuid,
  p_delta numeric
)
returns void
language plpgsql
as $$
declare
  v_saldo numeric(12, 3);
  v_novo numeric(12, 3);
  v_nome text;
  v_unidade text;
begin
  if p_delta = 0 then return; end if;

  select estoque_atual, nome, unidade
    into v_saldo, v_nome, v_unidade
  from public.produtos
  where id = p_produto_id
  for update;

  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'foreign_key_violation';
  end if;

  v_novo := v_saldo + p_delta;

  if v_novo < 0 and coalesce(current_setting('app.estoque_pode_negativar', true), '') <> 'sim' then
    raise exception 'Não há estoque suficiente de %: tem % %, você pediu %.',
      v_nome,
      public.formatar_quantidade(v_saldo),
      v_unidade,
      public.formatar_quantidade(abs(p_delta))
      using errcode = 'check_violation';
  end if;

  update public.produtos set estoque_atual = v_novo where id = p_produto_id;
end;
$$;

-- O que falta para finalizar --------------------------------------------------
-- Devolve uma linha por peça sem saldo. A tela chama antes de finalizar para
-- dizer o que falta; finalizar_os chama de novo, porque entre a pergunta e a
-- resposta outra pessoa pode ter dado saída na mesma peça.
create or replace function public.faltas_para_finalizar_os(p_ordem_servico_id uuid)
returns table (
  produto_id uuid,
  nome text,
  unidade text,
  necessario numeric,
  em_estoque numeric,
  falta numeric
)
language sql
stable
as $$
  select p.id, p.nome, p.unidade,
         sum(i.quantidade) as necessario,
         p.estoque_atual,
         sum(i.quantidade) - p.estoque_atual as falta
  from public.os_itens i
  join public.produtos p on p.id = i.produto_id
  where i.ordem_servico_id = p_ordem_servico_id
    and i.tipo = 'produto'
  group by p.id, p.nome, p.unidade, p.estoque_atual
  having sum(i.quantidade) > p.estoque_atual;
$$;

-- Só finaliza quem passa pela porta certa -------------------------------------
-- Sem isto, um update direto na tabela levaria a ordem para 'finalizada' sem
-- baixar peça nenhuma, e o estoque continuaria dizendo que a peça está na
-- prateleira. A regra não pode depender de a tela chamar a função certa.
create or replace function public.conferir_fechamento_da_os()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status in ('finalizada', 'cancelada')
     and coalesce(current_setting('app.os_fechamento', true), '') <> 'sim' then
    raise exception 'Finalizar e cancelar mexem no estoque: use finalizar_os ou cancelar_os.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists ordens_servico_conferir_fechamento on public.ordens_servico;
create trigger ordens_servico_conferir_fechamento
  before update on public.ordens_servico
  for each row execute function public.conferir_fechamento_da_os();

-- Finalizar -------------------------------------------------------------------
create or replace function public.finalizar_os(
  p_ordem_servico_id uuid,
  p_permitir_negativo boolean default false
)
returns public.ordens_servico
language plpgsql
as $$
declare
  v_os public.ordens_servico;
  v_faltas text;
  v_item record;
  v_negativou boolean := false;
begin
  select * into v_os from public.ordens_servico where id = p_ordem_servico_id for update;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'no_data_found';
  end if;

  if not public.transicao_de_os_valida(v_os.status, 'finalizada') then
    raise exception 'A ordem está % e não pode ser finalizada.',
      public.nome_do_status_os(v_os.status) using errcode = 'check_violation';
  end if;

  select string_agg(
           format('%s (tem %s %s, precisa de %s)',
                  f.nome,
                  public.formatar_quantidade(f.em_estoque),
                  f.unidade,
                  public.formatar_quantidade(f.necessario)),
           E'\n')
    into v_faltas
  from public.faltas_para_finalizar_os(p_ordem_servico_id) f;

  if v_faltas is not null then
    if not p_permitir_negativo then
      -- A mensagem já sai pronta para a tela: quais peças e quanto falta de
      -- cada uma. Sem isso, o dono descobre a falta uma peça por vez.
      raise exception E'Falta peça em estoque para finalizar:\n%', v_faltas
        using errcode = 'check_violation';
    end if;
    v_negativou := true;
    perform set_config('app.estoque_pode_negativar', 'sim', true);
  end if;

  for v_item in
    select i.produto_id, sum(i.quantidade) as quantidade
    from public.os_itens i
    where i.ordem_servico_id = p_ordem_servico_id and i.tipo = 'produto'
      and i.produto_id is not null
    group by i.produto_id
  loop
    insert into public.movimentacoes_estoque
      (oficina_id, produto_id, tipo, quantidade, motivo, ordem_servico_id, usuario_id)
    values
      (v_os.oficina_id, v_item.produto_id, 'saida', v_item.quantidade,
       case when v_negativou
            then format('Aplicado na OS nº %s (saldo insuficiente no cadastro)',
                        lpad(v_os.numero::text, 4, '0'))
            else format('Aplicado na OS nº %s', lpad(v_os.numero::text, 4, '0'))
       end,
       p_ordem_servico_id, auth.uid());
  end loop;

  perform set_config('app.estoque_pode_negativar', '', true);

  perform set_config('app.os_fechamento', 'sim', true);
  update public.ordens_servico
     set status = 'finalizada',
         data_conclusao = now()
   where id = p_ordem_servico_id
  returning * into v_os;
  perform set_config('app.os_fechamento', '', true);

  return v_os;
end;
$$;

-- Cancelar --------------------------------------------------------------------
-- Estorna com movimentação de entrada, nunca apagando o extrato. Mesma razão da
-- nota fiscal cancelada (0021): o extrato conta o que aconteceu, e o que
-- aconteceu foi uma saída seguida de uma devolução.
create or replace function public.cancelar_os(
  p_ordem_servico_id uuid,
  p_motivo text default null
)
returns public.ordens_servico
language plpgsql
as $$
declare
  v_os public.ordens_servico;
  v_mov record;
begin
  select * into v_os from public.ordens_servico where id = p_ordem_servico_id for update;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'no_data_found';
  end if;

  if not public.transicao_de_os_valida(v_os.status, 'cancelada') then
    raise exception 'A ordem está % e não pode mais ser cancelada.',
      public.nome_do_status_os(v_os.status) using errcode = 'check_violation';
  end if;

  for v_mov in
    select produto_id, quantidade
    from public.movimentacoes_estoque
    where ordem_servico_id = p_ordem_servico_id and tipo = 'saida'
  loop
    insert into public.movimentacoes_estoque
      (oficina_id, produto_id, tipo, quantidade, motivo, ordem_servico_id, usuario_id)
    values
      (v_os.oficina_id, v_mov.produto_id, 'entrada', v_mov.quantidade,
       format('Devolvido do cancelamento da OS nº %s', lpad(v_os.numero::text, 4, '0')),
       p_ordem_servico_id, auth.uid());
  end loop;

  perform set_config('app.os_fechamento', 'sim', true);
  update public.ordens_servico
     set status = 'cancelada',
         observacoes_tecnicas = case
           when coalesce(trim(p_motivo), '') = '' then observacoes_tecnicas
           else concat_ws(E'\n\n', observacoes_tecnicas,
                          format('Cancelada: %s', trim(p_motivo)))
         end
   where id = p_ordem_servico_id
  returning * into v_os;
  perform set_config('app.os_fechamento', '', true);

  return v_os;
end;
$$;

select public.conferir_fechadura();

-- ============================================================
-- 0030_marcar_so_a_peca_que_faltou.sql
-- ============================================================

-- 0030 — A marca de "sem saldo" vai só na peça que faltou
--
-- O teste no navegador mostrou o defeito: uma ordem com óleo em falta e kit de
-- relação sobrando finalizou com as DUAS saídas marcadas como
-- "(saldo insuficiente no cadastro)". O kit tinha saldo.
--
-- A marca existe para o dono achar no extrato onde o cadastro descolou da
-- prateleira. Marcando peça que estava certa, ela deixa de servir para isso —
-- vira ruído, e ruído em extrato é pior do que marca nenhuma.
--
-- A lista das peças em falta é lida UMA vez, antes de qualquer baixa. Lida
-- dentro do laço, ela mudaria a cada peça já baixada e voltaria a mentir, agora
-- ao contrário.

-- E a trava só barra o que piora o saldo -------------------------------------
-- Segundo defeito que o teste encontrou, mais grave que o primeiro: cancelar
-- uma ordem finalizada com estoque negativo era impossível. A devolução é uma
-- ENTRADA, mas a trava olhava só o saldo final — e como ele continuava
-- negativo (de -6 para -5), ela recusava a própria devolução.
--
-- O estoque ficava preso: a ordem não podia ser cancelada, e a peça não voltava.
-- A regra certa é olhar a direção: entrada nunca piora nada, e não há motivo
-- para barrá-la. Só a saída e o ajuste para baixo precisam de licença.
create or replace function public.aplicar_no_estoque(
  p_produto_id uuid,
  p_delta numeric
)
returns void
language plpgsql
as $$
declare
  v_saldo numeric(12, 3);
  v_novo numeric(12, 3);
  v_nome text;
  v_unidade text;
begin
  if p_delta = 0 then return; end if;

  select estoque_atual, nome, unidade
    into v_saldo, v_nome, v_unidade
  from public.produtos
  where id = p_produto_id
  for update;

  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'foreign_key_violation';
  end if;

  v_novo := v_saldo + p_delta;

  if v_novo < 0
     and p_delta < 0
     and coalesce(current_setting('app.estoque_pode_negativar', true), '') <> 'sim' then
    raise exception 'Não há estoque suficiente de %: tem % %, você pediu %.',
      v_nome,
      public.formatar_quantidade(v_saldo),
      v_unidade,
      public.formatar_quantidade(abs(p_delta))
      using errcode = 'check_violation';
  end if;

  update public.produtos set estoque_atual = v_novo where id = p_produto_id;
end;
$$;

create or replace function public.finalizar_os(
  p_ordem_servico_id uuid,
  p_permitir_negativo boolean default false
)
returns public.ordens_servico
language plpgsql
as $$
declare
  v_os public.ordens_servico;
  v_faltas text;
  v_sem_saldo uuid[];
  v_item record;
begin
  select * into v_os from public.ordens_servico where id = p_ordem_servico_id for update;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'no_data_found';
  end if;

  if not public.transicao_de_os_valida(v_os.status, 'finalizada') then
    raise exception 'A ordem está % e não pode ser finalizada.',
      public.nome_do_status_os(v_os.status) using errcode = 'check_violation';
  end if;

  select string_agg(
           format('%s (tem %s %s, precisa de %s)',
                  f.nome,
                  public.formatar_quantidade(f.em_estoque),
                  f.unidade,
                  public.formatar_quantidade(f.necessario)),
           E'\n'),
         coalesce(array_agg(f.produto_id), '{}')
    into v_faltas, v_sem_saldo
  from public.faltas_para_finalizar_os(p_ordem_servico_id) f;

  if v_faltas is not null then
    if not p_permitir_negativo then
      raise exception E'Falta peça em estoque para finalizar:\n%', v_faltas
        using errcode = 'check_violation';
    end if;
    perform set_config('app.estoque_pode_negativar', 'sim', true);
  end if;

  for v_item in
    select i.produto_id, sum(i.quantidade) as quantidade
    from public.os_itens i
    where i.ordem_servico_id = p_ordem_servico_id and i.tipo = 'produto'
      and i.produto_id is not null
    group by i.produto_id
  loop
    insert into public.movimentacoes_estoque
      (oficina_id, produto_id, tipo, quantidade, motivo, ordem_servico_id, usuario_id)
    values
      (v_os.oficina_id, v_item.produto_id, 'saida', v_item.quantidade,
       case when v_item.produto_id = any(v_sem_saldo)
            then format('Aplicado na OS nº %s (saldo insuficiente no cadastro)',
                        lpad(v_os.numero::text, 4, '0'))
            else format('Aplicado na OS nº %s', lpad(v_os.numero::text, 4, '0'))
       end,
       p_ordem_servico_id, auth.uid());
  end loop;

  perform set_config('app.estoque_pode_negativar', '', true);

  perform set_config('app.os_fechamento', 'sim', true);
  update public.ordens_servico
     set status = 'finalizada',
         data_conclusao = now()
   where id = p_ordem_servico_id
  returning * into v_os;
  perform set_config('app.os_fechamento', '', true);

  return v_os;
end;
$$;

-- ============================================================
-- 0031_apagar_colaborador_nao_derruba_historico.sql
-- ============================================================

-- 0031 — Apagar um colaborador não pode derrubar o histórico
--
-- A chave estrangeira do histórico de status aponta para (usuario_id,
-- oficina_id) e foi escrita com 'on delete set null'. Sem dizer QUAIS colunas,
-- o Postgres tenta anular as duas — e oficina_id é not null. Resultado: apagar
-- um colaborador falhava com um erro que não explicava nada.
--
-- No dia a dia isso não aparece, porque colaborador que sai é desativado e não
-- apagado. Apareceu na limpeza das oficinas de teste, que apaga de verdade — e
-- o que quebra o teste quebraria também o dia em que alguém precisasse remover
-- um cadastro criado por engano.
--
-- A correção diz a coluna: só o usuário some do registro; a oficina fica, e a
-- linha do histórico continua contando o que aconteceu.

alter table public.os_status_historico
  drop constraint if exists os_status_historico_usuario_fk;

alter table public.os_status_historico
  add constraint os_status_historico_usuario_fk
  foreign key (usuario_id, oficina_id)
  references public.usuarios (id, oficina_id)
  on delete set null (usuario_id);

-- ============================================================
-- 0032_apontamento_de_tempo.sql
-- ============================================================

-- 0032 — O relógio da oficina
--
-- O tempo é apontado pelo próprio andamento da ordem: começar o serviço liga o
-- relógio, pausar desliga, avisar que terminou desliga. Ninguém tem de lembrar
-- de dois botões — na oficina, o que exige lembrar não é feito.
--
-- A regra difícil é a do apontamento único: um mecânico não pode estar em duas
-- motos ao mesmo tempo. Ela mora aqui, e não na tela, por dois motivos: o
-- celular dele pode estar com a tela antiga aberta, e um índice único não
-- depende de ninguém lembrar de checar antes.

-- Um relógio ligado por mecânico ---------------------------------------------
-- Índice parcial: só as linhas em aberto disputam. As fechadas, que são a
-- maioria e crescem para sempre, ficam de fora.
create unique index if not exists apontamentos_tempo_um_aberto_por_mecanico
  on public.apontamentos_tempo (mecanico_id)
  where fim is null;

-- Mensagem no lugar de tropeço -----------------------------------------------
-- O mecânico que tentava finalizar recebia "new row violates row-level
-- security policy for table movimentacoes_estoque": a trava funcionava, mas por
-- acidente, e falando inglês de banco de dados. Agora a recusa vem na frente,
-- em português, antes de qualquer escrita.
create or replace function public.finalizar_os(
  p_ordem_servico_id uuid,
  p_permitir_negativo boolean default false
)
returns public.ordens_servico
language plpgsql
as $$
declare
  v_os public.ordens_servico;
  v_faltas text;
  v_sem_saldo uuid[];
  v_item record;
begin
  if public.eh_mecanico() then
    raise exception 'Marque a ordem como pronta para conferência. Finalizar é de quem confere o serviço.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_os from public.ordens_servico where id = p_ordem_servico_id for update;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'no_data_found';
  end if;

  if not public.transicao_de_os_valida(v_os.status, 'finalizada') then
    raise exception 'A ordem está % e não pode ser finalizada.',
      public.nome_do_status_os(v_os.status) using errcode = 'check_violation';
  end if;

  select string_agg(
           format('%s (tem %s %s, precisa de %s)',
                  f.nome,
                  public.formatar_quantidade(f.em_estoque),
                  f.unidade,
                  public.formatar_quantidade(f.necessario)),
           E'\n'),
         coalesce(array_agg(f.produto_id), '{}')
    into v_faltas, v_sem_saldo
  from public.faltas_para_finalizar_os(p_ordem_servico_id) f;

  if v_faltas is not null then
    if not p_permitir_negativo then
      raise exception E'Falta peça em estoque para finalizar:\n%', v_faltas
        using errcode = 'check_violation';
    end if;
    perform set_config('app.estoque_pode_negativar', 'sim', true);
  end if;

  for v_item in
    select i.produto_id, sum(i.quantidade) as quantidade
    from public.os_itens i
    where i.ordem_servico_id = p_ordem_servico_id and i.tipo = 'produto'
      and i.produto_id is not null
    group by i.produto_id
  loop
    insert into public.movimentacoes_estoque
      (oficina_id, produto_id, tipo, quantidade, motivo, ordem_servico_id, usuario_id)
    values
      (v_os.oficina_id, v_item.produto_id, 'saida', v_item.quantidade,
       case when v_item.produto_id = any(v_sem_saldo)
            then format('Aplicado na OS nº %s (saldo insuficiente no cadastro)',
                        lpad(v_os.numero::text, 4, '0'))
            else format('Aplicado na OS nº %s', lpad(v_os.numero::text, 4, '0'))
       end,
       p_ordem_servico_id, auth.uid());
  end loop;

  perform set_config('app.estoque_pode_negativar', '', true);

  perform set_config('app.os_fechamento', 'sim', true);
  update public.ordens_servico
     set status = 'finalizada',
         data_conclusao = now()
   where id = p_ordem_servico_id
  returning * into v_os;
  perform set_config('app.os_fechamento', '', true);

  return v_os;
end;
$$;

create or replace function public.cancelar_os(
  p_ordem_servico_id uuid,
  p_motivo text default null
)
returns public.ordens_servico
language plpgsql
as $$
declare
  v_os public.ordens_servico;
  v_mov record;
begin
  if public.eh_mecanico() then
    raise exception 'Cancelar a ordem é de quem atende o cliente.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_os from public.ordens_servico where id = p_ordem_servico_id for update;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'no_data_found';
  end if;

  if not public.transicao_de_os_valida(v_os.status, 'cancelada') then
    raise exception 'A ordem está % e não pode mais ser cancelada.',
      public.nome_do_status_os(v_os.status) using errcode = 'check_violation';
  end if;

  for v_mov in
    select produto_id, quantidade
    from public.movimentacoes_estoque
    where ordem_servico_id = p_ordem_servico_id and tipo = 'saida'
  loop
    insert into public.movimentacoes_estoque
      (oficina_id, produto_id, tipo, quantidade, motivo, ordem_servico_id, usuario_id)
    values
      (v_os.oficina_id, v_mov.produto_id, 'entrada', v_mov.quantidade,
       format('Devolvido do cancelamento da OS nº %s', lpad(v_os.numero::text, 4, '0')),
       p_ordem_servico_id, auth.uid());
  end loop;

  perform set_config('app.os_fechamento', 'sim', true);
  update public.ordens_servico
     set status = 'cancelada',
         observacoes_tecnicas = case
           when coalesce(trim(p_motivo), '') = '' then observacoes_tecnicas
           else concat_ws(E'\n\n', observacoes_tecnicas,
                          format('Cancelada: %s', trim(p_motivo)))
         end
   where id = p_ordem_servico_id
  returning * into v_os;
  perform set_config('app.os_fechamento', '', true);

  return v_os;
end;
$$;

-- O relógio segue o status ----------------------------------------------------
-- Definer: o apontamento é consequência do andamento, não escrita de ninguém.
-- Sem isto, o admin que também põe a mão na moto não conseguiria apontar tempo
-- — a política de insert da tabela é só do mecânico —, e a ordem mudaria de
-- status com o relógio parado, que é o pior dos dois mundos.
create or replace function public.ajustar_relogio_da_os()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outro record;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Saiu de 'em andamento': o relógio desta ordem para, seja quem for que
  -- estava com ela. Se o gerente pausou, o tempo do mecânico também para.
  if old.status = 'em_andamento' then
    update public.apontamentos_tempo
       set fim = now()
     where ordem_servico_id = new.id and fim is null;
  end if;

  if new.status = 'em_andamento' then
    -- Uma moto de cada vez. O relógio que estava aberto em outra ordem fecha, e
    -- aquela ordem volta para 'pausada' — senão ela ficaria "em andamento" com
    -- ninguém trabalhando nela.
    for v_outro in
      select a.id, a.ordem_servico_id
      from public.apontamentos_tempo a
      where a.mecanico_id = auth.uid() and a.fim is null and a.ordem_servico_id <> new.id
    loop
      update public.apontamentos_tempo set fim = now() where id = v_outro.id;
      update public.ordens_servico
         set status = 'pausada'
       where id = v_outro.ordem_servico_id and status = 'em_andamento';
    end loop;

    -- Retomar o que já estava aberto nesta mesma ordem não abre outro registro.
    if not exists (
      select 1 from public.apontamentos_tempo
      where ordem_servico_id = new.id and mecanico_id = auth.uid() and fim is null
    ) then
      insert into public.apontamentos_tempo (oficina_id, ordem_servico_id, mecanico_id)
      values (new.oficina_id, new.id, auth.uid());
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ordens_servico_ajustar_relogio on public.ordens_servico;
create trigger ordens_servico_ajustar_relogio
  after update on public.ordens_servico
  for each row execute function public.ajustar_relogio_da_os();

-- Quanto tempo já foi ---------------------------------------------------------
-- Uma chamada só devolve o que a tela precisa: o que já fechou, desde quando o
-- relógio está rodando (para o cronômetro contar sozinho, sem consultar o
-- servidor a cada segundo) e quanto os serviços da ordem foram estimados.
create or replace function public.tempo_da_os(p_ordem_servico_id uuid)
returns table (
  minutos_registrados integer,
  rodando_desde timestamptz,
  quem_esta_com_ela text,
  minutos_estimados integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((
      select sum(a.duracao_minutos)::integer
      from public.apontamentos_tempo a
      where a.ordem_servico_id = p_ordem_servico_id and a.fim is not null
    ), 0),
    (select a.inicio from public.apontamentos_tempo a
      where a.ordem_servico_id = p_ordem_servico_id and a.fim is null
      order by a.inicio limit 1),
    (select u.nome from public.apontamentos_tempo a
       join public.usuarios u on u.id = a.mecanico_id
      where a.ordem_servico_id = p_ordem_servico_id and a.fim is null
      order by a.inicio limit 1),
    coalesce((
      select sum(s.tempo_estimado_minutos * i.quantidade)::integer
      from public.os_itens i
      join public.servicos s on s.id = i.servico_id
      where i.ordem_servico_id = p_ordem_servico_id
        and i.tipo = 'servico'
        and s.tempo_estimado_minutos is not null
    ), 0);
$$;

comment on function public.tempo_da_os is
  'O que a tela do cronômetro precisa numa chamada só. Definer porque o total soma o tempo de todos os mecânicos, e cada um só enxerga o próprio apontamento.';

-- Quem foi pausado ------------------------------------------------------------
-- mudar_status_da_os passa a dizer se pausou outra ordem, para a tela avisar em
-- vez de a pessoa descobrir sozinha que a moto de antes parou.
drop function if exists public.mudar_status_da_os(uuid, public.status_os);

create function public.mudar_status_da_os(
  p_ordem_servico_id uuid,
  p_status public.status_os
)
returns jsonb
language plpgsql
as $$
declare
  v_os public.ordens_servico;
  v_pausada text;
begin
  if p_status in ('finalizada', 'cancelada') then
    raise exception 'Finalizar e cancelar têm caminho próprio, que mexe no estoque.'
      using errcode = 'check_violation';
  end if;

  -- Lido ANTES da mudança: depois dela o apontamento da outra ordem já fechou,
  -- e não haveria mais como saber qual foi.
  if p_status = 'em_andamento' then
    select o.numero::text into v_pausada
    from public.apontamentos_tempo a
    join public.ordens_servico o on o.id = a.ordem_servico_id
    where a.mecanico_id = auth.uid() and a.fim is null
      and a.ordem_servico_id <> p_ordem_servico_id
    order by a.inicio
    limit 1;
  end if;

  update public.ordens_servico
     set status = p_status,
         data_conclusao = case when p_status = 'entregue' then now() else data_conclusao end
   where id = p_ordem_servico_id
  returning * into v_os;

  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'no_data_found';
  end if;

  return jsonb_build_object(
    'ordem', to_jsonb(v_os),
    'pausou_a_ordem', v_pausada
  );
end;
$$;

select public.conferir_fechadura();

-- ============================================================
-- 0033_o_mecanico_nao_ve_dinheiro.sql
-- ============================================================

-- 0033 — O mecânico deixa de enxergar dinheiro, no banco e não só na tela
--
-- Até aqui a tela escondia os valores do mecânico, e a tela é conveniência: o
-- mesmo mecânico abrindo o aplicativo no navegador do computador, ou chamando a
-- API na mão, recebia o preço de cada item e o total da ordem. O critério de
-- aceite da fase é outro — ele não vê valor "nem digitando a URL na mão".
--
-- RLS filtra LINHA, não COLUNA. Não existe política que devolva a ordem sem o
-- valor_total. Então o caminho é o mesmo do preço de custo (vw_produtos, 0012):
-- o mecânico perde a leitura direta das tabelas com dinheiro e passa a receber,
-- por funções que rodam como dono do banco, exatamente o que a tela dele
-- precisa — e nada além.
--
-- Isso muda a forma do aplicativo dele, e está certo assim: a Fase 3 pediu um
-- app diferente e mais simples para quem está com a chave na mão.

-- Item executado --------------------------------------------------------------
alter table public.os_itens
  add column if not exists executado_em timestamptz,
  add column if not exists executado_por uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'os_itens_executado_por_fk'
  ) then
    alter table public.os_itens
      add constraint os_itens_executado_por_fk
      foreign key (executado_por, oficina_id)
      references public.usuarios (id, oficina_id)
      on delete set null (executado_por);
  end if;
end $$;

comment on column public.os_itens.executado_em is
  'Quando o mecânico marcou este item como feito. Nulo enquanto está por fazer.';

-- A ordem é dele? -------------------------------------------------------------
-- Vira função porque, sem a leitura direta de ordens_servico, as políticas que
-- perguntavam "existe uma OS minha com este cliente?" parariam de enxergar a
-- própria OS. Roda como dono do banco pelo mesmo motivo das outras auxiliares.
create or replace function public.ordem_e_do_mecanico(p_ordem_servico_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ordens_servico os
    where os.id = p_ordem_servico_id
      and os.oficina_id = public.oficina_do_usuario()
      and os.responsavel_id = auth.uid()
  );
$$;

-- Fim da leitura direta do que tem dinheiro -----------------------------------
drop policy if exists "mecanico le as proprias ordens" on public.ordens_servico;
drop policy if exists "mecanico le itens das proprias ordens" on public.os_itens;

-- As políticas que dependiam daquela leitura passam pela função --------------
-- Cliente e moto da ordem dele ------------------------------------------------
-- Estas duas perguntavam "existe uma OS minha com este cliente?" olhando
-- ordens_servico direto — e é justamente essa leitura que ele acabou de perder.
-- A pergunta continua a mesma; quem responde passa a ser uma função que roda
-- como dona do banco. Sem isto, o mecânico abre a ordem e não sabe de que moto
-- nem de quem ela é.
create or replace function public.cliente_tem_ordem_do_mecanico(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ordens_servico os
    where os.cliente_id = p_cliente_id
      and os.oficina_id = public.oficina_do_usuario()
      and os.responsavel_id = auth.uid()
  );
$$;

create or replace function public.moto_tem_ordem_do_mecanico(p_moto_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ordens_servico os
    where os.moto_id = p_moto_id
      and os.oficina_id = public.oficina_do_usuario()
      and os.responsavel_id = auth.uid()
  );
$$;

drop policy if exists "mecanico le o cliente da propria ordem" on public.clientes;
create policy "mecanico le o cliente da propria ordem"
  on public.clientes for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and public.cliente_tem_ordem_do_mecanico(clientes.id)
  );

drop policy if exists "mecanico le a moto da propria ordem" on public.motos;
create policy "mecanico le a moto da propria ordem"
  on public.motos for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and public.moto_tem_ordem_do_mecanico(motos.id)
  );

drop policy if exists "mecanico le o historico das proprias ordens" on public.os_status_historico;
create policy "mecanico le o historico das proprias ordens"
  on public.os_status_historico for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and public.ordem_e_do_mecanico(os_status_historico.ordem_servico_id)
  );

drop policy if exists "mecanico registra o proprio apontamento" on public.apontamentos_tempo;
create policy "mecanico registra o proprio apontamento"
  on public.apontamentos_tempo for insert to authenticated
  with check (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and mecanico_id = auth.uid()
    and public.ordem_e_do_mecanico(apontamentos_tempo.ordem_servico_id)
  );

-- Marcar item como feito ------------------------------------------------------
-- Única escrita do mecânico em os_itens, e ela não toca em preço nem em
-- quantidade. Por isso é uma função, e não uma política de update: política
-- libera a LINHA inteira, e a linha tem dinheiro.
create or replace function public.marcar_item_executado(
  p_item_id uuid,
  p_feito boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os_id uuid;
  v_status public.status_os;
begin
  select i.ordem_servico_id, os.status
    into v_os_id, v_status
  from public.os_itens i
  join public.ordens_servico os on os.id = i.ordem_servico_id
  where i.id = p_item_id
    and os.oficina_id = public.oficina_do_usuario();

  if v_os_id is null then
    raise exception 'Item não encontrado.' using errcode = 'no_data_found';
  end if;

  -- Definer passa por cima do RLS: a dona da permissão aqui é esta verificação.
  if public.eh_mecanico() and not public.ordem_e_do_mecanico(v_os_id) then
    raise exception 'Esta ordem não está com você.' using errcode = 'insufficient_privilege';
  end if;

  if v_status not in ('aberta', 'em_andamento', 'pausada', 'aguardando_conferencia') then
    raise exception 'A ordem está % e não aceita mais mudança.',
      public.nome_do_status_os(v_status) using errcode = 'check_violation';
  end if;

  update public.os_itens
     set executado_em = case when p_feito then now() else null end,
         executado_por = case when p_feito then auth.uid() else null end
   where id = p_item_id;
end;
$$;

-- O mecânico não mexe no dinheiro da ordem ------------------------------------
-- Ele continua com update em ordens_servico (é assim que muda de status e
-- escreve a observação técnica). A política libera a linha inteira; este gatilho
-- fecha as colunas que ela abriria.
create or replace function public.mecanico_nao_mexe_no_dinheiro()
returns trigger
language plpgsql
as $$
begin
  -- pg_trigger_depth() > 1: a mudança veio de outro gatilho ou de uma função do
  -- próprio banco — o recálculo do total, por exemplo —, e não do dedo dele.
  if not public.eh_mecanico() or pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.valor_total is distinct from old.valor_total
     or new.desconto is distinct from old.desconto
     or new.desconto_tipo is distinct from old.desconto_tipo
     or new.cliente_id is distinct from old.cliente_id
     or new.moto_id is distinct from old.moto_id
     or new.responsavel_id is distinct from old.responsavel_id
     or new.orcamento_id is distinct from old.orcamento_id then
    raise exception 'Valores e atribuição da ordem são de quem atende o cliente.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists ordens_servico_mecanico_nao_mexe_no_dinheiro on public.ordens_servico;
create trigger ordens_servico_mecanico_nao_mexe_no_dinheiro
  before update on public.ordens_servico
  for each row execute function public.mecanico_nao_mexe_no_dinheiro();

-- Mudar de status sem ler a tabela --------------------------------------------
-- 'update ... returning' exige política de select, que o mecânico já não tem.
-- A função passa a rodar como dona do banco, e a permissão que valia pelo RLS
-- é refeita aqui, escrita à vista.
drop function if exists public.mudar_status_da_os(uuid, public.status_os);

create function public.mudar_status_da_os(
  p_ordem_servico_id uuid,
  p_status public.status_os
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os public.ordens_servico;
  v_pausada text;
begin
  if p_status in ('finalizada', 'cancelada') then
    raise exception 'Finalizar e cancelar têm caminho próprio, que mexe no estoque.'
      using errcode = 'check_violation';
  end if;

  select * into v_os from public.ordens_servico
   where id = p_ordem_servico_id and oficina_id = public.oficina_do_usuario();
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'no_data_found';
  end if;

  if public.eh_mecanico() and not public.ordem_e_do_mecanico(p_ordem_servico_id) then
    raise exception 'Esta ordem não está com você.' using errcode = 'insufficient_privilege';
  end if;
  if not public.eh_mecanico() and not public.eh_atendimento() then
    raise exception 'Sem permissão para mexer nesta ordem.' using errcode = 'insufficient_privilege';
  end if;

  -- Lido ANTES da mudança: depois dela o apontamento da outra ordem já fechou.
  if p_status = 'em_andamento' then
    select o.numero::text into v_pausada
    from public.apontamentos_tempo a
    join public.ordens_servico o on o.id = a.ordem_servico_id
    where a.mecanico_id = auth.uid() and a.fim is null
      and a.ordem_servico_id <> p_ordem_servico_id
    order by a.inicio
    limit 1;
  end if;

  update public.ordens_servico
     set status = p_status,
         data_conclusao = case when p_status = 'entregue' then now() else data_conclusao end
   where id = p_ordem_servico_id
  returning * into v_os;

  -- O mecânico recebe a ordem sem os campos de dinheiro. Mandar o objeto
  -- inteiro aqui desfaria, numa linha, tudo o que esta migration fez.
  return jsonb_build_object(
    'ordem', case
      when public.eh_mecanico()
        then to_jsonb(v_os) - 'valor_total' - 'desconto' - 'desconto_tipo'
      else to_jsonb(v_os)
    end,
    'pausou_a_ordem', v_pausada
  );
end;
$$;

-- A observação técnica, que é dele -------------------------------------------
-- Também precisa de função própria, e pelo mesmo motivo do status: um
-- 'update ... where id = X' precisa LER a linha para achá-la, e ler é
-- justamente o que ele não pode mais. Sem isto, o campo de observação do
-- mecânico salvaria em silêncio, sem gravar nada — o pior tipo de defeito.
create or replace function public.salvar_observacoes_tecnicas(
  p_ordem_servico_id uuid,
  p_texto text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.status_os;
begin
  select status into v_status
  from public.ordens_servico
  where id = p_ordem_servico_id and oficina_id = public.oficina_do_usuario();

  if v_status is null then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'no_data_found';
  end if;

  if public.eh_mecanico() and not public.ordem_e_do_mecanico(p_ordem_servico_id) then
    raise exception 'Esta ordem não está com você.' using errcode = 'insufficient_privilege';
  end if;
  if not public.eh_mecanico() and not public.eh_atendimento() then
    raise exception 'Sem permissão para mexer nesta ordem.' using errcode = 'insufficient_privilege';
  end if;

  if v_status not in ('aberta', 'em_andamento', 'pausada', 'aguardando_conferencia') then
    raise exception 'A ordem está % e não aceita mais mudança.',
      public.nome_do_status_os(v_status) using errcode = 'check_violation';
  end if;

  update public.ordens_servico
     set observacoes_tecnicas = nullif(trim(p_texto), '')
   where id = p_ordem_servico_id;
end;
$$;

-- Política que virou letra morta ----------------------------------------------
-- Ela deixaria o mecânico atualizar a própria ordem — mas um update precisa ler
-- a linha para achá-la, e a leitura acabou de sair. Na prática ela não casa mais
-- nada. Fica removida para não enganar quem ler as políticas amanhã achando que
-- por ali passa alguma coisa.
drop policy if exists "mecanico atualiza as proprias ordens" on public.ordens_servico;

-- O aplicativo do mecânico ----------------------------------------------------
-- Duas funções entregam a tela dele inteira, sem passar por nenhuma tabela com
-- dinheiro. O que não está aqui, ele não recebe — e é mais fácil conferir uma
-- lista de campos do que confiar que nenhuma consulta da tela pediu demais.
create or replace function public.ordens_do_mecanico()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(linha order by linha->>'ordem_status', linha->>'numero'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', os.id,
      'numero', os.numero,
      'status', os.status,
      'data_abertura', os.data_abertura,
      'km_entrada', os.km_entrada,
      'cliente_nome', c.nome,
      'placa', m.placa,
      'marca', m.marca,
      'modelo', m.modelo,
      -- Em andamento primeiro, depois pausada, depois o resto: é a ordem em que
      -- o dia dele acontece.
      'ordem_status', case os.status
        when 'em_andamento' then '1'
        when 'pausada' then '2'
        when 'aberta' then '3'
        when 'aguardando_conferencia' then '4'
        else '5' end
    ) as linha
    from public.ordens_servico os
    left join public.clientes c on c.id = os.cliente_id
    left join public.motos m on m.id = os.moto_id
    where os.oficina_id = public.oficina_do_usuario()
      and os.responsavel_id = auth.uid()
      and os.status in ('aberta', 'em_andamento', 'pausada', 'aguardando_conferencia')
  ) t;
$$;

create or replace function public.os_do_mecanico(p_ordem_servico_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.ordem_e_do_mecanico(p_ordem_servico_id) then
    raise exception 'Esta ordem não está com você.' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'id', os.id,
    'numero', os.numero,
    'status', os.status,
    'data_abertura', os.data_abertura,
    'km_entrada', os.km_entrada,
    'garantia_ate', os.garantia_ate,
    'observacoes_tecnicas', os.observacoes_tecnicas,
    'cliente_nome', c.nome,
    'placa', m.placa,
    'marca', m.marca,
    'modelo', m.modelo,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'tipo', i.tipo,
        'descricao', i.descricao,
        'quantidade', i.quantidade,
        'executado_em', i.executado_em
      ) order by i.criado_em)
      from public.os_itens i
      where i.ordem_servico_id = os.id
    ), '[]'::jsonb)
  )
  into v
  from public.ordens_servico os
  left join public.clientes c on c.id = os.cliente_id
  left join public.motos m on m.id = os.moto_id
  where os.id = p_ordem_servico_id;

  return v;
end;
$$;

comment on function public.os_do_mecanico is
  'A tela do mecânico inteira, sem nenhum valor. O que não está listado aqui, ele não recebe.';

select public.conferir_fechadura();

