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
