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
