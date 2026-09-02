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
