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
