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
