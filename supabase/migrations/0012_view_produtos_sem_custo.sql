-- 0012 — Catálogo de produtos sem preço de custo
--
-- O problema: RLS filtra LINHA, não COLUNA. Não existe política capaz de
-- entregar a mesma linha de produto com preco_custo para o admin e sem ele
-- para o vendedor. Por isso a tabela produtos é de leitura exclusiva do admin
-- (política em 0010) e o vendedor consulta este recorte.
--
-- A view roda como dono (security_invoker = false), ou seja, passa por cima do
-- RLS de produtos — é exatamente o que se quer aqui, e é também o ponto que
-- exige cuidado: o isolamento entre oficinas passa a depender do WHERE abaixo.
-- Ele está coberto pelo script de teste de isolamento, que tenta ler a view
-- logado como a outra oficina.
--
-- security_barrier impede que uma função barata do usuário seja avaliada antes
-- do filtro de oficina e vaze linha por mensagem de erro.

create view public.vw_produtos
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
  p.atualizado_em
from public.produtos p
where p.oficina_id = public.oficina_do_usuario()
  and not public.eh_mecanico();

comment on view public.vw_produtos is
  'Catálogo de produtos sem preco_custo, para o perfil vendedor. O admin lê a tabela produtos direto.';

revoke all on public.vw_produtos from public, anon;
grant select on public.vw_produtos to authenticated;
