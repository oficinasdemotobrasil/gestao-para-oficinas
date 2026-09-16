-- 0058 — Notas fiscais falam com o Financeiro
--
-- A ENTRADA já existia de ponta a ponta: notas_fiscais_entrada,
-- movimentacoes_estoque, e a RPC salvar_nota_com_itens (0005/0018/0021),
-- transacional, com estorno em vez de delete no cancelamento. O que faltava
-- não era a base — era três coisas: campos fiscais, a ponte com Contas a
-- Pagar, e uma tela (que vem na Fase 3).
--
-- Por isso esta migration ESTENDE o que existe em vez de duplicar:
--   - NÃO cria "itens_nf_entrada". A 0018 já decidiu, por escrito, que os
--     itens de uma nota de entrada SÃO as movimentações de estoque que ela
--     gera — "uma tabela a menos para divergir". Criar outra tabela pra
--     guardar a mesma coisa quebraria essa decisão sem necessidade.
--   - notas_fiscais_entrada ganha colunas fiscais, não uma tabela nova.
--
-- A SAÍDA não existia de nenhuma forma — nem como conceito. Aqui ela nasce:
-- notas_fiscais_saida + itens_nf_saida, espelhando a forma de os_itens.
--
-- Um documento de saída pode vir de duas origens, e o RPC trata as duas
-- diferente:
--   - de uma ordem de serviço já finalizada: o estoque já baixou lá
--     (finalizar_os, 0032). Aqui só formaliza o documento fiscal.
--   - avulso (venda de balcão, sem OS): o estoque baixa agora, com a mesma
--     regra de "não deixa negativar sem avisar" que a OS já usa.
--
-- Campos fiscais são guardados, não calculados nem validados contra Sefaz —
-- a integração fica para depois, com o contador. O NCM mora no PRODUTO
-- (classificação do item, reaproveitada em toda nota), CFOP mora na
-- OPERAÇÃO (varia por documento, e por isso também existe por item, pra
-- cobrir nota com mercadoria E devolução no mesmo lançamento).

-- Catálogo: NCM é do produto, não da nota ------------------------------------
alter table public.produtos add column if not exists ncm text;

comment on column public.produtos.ncm is
  'Classificação fiscal do produto. Cadastrada uma vez, reaproveitada em toda nota que usar este item.';

-- vw_produtos (0012) lista as colunas à mão, para esconder preco_custo do
-- vendedor. NCM não é sensível como custo — sem essa linha, o vendedor
-- cadastraria um produto e o campo desapareceria da própria tela dele.
--
-- NCM entra no FIM da lista, não junto das colunas parecidas (codigo, por
-- exemplo): create or replace view só aceita coluna nova na última posição —
-- inserir no meio desloca a posição das colunas existentes, e o Postgres
-- recusa a troca.
create or replace view public.vw_produtos
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
  p.atualizado_em,
  p.ncm
from public.produtos p
where p.oficina_id = public.oficina_do_usuario()
  and not public.eh_mecanico();

-- Entrada: os campos fiscais que faltavam -------------------------------------
alter table public.notas_fiscais_entrada
  add column if not exists natureza_operacao text,
  add column if not exists cfop text,
  add column if not exists base_calculo_icms numeric(12, 2)
    check (base_calculo_icms is null or base_calculo_icms >= 0),
  add column if not exists valor_icms numeric(12, 2)
    check (valor_icms is null or valor_icms >= 0),
  add column if not exists valor_iss numeric(12, 2)
    check (valor_iss is null or valor_iss >= 0),
  -- Os 44 dígitos que identificam a nota no país inteiro — o que vem digitado,
  -- colado, ou lido de um QR code do DANFE. Guardada, não conferida: validar
  -- de verdade é consultar a Sefaz, que é trabalho futuro do contador.
  add column if not exists chave_acesso text
    check (chave_acesso is null or chave_acesso ~ '^\d{44}$');

comment on column public.notas_fiscais_entrada.valor_iss is
  'Raro numa entrada de mercadoria (é ICMS que se aplica), mas existe para o caso de nota de serviço tomado de terceiro.';

-- Idempotência: duplo clique não pode virar nota duplicada -------------------
-- O número da nota já é obrigatório desde a 0005. A trava natural é que o
-- MESMO fornecedor não manda duas notas com o mesmo número — então um índice
-- único nesse par, e o duplo clique esbarra nele sozinho, sem precisar de
-- token de idempotência nem de trava no front.
--
-- Exclui as canceladas de propósito: se a primeira tentativa foi lançada
-- errada e cancelada, relançar sob o mesmo número (a correção) não pode ficar
-- bloqueada pelo próprio erro que está sendo corrigido.
create unique index if not exists notas_fiscais_entrada_numero_unico
  on public.notas_fiscais_entrada (oficina_id, fornecedor, numero)
  where status <> 'cancelada';

-- A ponte para Contas a Pagar --------------------------------------------------
alter table public.contas_pagar
  add column if not exists nota_fiscal_entrada_id uuid,
  add column if not exists parcela integer,
  add column if not exists total_parcelas integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contas_pagar_nota_fk'
  ) then
    alter table public.contas_pagar
      add constraint contas_pagar_nota_fk
        foreign key (nota_fiscal_entrada_id, oficina_id)
        -- set null, não restrict: a nota fiscal é o papel; a dívida é o fato.
        -- Se o vínculo se perder por algum motivo, a obrigação de pagar
        -- continua existindo — só perde a referência de qual nota a gerou.
        references public.notas_fiscais_entrada (id, oficina_id) on delete set null;
  end if;
end $$;

comment on column public.contas_pagar.nota_fiscal_entrada_id is
  'De qual nota de entrada esta parcela nasceu. Nulo em despesa lançada direto (aluguel, salário) — continua existindo o caminho de lancar_conta_a_pagar.';

-- Saída: o que não existia -----------------------------------------------------
create table public.notas_fiscais_saida (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  numero text,
  cliente_id uuid,
  -- Presente quando o documento formaliza uma OS já finalizada. Nulo em
  -- venda de balcão (peça vendida sem ordem de serviço nenhuma).
  ordem_servico_id uuid,
  natureza_operacao text,
  cfop text,
  base_calculo_icms numeric(12, 2) check (base_calculo_icms is null or base_calculo_icms >= 0),
  valor_icms numeric(12, 2) check (valor_icms is null or valor_icms >= 0),
  base_calculo_iss numeric(12, 2) check (base_calculo_iss is null or base_calculo_iss >= 0),
  valor_iss numeric(12, 2) check (valor_iss is null or valor_iss >= 0),
  valor_total numeric(12, 2) not null default 0 check (valor_total >= 0),
  status public.status_nota not null default 'lancada',
  cancelada_em timestamptz,
  cancelada_por uuid references public.usuarios (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, oficina_id),
  constraint notas_fiscais_saida_cancelamento_coerente
    check ((status = 'cancelada') = (cancelada_em is not null)),
  constraint notas_fiscais_saida_cliente_fk
    foreign key (cliente_id, oficina_id) references public.clientes (id, oficina_id) on delete restrict,
  constraint notas_fiscais_saida_os_fk
    foreign key (ordem_servico_id, oficina_id) references public.ordens_servico (id, oficina_id) on delete restrict
);

comment on table public.notas_fiscais_saida is
  'O tipo do documento (NFe de produto, NFSe de serviço, ou misto) não é uma coluna: é derivado dos itens. Guardar separado abriria a chance de a nota dizer uma coisa e os itens dizerem outra.';

-- Mesma trava de duplo clique da entrada, exceto quando não há número ainda
-- (oficina que só quer registrar internamente, sem emitir o documento fiscal
-- de verdade ainda — a integração com a prefeitura/Sefaz vem depois).
create unique index notas_fiscais_saida_numero_unico
  on public.notas_fiscais_saida (oficina_id, numero)
  where numero is not null and status <> 'cancelada';

create table public.itens_nf_saida (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  nota_fiscal_saida_id uuid not null,
  tipo public.tipo_item not null,
  produto_id uuid,
  servico_id uuid,
  descricao text not null,
  quantidade numeric(12, 3) not null default 1 check (quantidade > 0),
  valor_unitario numeric(12, 2) not null default 0 check (valor_unitario >= 0),
  valor_total numeric(12, 2) not null default 0 check (valor_total >= 0),
  -- Por item, e não só no produto: cobre nota com CFOP diferente por linha
  -- (ex: uma peça vendida e outra devolvida no mesmo documento). Nulo herda
  -- o NCM do cadastro do produto — não precisa redigitar em toda nota.
  ncm text,
  cfop_item text,
  criado_em timestamptz not null default now(),
  constraint itens_nf_saida_nota_fk
    foreign key (nota_fiscal_saida_id, oficina_id)
    references public.notas_fiscais_saida (id, oficina_id) on delete cascade,
  constraint itens_nf_saida_produto_fk
    foreign key (produto_id, oficina_id) references public.produtos (id, oficina_id) on delete restrict,
  constraint itens_nf_saida_servico_fk
    foreign key (servico_id, oficina_id) references public.servicos (id, oficina_id) on delete restrict,
  constraint itens_nf_saida_referencia_coerente check (
    (tipo = 'produto' and servico_id is null)
    or (tipo = 'servico' and produto_id is null)
  )
);

create trigger notas_fiscais_saida_atualizado_em
  before update on public.notas_fiscais_saida
  for each row execute function public.marcar_atualizacao();

-- A mesma amarra que a entrada já tem em movimentacoes_estoque.nota_fiscal_id,
-- para o cancelamento não precisar caçar suas próprias linhas por texto de
-- "motivo" — frágil: número de nota pode repetir palavra, ou conter
-- caractere especial de LIKE. Só existe depois daqui porque só agora
-- notas_fiscais_saida já existe para a FK apontar.
alter table public.movimentacoes_estoque add column if not exists nota_fiscal_saida_id uuid;
alter table public.contas_receber add column if not exists nota_fiscal_saida_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'movimentacoes_estoque_nota_saida_fk') then
    alter table public.movimentacoes_estoque
      add constraint movimentacoes_estoque_nota_saida_fk
        foreign key (nota_fiscal_saida_id, oficina_id)
        references public.notas_fiscais_saida (id, oficina_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contas_receber_nota_saida_fk') then
    alter table public.contas_receber
      add constraint contas_receber_nota_saida_fk
        foreign key (nota_fiscal_saida_id, oficina_id)
        -- set null, mesmo raciocínio da entrada: a cobrança é o fato, a nota é
        -- o papel.
        references public.notas_fiscais_saida (id, oficina_id) on delete set null;
  end if;
end $$;

-- RLS: mesma regra de tudo que é fiscal/financeiro — só o admin -------------
alter table public.notas_fiscais_saida enable row level security;
alter table public.itens_nf_saida enable row level security;

create policy "admin gerencia notas de saida"
  on public.notas_fiscais_saida for all to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_admin());

create policy "admin gerencia itens de saida"
  on public.itens_nf_saida for all to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_admin());

-- A oficina suspensa continua só-leitura também aqui -------------------------
-- A 0038 trava escrita por tabela, numa lista fixa. Tabela nova não entra
-- sozinha — collei aqui, ou uma nota fiscal de venda seria a única coisa que
-- uma oficina suspensa ainda conseguiria lançar.
do $$
declare
  t text;
  tabelas text[] := array['notas_fiscais_saida', 'itens_nf_saida'];
begin
  foreach t in array tabelas loop
    execute format('drop trigger if exists %I on public.%I', t || '_exigir_oficina_ativa', t);
    execute format(
      'create trigger %I before insert or update or delete on public.%I
         for each row execute function public.exigir_oficina_ativa()',
      t || '_exigir_oficina_ativa', t);
  end loop;
end $$;

-- A NOTA DE ENTRADA agora lança a conta a pagar junto -------------------------
--
-- Substitui a versão da 0021: ganha os campos fiscais, o parcelamento (mesma
-- divisão em centavos de criar_cobranca_da_os, sobra na última parcela), e a
-- mensagem em português quando o número da nota já foi usado por este
-- fornecedor — em vez do "duplicate key value violates..." cru do Postgres.
--
-- `create or replace` não basta: a lista de parâmetros mudou, e o Postgres
-- trata isso como uma SOBRECARGA nova, não uma substituição — sobrariam duas
-- funções com o mesmo nome, e toda chamada com 6 argumentos ficaria ambígua
-- entre as duas (foi exatamente o que a validação local acusou). O drop
-- explícito, pela assinatura antiga, evita a duplicidade.
drop function if exists public.salvar_nota_com_itens(text, text, date, numeric, text, jsonb);

create or replace function public.salvar_nota_com_itens(
  p_numero text,
  p_fornecedor text,
  p_data_emissao date,
  p_valor_total numeric,
  p_arquivo_url text,
  p_itens jsonb,
  p_natureza_operacao text default null,
  p_cfop text default null,
  p_base_calculo_icms numeric default null,
  p_valor_icms numeric default null,
  p_valor_iss numeric default null,
  p_chave_acesso text default null,
  -- Financeiro: toda nota gera ao menos uma parcela em Contas a Pagar. Uma
  -- compra à vista também — só nasce já paga, em vez de nascer em aberto.
  p_parcelas integer default 1,
  p_primeiro_vencimento date default null,
  p_categoria text default 'Fornecedor',
  p_forma_pagamento text default null,
  p_pago_agora boolean default false
)
returns uuid
language plpgsql
as $$
declare
  v_oficina_id uuid := public.oficina_do_usuario();
  v_nota_id uuid;
  v_item record;
  v_vezes integer := greatest(coalesce(p_parcelas, 1), 1);
  v_valor_parcela numeric(12, 2);
  v_resto numeric(12, 2);
  v_vencimento_base date := coalesce(p_primeiro_vencimento, p_data_emissao, current_date);
  v_descricao text;
  v_i integer;
begin
  if v_oficina_id is null then
    raise exception 'Usuário sem oficina ativa.' using errcode = 'insufficient_privilege';
  end if;

  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then
    raise exception 'A nota precisa de pelo menos um item.' using errcode = 'check_violation';
  end if;

  if p_pago_agora and v_vezes <> 1 then
    raise exception 'Uma compra parcelada não pode estar paga por inteiro no lançamento.'
      using errcode = 'check_violation';
  end if;

  begin
    insert into public.notas_fiscais_entrada
      (oficina_id, numero, fornecedor, data_emissao, valor_total, arquivo_url,
       natureza_operacao, cfop, base_calculo_icms, valor_icms, valor_iss, chave_acesso)
    values
      (v_oficina_id, p_numero, p_fornecedor, p_data_emissao, coalesce(p_valor_total, 0), p_arquivo_url,
       p_natureza_operacao, p_cfop, p_base_calculo_icms, p_valor_icms, p_valor_iss, p_chave_acesso)
    returning id into v_nota_id;
  exception when unique_violation then
    raise exception 'Já existe uma nota número % lançada para este fornecedor.', p_numero
      using errcode = 'unique_violation';
  end;

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

  -- Financeiro: só lança se houver valor. Nota de zero reais (ex: brinde do
  -- fornecedor) não deveria virar conta a pagar de zero reais na tela.
  if coalesce(p_valor_total, 0) > 0 then
    v_descricao := 'NF ' || coalesce(p_numero, 's/n') || ' — ' || coalesce(p_fornecedor, 'fornecedor');
    v_valor_parcela := trunc(p_valor_total / v_vezes, 2);
    v_resto := p_valor_total - (v_valor_parcela * v_vezes);

    for v_i in 1..v_vezes loop
      insert into public.contas_pagar
        (oficina_id, nota_fiscal_entrada_id, fornecedor, descricao, categoria, valor,
         vencimento, forma_pagamento, parcela, total_parcelas, status, data_pagamento)
      values
        (v_oficina_id, v_nota_id, p_fornecedor,
         case when v_vezes = 1 then v_descricao
              else format('%s — parcela %s de %s', v_descricao, v_i, v_vezes) end,
         p_categoria,
         case when v_i = v_vezes then v_valor_parcela + v_resto else v_valor_parcela end,
         v_vencimento_base + ((v_i - 1) * interval '1 month'),
         p_forma_pagamento,
         case when v_vezes = 1 then null else v_i end,
         case when v_vezes = 1 then null else v_vezes end,
         case when p_pago_agora then 'paga' else 'aberta' end::public.status_conta,
         case when p_pago_agora then coalesce(p_data_emissao, current_date) else null end);
    end loop;
  end if;

  return v_nota_id;
end;
$$;

-- Cancelar a nota também cancela o que ainda está em aberto no Financeiro.
-- O que já foi pago fica pago: estornar dinheiro não é decisão automática de
-- gatilho, é decisão de gente (é o mesmo motivo do estorno de assinatura).
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

  update public.contas_pagar
     set status = 'cancelada'
   where nota_fiscal_entrada_id = p_nota_id and status = 'aberta';

  update public.notas_fiscais_entrada
     set status = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid()
   where id = p_nota_id;
end;
$$;

-- A NOTA DE SAÍDA — nasce agora -----------------------------------------------
--
-- p_ordem_servico_id decide o comportamento do estoque:
--   presente  → a OS já baixou o estoque ao ser finalizada (0032). Aqui só
--               formaliza o documento; nenhuma movimentação nova.
--   ausente   → venda de balcão. O estoque baixa agora, com a mesma regra de
--               "não deixa negativar sem avisar" da OS (mesma flag GUC).
create or replace function public.salvar_nota_saida_com_itens(
  p_numero text,
  p_cliente_id uuid,
  p_ordem_servico_id uuid,
  p_natureza_operacao text,
  p_cfop text,
  p_base_calculo_icms numeric,
  p_valor_icms numeric,
  p_base_calculo_iss numeric,
  p_valor_iss numeric,
  p_itens jsonb,
  p_parcelas integer default 1,
  p_primeiro_vencimento date default current_date,
  p_forma_pagamento text default null
)
returns uuid
language plpgsql
as $$
declare
  v_oficina_id uuid := public.oficina_do_usuario();
  v_nota_id uuid;
  v_total numeric(12, 2) := 0;
  v_item record;
  v_faltas text;
  v_vezes integer := greatest(coalesce(p_parcelas, 1), 1);
  v_valor_parcela numeric(12, 2);
  v_resto numeric(12, 2);
  v_descricao text;
  v_i integer;
begin
  if v_oficina_id is null then
    raise exception 'Usuário sem oficina ativa.' using errcode = 'insufficient_privilege';
  end if;

  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then
    raise exception 'A nota precisa de pelo menos um item.' using errcode = 'check_violation';
  end if;

  select coalesce(sum((x.quantidade * x.valor_unitario)::numeric(12, 2)), 0)
    into v_total
  from jsonb_to_recordset(p_itens)
    as x(tipo text, produto_id uuid, servico_id uuid, descricao text,
         quantidade numeric, valor_unitario numeric, ncm text, cfop_item text);

  -- Falta de estoque só se checa na venda avulsa: se veio de OS, a baixa (e a
  -- checagem) já aconteceu lá, e checar de novo aqui recusaria uma nota cujo
  -- estoque já foi, corretamente, consumido.
  if p_ordem_servico_id is null then
    select string_agg(
             format('%s (tem %s, precisa de %s)', pr.nome, pr.estoque_atual, falta.necessario),
             E'\n'
           )
      into v_faltas
    from (
      select x.produto_id, sum(x.quantidade) as necessario
      from jsonb_to_recordset(p_itens)
        as x(tipo text, produto_id uuid, servico_id uuid, descricao text,
             quantidade numeric, valor_unitario numeric, ncm text, cfop_item text)
      where x.tipo = 'produto' and x.produto_id is not null
      group by x.produto_id
    ) falta
    join public.produtos pr on pr.id = falta.produto_id
    where pr.estoque_atual < falta.necessario;

    if v_faltas is not null then
      raise exception E'Falta peça em estoque para vender:\n%', v_faltas
        using errcode = 'check_violation';
    end if;
  end if;

  begin
    insert into public.notas_fiscais_saida
      (oficina_id, numero, cliente_id, ordem_servico_id, natureza_operacao, cfop,
       base_calculo_icms, valor_icms, base_calculo_iss, valor_iss, valor_total)
    values
      (v_oficina_id, p_numero, p_cliente_id, p_ordem_servico_id, p_natureza_operacao, p_cfop,
       p_base_calculo_icms, p_valor_icms, p_base_calculo_iss, p_valor_iss, v_total)
    returning id into v_nota_id;
  exception when unique_violation then
    raise exception 'Já existe uma nota número % lançada.', p_numero
      using errcode = 'unique_violation';
  end;

  for v_item in
    select * from jsonb_to_recordset(p_itens)
      as x(tipo text, produto_id uuid, servico_id uuid, descricao text,
           quantidade numeric, valor_unitario numeric, ncm text, cfop_item text)
  loop
    insert into public.itens_nf_saida
      (oficina_id, nota_fiscal_saida_id, tipo, produto_id, servico_id, descricao,
       quantidade, valor_unitario, valor_total, ncm, cfop_item)
    values
      (v_oficina_id, v_nota_id, v_item.tipo::public.tipo_item, v_item.produto_id, v_item.servico_id,
       v_item.descricao, v_item.quantidade, v_item.valor_unitario,
       (v_item.quantidade * v_item.valor_unitario)::numeric(12, 2),
       coalesce(v_item.ncm, (select ncm from public.produtos where id = v_item.produto_id)),
       v_item.cfop_item);

    if p_ordem_servico_id is null and v_item.tipo = 'produto' then
      insert into public.movimentacoes_estoque
        (oficina_id, produto_id, tipo, quantidade, motivo, nota_fiscal_saida_id, usuario_id)
      values
        (v_oficina_id, v_item.produto_id, 'saida', v_item.quantidade,
         'Venda pela nota ' || coalesce(p_numero, 's/n'), v_nota_id, auth.uid());
    end if;
  end loop;

  if v_total > 0 and p_cliente_id is not null then
    v_descricao := 'NF ' || coalesce(p_numero, 's/n');
    v_valor_parcela := trunc(v_total / v_vezes, 2);
    v_resto := v_total - (v_valor_parcela * v_vezes);

    for v_i in 1..v_vezes loop
      insert into public.contas_receber
        (oficina_id, cliente_id, nota_fiscal_saida_id, descricao, valor, vencimento,
         forma_pagamento, parcela, total_parcelas)
      values
        (v_oficina_id, p_cliente_id, v_nota_id,
         case when v_vezes = 1 then v_descricao
              else format('%s — parcela %s de %s', v_descricao, v_i, v_vezes) end,
         case when v_i = v_vezes then v_valor_parcela + v_resto else v_valor_parcela end,
         coalesce(p_primeiro_vencimento, current_date) + ((v_i - 1) * interval '1 month'),
         p_forma_pagamento,
         case when v_vezes = 1 then null else v_i end,
         case when v_vezes = 1 then null else v_vezes end);
    end loop;
  end if;

  return v_nota_id;
end;
$$;

create or replace function public.cancelar_nota_saida(p_nota_id uuid)
returns void
language plpgsql
as $$
declare
  v_nota record;
  v_mov record;
begin
  select * into v_nota from public.notas_fiscais_saida where id = p_nota_id;

  if not found then
    raise exception 'Nota não encontrada.' using errcode = 'no_data_found';
  end if;

  if v_nota.status = 'cancelada' then
    raise exception 'Esta nota já foi cancelada.' using errcode = 'check_violation';
  end if;

  -- Só devolve estoque do que ESTA nota baixou. Se ela nasceu de uma OS, o
  -- estoque é problema do cancelamento da OS (cancelar_os já faz isso),
  -- não deste RPC — cancelar a nota fiscal de uma venda não desfaz o serviço.
  if v_nota.ordem_servico_id is null then
    for v_mov in
      select produto_id, quantidade from public.movimentacoes_estoque
      where nota_fiscal_saida_id = p_nota_id and tipo = 'saida'
    loop
      insert into public.movimentacoes_estoque
        (oficina_id, produto_id, tipo, quantidade, motivo, usuario_id)
      values
        (v_nota.oficina_id, v_mov.produto_id, 'entrada', v_mov.quantidade,
         'Devolvido do cancelamento da nota ' || coalesce(v_nota.numero, 's/n'), auth.uid());
    end loop;
  end if;

  update public.contas_receber
     set status = 'cancelada', data_pagamento = null, valor_recebido = 0
   where nota_fiscal_saida_id = p_nota_id and status = 'aberta';

  update public.notas_fiscais_saida
     set status = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid()
   where id = p_nota_id;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'salvar_nota_com_itens(text, text, date, numeric, text, jsonb, text, text, numeric, numeric, numeric, text, integer, date, text, text, boolean)',
    'cancelar_nota(uuid)',
    'salvar_nota_saida_com_itens(text, uuid, uuid, text, text, numeric, numeric, numeric, numeric, jsonb, integer, date, text)',
    'cancelar_nota_saida(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

select public.conferir_fechadura();
