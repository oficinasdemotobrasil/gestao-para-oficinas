-- 0071 — Corrigir o que já foi recebido ou pago
--
-- O caso que trouxe isto: o cliente disse que pagaria no PIX, o vendedor deu
-- baixa, e na hora de pagar o cliente escolheu o cartão. Hoje não há como
-- corrigir: assim que a conta fica paga, a tela esconde todos os botões, e o
-- banco não tem função nenhuma para desfazer ou ajustar.
--
-- O único botão que sobrava fazia a coisa errada. `cancelar_conta_receber`
-- zera o valor recebido e marca a conta como cancelada — a oficina perderia
-- aquela receita do painel e do relatório do mês, para consertar um campo de
-- texto. Quem usa o sistema no balcão ia acabar fazendo isso, porque é o único
-- caminho que existe, e o faturamento do mês ficaria menor que a realidade.
--
-- Corrigir é diferente de receber de novo, e por isso é função própria e não um
-- parâmetro a mais em `receber_conta`: receber soma ao que já entrou; corrigir
-- substitui o que foi registrado. Misturar as duas faria a função somar quando
-- alguém quisesse consertar, que é exatamente o erro que se está consertando.
--
-- Toda correção fica registrada com quem fez, quando e por quê. Não é
-- burocracia: se no fim do mês o relatório de formas de pagamento não bater com
-- o caixa, a primeira pergunta do dono vai ser "quem mexeu nisto?", e sem o
-- registro a resposta é dar de ombros.

-- As contas nasceram sem o par (id, oficina_id), que é como todas as chaves
-- estrangeiras deste banco apontam — é ele que impede uma linha de uma oficina
-- apontar para a linha de outra. Como `id` já é chave primária, acrescentar o
-- par não muda nada dos dados: só abre a porta para a referência abaixo.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contas_receber_id_oficina_key') then
    alter table public.contas_receber
      add constraint contas_receber_id_oficina_key unique (id, oficina_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contas_pagar_id_oficina_key') then
    alter table public.contas_pagar
      add constraint contas_pagar_id_oficina_key unique (id, oficina_id);
  end if;
end $$;

create table if not exists public.correcoes_financeiras (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  conta_receber_id uuid,
  conta_pagar_id uuid,
  usuario_id uuid references public.usuarios (id) on delete set null,
  /** Como estava e como ficou, em texto pronto para a tela. */
  de text not null,
  para text not null,
  motivo text not null check (length(trim(motivo)) >= 3),
  criado_em timestamptz not null default now(),
  -- Uma correção é de uma conta só, de um dos dois tipos.
  constraint correcoes_uma_conta_so check (
    (conta_receber_id is not null) <> (conta_pagar_id is not null)
  ),
  constraint correcoes_receber_fk
    foreign key (conta_receber_id, oficina_id)
    references public.contas_receber (id, oficina_id) on delete cascade,
  constraint correcoes_pagar_fk
    foreign key (conta_pagar_id, oficina_id)
    references public.contas_pagar (id, oficina_id) on delete cascade
);

create index if not exists correcoes_receber_idx
  on public.correcoes_financeiras (conta_receber_id);
create index if not exists correcoes_pagar_idx
  on public.correcoes_financeiras (conta_pagar_id);

alter table public.correcoes_financeiras enable row level security;

-- Mesma régua das contas: dinheiro é do dono. E só leitura pela API — escrever
-- é pelas funções abaixo, que são as únicas que sabem manter a conta coerente.
drop policy if exists "admin le correcoes" on public.correcoes_financeiras;
create policy "admin le correcoes"
  on public.correcoes_financeiras for select to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin());

/*
 * Escrever no histórico é privilégio de quem corrige, e só no ato de corrigir.
 *
 * A política exige a chave de sessão que as funções abaixo marcam — o mesmo
 * recurso da 0060 e da 0068. Sem ela, o admin poderia inventar uma linha de
 * histórico pela API, e um histórico que o próprio auditado escreve à mão não
 * serve para responder "quem mexeu nisto?".
 */
drop policy if exists "correcao nasce da funcao" on public.correcoes_financeiras;
create policy "correcao nasce da funcao"
  on public.correcoes_financeiras for insert to authenticated
  with check (
    oficina_id = public.oficina_do_usuario()
    and public.eh_admin()
    and current_setting('app.correcao_financeira', true) = 'sim'
  );

drop trigger if exists correcoes_exigir_oficina_ativa on public.correcoes_financeiras;
create trigger correcoes_exigir_oficina_ativa
  before insert or update or delete on public.correcoes_financeiras
  for each row execute function public.exigir_oficina_ativa();

/*
 * O texto de "como estava".
 *
 * Guardado pronto, e não como colunas separadas para cada campo, porque o que
 * o dono precisa ler é uma frase: "PIX, R$ 450,00 em 12/09". Reconstruir isso
 * depois, a partir de seis colunas que podem ser nulas, seria trabalho de tela
 * para um dado que nunca mais muda.
 */
create or replace function public.descrever_recebimento(
  p_forma text, p_valor numeric, p_data date
)
returns text
language sql
immutable
as $$
  select concat_ws(
    ', ',
    coalesce(nullif(p_forma, ''), 'sem forma informada'),
    'R$ ' || to_char(p_valor, 'FM999G999G990D00'),
    case when p_data is null then null else 'em ' || to_char(p_data, 'DD/MM/YYYY') end
  );
$$;

/*
 * Corrigir um recebimento.
 *
 * Só o que foi registrado na hora da baixa: forma, data e valor. O valor da
 * conta em si não entra — ele vem da ordem de serviço, e mudar o que o cliente
 * deve é outra conversa, que se faz na ordem.
 *
 * Parâmetro nulo quer dizer "mantém". Assim a tela manda só o que a pessoa
 * mexeu, e trocar a forma de pagamento não arrasta a data junto sem querer.
 */
create or replace function public.corrigir_recebimento(
  p_conta_id uuid,
  p_valor numeric default null,
  p_data date default null,
  p_forma text default null,
  p_motivo text default null
)
returns public.contas_receber
language plpgsql
as $$
declare
  v_conta public.contas_receber;
  v_antes text;
  v_valor numeric(12, 2);
  v_data date;
  v_forma text;
begin
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Diga o motivo da correção — é o que explica a diferença no fim do mês.'
      using errcode = 'check_violation';
  end if;

  select * into v_conta from public.contas_receber where id = p_conta_id for update;
  if not found then
    raise exception 'Conta não encontrada.' using errcode = 'no_data_found';
  end if;
  if v_conta.status = 'cancelada' then
    raise exception 'Esta conta foi cancelada. Corrigir não se aplica.'
      using errcode = 'check_violation';
  end if;
  if v_conta.valor_recebido <= 0 then
    raise exception 'Nada foi recebido nesta conta ainda. Use "Marcar como recebida".'
      using errcode = 'check_violation';
  end if;

  v_valor := coalesce(p_valor, v_conta.valor_recebido);
  v_data := coalesce(p_data, v_conta.data_pagamento);
  v_forma := coalesce(p_forma, v_conta.forma_pagamento);

  if v_valor <= 0 then
    raise exception 'O valor recebido tem que ser maior que zero. Para desfazer tudo, cancele a conta.'
      using errcode = 'check_violation';
  end if;
  if v_valor > v_conta.valor then
    raise exception 'O valor recebido passa do valor da conta (%).', v_conta.valor
      using errcode = 'check_violation';
  end if;

  v_antes := public.descrever_recebimento(
    v_conta.forma_pagamento, v_conta.valor_recebido, v_conta.data_pagamento);

  update public.contas_receber
     set valor_recebido = v_valor,
         forma_pagamento = v_forma,
         -- Corrigir para menos reabre a conta: o cliente voltou a dever a
         -- diferença, e é isso que o saldo dele tem de mostrar.
         status = case when v_valor >= v_conta.valor
                       then 'paga'::public.status_conta
                       else 'aberta'::public.status_conta end,
         data_pagamento = case when v_valor >= v_conta.valor then v_data else null end
   where id = p_conta_id
  returning * into v_conta;

  perform set_config('app.correcao_financeira', 'sim', true);

  insert into public.correcoes_financeiras
    (oficina_id, conta_receber_id, usuario_id, de, para, motivo)
  values
    (v_conta.oficina_id, v_conta.id, auth.uid(), v_antes,
     public.descrever_recebimento(
       v_conta.forma_pagamento, v_conta.valor_recebido, v_conta.data_pagamento),
     trim(p_motivo));

  perform set_config('app.correcao_financeira', '', true);

  return v_conta;
end;
$$;

/*
 * Corrigir um pagamento a fornecedor.
 *
 * Aqui não há valor a corrigir: `contas_pagar` guarda o valor da conta e não
 * um valor pago separado, então pagar a menos não é um estado que exista. Se o
 * valor da conta estava errado, o que se corrige é a conta, não o pagamento.
 */
create or replace function public.corrigir_pagamento(
  p_conta_id uuid,
  p_data date default null,
  p_forma text default null,
  p_motivo text default null
)
returns public.contas_pagar
language plpgsql
as $$
declare
  v_conta public.contas_pagar;
  v_antes text;
begin
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Diga o motivo da correção — é o que explica a diferença no fim do mês.'
      using errcode = 'check_violation';
  end if;

  select * into v_conta from public.contas_pagar where id = p_conta_id for update;
  if not found then
    raise exception 'Conta não encontrada.' using errcode = 'no_data_found';
  end if;
  if v_conta.status <> 'paga' then
    raise exception 'Esta conta ainda não foi paga. Use "Marcar como paga".'
      using errcode = 'check_violation';
  end if;

  v_antes := public.descrever_recebimento(
    v_conta.forma_pagamento, v_conta.valor, v_conta.data_pagamento);

  update public.contas_pagar
     set forma_pagamento = coalesce(p_forma, forma_pagamento),
         data_pagamento = coalesce(p_data, data_pagamento)
   where id = p_conta_id
  returning * into v_conta;

  perform set_config('app.correcao_financeira', 'sim', true);

  insert into public.correcoes_financeiras
    (oficina_id, conta_pagar_id, usuario_id, de, para, motivo)
  values
    (v_conta.oficina_id, v_conta.id, auth.uid(), v_antes,
     public.descrever_recebimento(
       v_conta.forma_pagamento, v_conta.valor, v_conta.data_pagamento),
     trim(p_motivo));

  perform set_config('app.correcao_financeira', '', true);

  return v_conta;
end;
$$;

revoke all on function public.corrigir_recebimento(uuid, numeric, date, text, text)
  from public, anon;
revoke all on function public.corrigir_pagamento(uuid, date, text, text)
  from public, anon;
grant execute on function public.corrigir_recebimento(uuid, numeric, date, text, text)
  to authenticated;
grant execute on function public.corrigir_pagamento(uuid, date, text, text)
  to authenticated;

select public.conferir_fechadura();
