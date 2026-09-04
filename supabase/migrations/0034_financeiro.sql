-- 0034 — O dinheiro entrando e saindo
--
-- As duas tabelas nasceram na 0007 e estavam paradas. Aqui elas ganham o que
-- faltava para servirem no balcão: recebimento parcelado, baixa parcial,
-- categoria de despesa configurável e conta que se repete por N meses.
--
-- Duas decisões que valem explicar:
--
-- 'atrasada' NÃO é gravada. Ela é o status somado ao calendário, calculado na
-- leitura — a mesma escolha do orçamento expirado (api.ts, Fase 2). Gravar
-- exigiria alguém rodando uma tarefa todo dia, e um dia sem rodar mostraria
-- conta vencida como em dia.
--
-- O valor recebido é uma coluna à parte, e não um desconto no valor. Uma conta
-- de R$ 500 com R$ 200 recebidos continua sendo uma conta de R$ 500 — mudar o
-- valor apagaria de quanto era a dívida.

-- Recebimento -----------------------------------------------------------------
alter table public.contas_receber
  add column if not exists valor_recebido numeric(12, 2) not null default 0
    check (valor_recebido >= 0),
  add column if not exists parcela integer,
  add column if not exists total_parcelas integer;

comment on column public.contas_receber.valor_recebido is
  'Quanto já entrou. Menor que valor = recebimento parcial, e a conta continua aberta.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contas_receber_forma_conhecida') then
    alter table public.contas_receber
      add constraint contas_receber_forma_conhecida check (
        forma_pagamento is null or forma_pagamento in
          ('dinheiro', 'pix', 'debito', 'credito', 'transferencia', 'prazo')
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contas_pagar_forma_conhecida') then
    alter table public.contas_pagar
      add column if not exists forma_pagamento text,
      add constraint contas_pagar_forma_conhecida check (
        forma_pagamento is null or forma_pagamento in
          ('dinheiro', 'pix', 'debito', 'credito', 'transferencia', 'prazo')
      );
  end if;
end $$;

-- Categorias de despesa, da oficina -------------------------------------------
-- Coluna de texto e não tabela nova: são cinco ou seis palavras que a oficina
-- ajusta uma vez e não volta mais. Uma tabela com id, RLS e tela própria seria
-- mais estrutura do que o problema pede.
alter table public.oficinas
  add column if not exists categorias_despesa text[] not null
    default array['Aluguel', 'Fornecedor', 'Salário', 'Imposto', 'Energia', 'Outros'];

-- Status na leitura -----------------------------------------------------------
create or replace function public.status_da_conta(
  p_status public.status_conta,
  p_vencimento date,
  p_valor numeric,
  p_recebido numeric
)
returns public.status_conta
language sql
immutable
as $$
  select case
    when p_status <> 'aberta' then p_status
    when coalesce(p_recebido, 0) >= p_valor then 'paga'::public.status_conta
    when p_vencimento < current_date then 'atrasada'::public.status_conta
    else 'aberta'::public.status_conta
  end;
$$;

comment on function public.status_da_conta is
  'Atrasada é o status somado ao calendário: calculado na leitura, para não depender de uma tarefa diária que um dia não roda.';

-- A cobrança que nasce do serviço ---------------------------------------------
create or replace function public.criar_cobranca_da_os(
  p_ordem_servico_id uuid,
  p_parcelas integer default 1,
  p_primeiro_vencimento date default current_date,
  p_forma_pagamento text default null
)
returns integer
language plpgsql
as $$
declare
  v_os public.ordens_servico;
  v_parcelas integer := greatest(coalesce(p_parcelas, 1), 1);
  v_valor numeric(12, 2);
  v_resto numeric(12, 2);
  v_i integer;
  v_descricao text;
begin
  select * into v_os from public.ordens_servico
   where id = p_ordem_servico_id and oficina_id = public.oficina_do_usuario();
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'no_data_found';
  end if;

  if exists (select 1 from public.contas_receber where ordem_servico_id = p_ordem_servico_id) then
    raise exception 'Esta ordem já tem cobrança lançada.' using errcode = 'unique_violation';
  end if;

  if v_os.valor_total <= 0 then
    raise exception 'A ordem não tem valor a cobrar.' using errcode = 'check_violation';
  end if;

  -- Divisão em centavos: R$ 100 em 3 vezes vira 33,33 + 33,33 + 33,34. O que
  -- sobra vai na ÚLTIMA parcela, e não na primeira, porque a primeira costuma
  -- ser paga na hora e o cliente confere o número que combinou.
  v_valor := trunc(v_os.valor_total / v_parcelas, 2);
  v_resto := v_os.valor_total - (v_valor * v_parcelas);

  v_descricao := format('OS nº %s', lpad(v_os.numero::text, 4, '0'));

  for v_i in 1..v_parcelas loop
    insert into public.contas_receber
      (oficina_id, ordem_servico_id, cliente_id, descricao, valor, vencimento,
       forma_pagamento, parcela, total_parcelas)
    values
      (v_os.oficina_id, v_os.id, v_os.cliente_id,
       case when v_parcelas = 1 then v_descricao
            else format('%s — parcela %s de %s', v_descricao, v_i, v_parcelas) end,
       case when v_i = v_parcelas then v_valor + v_resto else v_valor end,
       p_primeiro_vencimento + ((v_i - 1) * interval '1 month'),
       p_forma_pagamento,
       case when v_parcelas = 1 then null else v_i end,
       case when v_parcelas = 1 then null else v_parcelas end);
  end loop;

  return v_parcelas;
end;
$$;

-- Baixa, inteira ou pela metade -----------------------------------------------
create or replace function public.receber_conta(
  p_conta_id uuid,
  p_valor numeric default null,
  p_data date default current_date,
  p_forma_pagamento text default null
)
returns public.contas_receber
language plpgsql
as $$
declare
  v_conta public.contas_receber;
  v_entrou numeric(12, 2);
  v_total numeric(12, 2);
begin
  select * into v_conta from public.contas_receber where id = p_conta_id for update;
  if not found then
    raise exception 'Conta não encontrada.' using errcode = 'no_data_found';
  end if;
  if v_conta.status = 'cancelada' then
    raise exception 'Esta conta foi cancelada.' using errcode = 'check_violation';
  end if;

  -- Sem valor informado, recebeu o que faltava.
  v_entrou := coalesce(p_valor, v_conta.valor - v_conta.valor_recebido);
  if v_entrou <= 0 then
    raise exception 'Informe um valor maior que zero.' using errcode = 'check_violation';
  end if;

  v_total := v_conta.valor_recebido + v_entrou;
  if v_total > v_conta.valor then
    raise exception 'O valor recebido passa do valor da conta (%).', v_conta.valor
      using errcode = 'check_violation';
  end if;

  update public.contas_receber
     set valor_recebido = v_total,
         forma_pagamento = coalesce(p_forma_pagamento, forma_pagamento),
         -- Só vira 'paga' quando entrou tudo. Parcial continua aberta, e é isso
         -- que mantém o saldo do cliente visível.
         status = case when v_total >= v_conta.valor then 'paga'::public.status_conta else status end,
         data_pagamento = case when v_total >= v_conta.valor then p_data else data_pagamento end
   where id = p_conta_id
  returning * into v_conta;

  return v_conta;
end;
$$;

create or replace function public.cancelar_conta_receber(p_conta_id uuid)
returns void
language sql
as $$
  update public.contas_receber
     set status = 'cancelada', data_pagamento = null, valor_recebido = 0
   where id = p_conta_id;
$$;

-- Contas a pagar ---------------------------------------------------------------
create or replace function public.lancar_conta_a_pagar(
  p_descricao text,
  p_valor numeric,
  p_vencimento date,
  p_fornecedor text default null,
  p_categoria text default null,
  p_repetir_meses integer default 1
)
returns integer
language plpgsql
as $$
declare
  v_oficina uuid := public.oficina_do_usuario();
  v_vezes integer := greatest(coalesce(p_repetir_meses, 1), 1);
  v_i integer;
begin
  if v_oficina is null then
    raise exception 'Usuário sem oficina ativa.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_descricao), '') = '' then
    raise exception 'Informe a descrição da despesa.' using errcode = 'check_violation';
  end if;

  for v_i in 1..v_vezes loop
    insert into public.contas_pagar
      (oficina_id, fornecedor, descricao, categoria, valor, vencimento)
    values
      (v_oficina, nullif(trim(p_fornecedor), ''),
       case when v_vezes = 1 then trim(p_descricao)
            else format('%s (%s de %s)', trim(p_descricao), v_i, v_vezes) end,
       nullif(trim(p_categoria), ''),
       p_valor,
       p_vencimento + ((v_i - 1) * interval '1 month'));
  end loop;

  return v_vezes;
end;
$$;

create or replace function public.pagar_conta(
  p_conta_id uuid,
  p_data date default current_date,
  p_forma_pagamento text default null
)
returns public.contas_pagar
language plpgsql
as $$
declare
  v_conta public.contas_pagar;
begin
  update public.contas_pagar
     set status = 'paga', data_pagamento = p_data,
         forma_pagamento = coalesce(p_forma_pagamento, forma_pagamento)
   where id = p_conta_id and status <> 'cancelada'
  returning * into v_conta;

  if not found then
    raise exception 'Conta não encontrada ou já cancelada.' using errcode = 'no_data_found';
  end if;
  return v_conta;
end;
$$;

create index if not exists contas_receber_vencimento_idx
  on public.contas_receber (oficina_id, vencimento);
create index if not exists contas_pagar_vencimento_idx
  on public.contas_pagar (oficina_id, vencimento);

select public.conferir_fechadura();
