-- 0044 — A situação da oficina passa a ser calculada, não agendada
--
-- Esta é a decisão central da cobrança, e ela merece explicação.
--
-- O caminho comum seria guardar `status` numa coluna e ter uma tarefa diária
-- que a atualiza: venceu, marca atrasada; passou a carência, marca bloqueada.
-- O problema é o defeito que isso produz quando a tarefa não roda — e um dia
-- ela não roda. Uma oficina que pagou amanhece bloqueada, ou uma que não pagou
-- continua trabalhando. Nos dois casos o banco está mentindo, e ninguém sabe.
--
-- Aqui a situação é DERIVADA das datas, toda vez que alguém pergunta. Não há
-- relógio para falhar, não há fila para atrasar, e não existe estado velho.
--
-- A coluna `status` continua existindo, com outro papel: ela guarda o que um
-- HUMANO decidiu — suspender, encerrar. Decisão de gente manda sobre o cálculo.
--
--   acesso_ate nulo  = liberado sem prazo. É o estado de hoje, de propósito:
--                      enquanto não há cobrança, ninguém vence.

alter table public.oficinas
  add column if not exists acesso_ate date,
  add column if not exists teste_ate date;

comment on column public.oficinas.acesso_ate is
  'Até quando o acesso está garantido. Nulo é sem prazo — nada vence.';
comment on column public.oficinas.teste_ate is
  'Fim dos dias de teste. Serve para a tela dizer quantos faltam.';

-- Assinaturas -----------------------------------------------------------------
create table if not exists public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null references public.oficinas(id) on delete cascade,
  plano public.plano_oficina not null references public.planos(id),
  -- 'ativa' e 'encerrada' bastam: o resto (atraso, bloqueio) é calculado a
  -- partir das datas, e guardar duas vezes a mesma verdade é convite a elas
  -- discordarem.
  situacao text not null default 'ativa' check (situacao in ('ativa', 'encerrada')),
  inicio date not null default current_date,
  proxima_cobranca date,
  cancelada_em timestamptz,
  motivo_cancelamento text,
  motivo_detalhe text,
  -- Identificadores do provedor de pagamento, quando existir.
  id_externo_cliente text,
  id_externo_assinatura text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists assinaturas_por_oficina on public.assinaturas (oficina_id, criado_em desc);

comment on table public.assinaturas is
  'O contrato de cada oficina. Quem cobra escreve aqui; o app só lê.';

alter table public.assinaturas enable row level security;

drop policy if exists "a oficina ve a propria assinatura" on public.assinaturas;
create policy "a oficina ve a propria assinatura"
  on public.assinaturas for select to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin());

-- Sem política de escrita: assinatura é escrita por quem cobra, com a
-- service_role. O cliente nunca edita o próprio contrato.

-- A situação, calculada ---------------------------------------------------------
create or replace function public.situacao_da_oficina(p_oficina uuid)
returns public.status_oficina
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- Decisão de gente manda sobre qualquer cálculo.
    when o.status in ('suspensa', 'cancelada') then o.status
    -- Sem prazo: nada vence. É o estado de quem ainda não entrou na cobrança.
    when o.acesso_ate is null then 'ativa'::public.status_oficina
    when current_date <= o.acesso_ate then
      case
        when exists (
          select 1 from public.assinaturas a
          where a.oficina_id = o.id and a.situacao = 'ativa'
        ) then 'ativa'::public.status_oficina
        else 'teste'::public.status_oficina
      end
    -- Sete dias de carência: continua registrando, com aviso no topo.
    when current_date <= o.acesso_ate + 7 then 'atrasada'::public.status_oficina
    else 'bloqueada'::public.status_oficina
  end
  from public.oficinas o
  where o.id = p_oficina;
$$;

comment on function public.situacao_da_oficina is
  'A situação de hoje, calculada das datas. Nunca fica velha porque nunca é guardada.';

create or replace function public.minha_situacao()
returns public.status_oficina
language sql
stable
security definer
set search_path = public
as $$
  select public.situacao_da_oficina(u.oficina_id)
  from public.usuarios u
  where u.id = auth.uid() and u.ativo;
$$;

-- Quem escreve -------------------------------------------------------------------
-- Antes: `o.status = 'ativa'`. Agora as três situações que ainda registram.
-- A carência escreve de propósito: ela existe para a oficina não parar por
-- causa de um boleto que atrasou dois dias.
create or replace function public.oficina_pode_escrever()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.id = auth.uid()
      and u.ativo
      and public.situacao_da_oficina(u.oficina_id) in ('teste', 'ativa', 'atrasada')
  );
$$;

comment on function public.oficina_pode_escrever is
  'Verdadeiro em teste, ativa e atrasada. Bloqueada e suspensa leem tudo e não registram nada.';

-- A mensagem passa a dizer a verdade da situação --------------------------------
create or replace function public.exigir_oficina_ativa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_situacao public.status_oficina;
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if public.oficina_pode_escrever() then
    return coalesce(new, old);
  end if;

  v_situacao := public.minha_situacao();

  -- Mensagens diferentes porque as saídas são diferentes: uma se resolve
  -- pagando, a outra falando com quem suspendeu.
  if v_situacao = 'bloqueada' then
    raise exception
      'O acesso está bloqueado por falta de pagamento. Você continua consultando tudo e pode exportar seus dados, mas não dá para registrar nada até regularizar.'
      using errcode = 'insufficient_privilege';
  elsif v_situacao = 'cancelada' then
    raise exception
      'Esta conta foi encerrada. Você ainda pode exportar seus dados.'
      using errcode = 'insufficient_privilege';
  else
    raise exception
      'A oficina está suspensa. Você continua consultando tudo, mas não dá para registrar nada até a situação ser regularizada.'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- Conta encerrada não abre mais os dados na tela ---------------------------------
--
-- Uma linha, e as quarenta e poucas políticas fecham juntas: todas comparam
-- oficina_id com esta função, então devolver nulo apaga a tela inteira de uma
-- vez. Fazer isso política por política seria quarenta chances de esquecer uma.
--
-- Repare que só 'cancelada' corta a leitura. 'bloqueada' NÃO corta, e isso é
-- regra do projeto, não descuido: os dados são da oficina, e uma fatura em
-- atraso não pode virar sequestro de histórico.
--
-- A exportação sai por outro caminho, que não passa por aqui — é por isso que
-- ela continua funcionando com a conta encerrada.
create or replace function public.oficina_do_usuario()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.oficina_id
  from public.usuarios u
  join public.oficinas o on o.id = u.oficina_id
  where u.id = auth.uid()
    and u.ativo
    and o.status <> 'cancelada'
$$;

comment on function public.oficina_do_usuario is
  'A oficina de quem está logado. Nula na conta encerrada, o que fecha todas as políticas de uma vez.';

select public.conferir_fechadura();
