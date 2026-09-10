-- 0050 — A cobrança: o que o banco precisa guardar
--
-- Três coisas: os preços, o registro bruto de tudo o que o provedor manda, e
-- as duas operações que um pagamento provoca.
--
-- O registro bruto é a parte que parece burocracia e não é. Quando um cliente
-- disser "paguei e continuo bloqueado", a diferença entre resolver em dois
-- minutos e passar a tarde adivinhando é ter o evento exatamente como ele
-- chegou — antes de qualquer interpretação nossa.

update public.planos set preco_mensal = 0     where id = 'gratuito';
update public.planos set preco_mensal = 29.99 where id = 'essencial';
update public.planos set preco_mensal = 49.99 where id = 'completo';

-- O que o provedor mandou -------------------------------------------------------
create table if not exists public.eventos_asaas (
  id uuid primary key default gen_random_uuid(),
  -- O identificador do evento no provedor. Único: o Asaas reenvia quando não
  -- recebe 200, e reenviar não pode aplicar duas vezes.
  evento_id text not null unique,
  tipo text not null,
  -- Guardado antes de qualquer interpretação. É a única cópia fiel.
  conteudo jsonb not null,
  -- Nulo quando não deu para descobrir de quem é: acontece, e não pode
  -- derrubar o registro do evento.
  oficina_id uuid references public.oficinas(id) on delete set null,
  aplicado boolean not null default false,
  observacao text,
  criado_em timestamptz not null default now()
);

create index if not exists eventos_asaas_por_oficina
  on public.eventos_asaas (oficina_id, criado_em desc);

comment on table public.eventos_asaas is
  'Tudo o que o provedor de pagamento mandou, como chegou. Só a service_role escreve e lê.';

alter table public.eventos_asaas enable row level security;

-- Deny-all deliberado: nem a oficina vê os eventos de cobrança dela. Eles
-- carregam dados do provedor que não são dela para ler, e o que interessa ao
-- cliente já aparece na tela de assinatura.
drop policy if exists "eventos de cobranca sao da plataforma" on public.eventos_asaas;
create policy "eventos de cobranca sao da plataforma"
  on public.eventos_asaas for select to authenticated
  using (false);

-- Achar a oficina pelo identificador do provedor ---------------------------------
create index if not exists assinaturas_por_cliente_externo
  on public.assinaturas (id_externo_cliente);
create index if not exists assinaturas_por_assinatura_externa
  on public.assinaturas (id_externo_assinatura);

-- O pagamento entrou --------------------------------------------------------------
-- Uma operação só, e ABSOLUTA: escreve até quando o acesso vale. Não soma dias,
-- não incrementa contador. É isso que torna o webhook seguro de repetir —
-- escrever a mesma data duas vezes dá no mesmo que escrever uma.
create or replace function public.registrar_pagamento(
  p_oficina uuid,
  p_acesso_ate date,
  p_plano public.plano_oficina default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.oficinas
    set acesso_ate = p_acesso_ate,
        plano = coalesce(p_plano, plano),
        -- Um pagamento reabre uma conta bloqueada, mas não ressuscita uma que
        -- foi suspensa ou encerrada à mão: essas são decisão de gente.
        status = case when status in ('suspensa', 'cancelada') then status else 'ativa' end
  where id = p_oficina;

  update public.assinaturas
    set proxima_cobranca = p_acesso_ate,
        situacao = 'ativa',
        atualizado_em = now()
  where oficina_id = p_oficina and situacao = 'ativa';
end;
$$;

comment on function public.registrar_pagamento is
  'Escreve até quando o acesso vale. Absoluta, e por isso segura de repetir.';

-- A assinatura acabou ---------------------------------------------------------------
-- Encerrar NÃO tira o acesso: ele segue até o fim do período já pago. Quem
-- cancela no dia 3 tendo pago até o dia 30 usa até o dia 30 — é o que foi
-- comprado, e tirar antes seria ficar com dinheiro sem entregar.
create or replace function public.encerrar_assinatura(p_oficina uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.assinaturas
    set situacao = 'encerrada',
        cancelada_em = coalesce(cancelada_em, now()),
        motivo_cancelamento = coalesce(motivo_cancelamento, p_motivo),
        atualizado_em = now()
  where oficina_id = p_oficina and situacao = 'ativa';
end;
$$;

comment on function public.encerrar_assinatura is
  'Fecha a assinatura sem mexer no acesso: ele vale até o fim do período pago.';

revoke execute on function public.registrar_pagamento(uuid, date, public.plano_oficina)
  from public, anon, authenticated;
revoke execute on function public.encerrar_assinatura(uuid, text)
  from public, anon, authenticated;

select public.conferir_fechadura();
