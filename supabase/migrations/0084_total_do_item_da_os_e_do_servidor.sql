-- 0084 — O total de cada item da OS é do servidor
--
-- O que aconteceu (13/10/2026, OS 025 de uma oficina em produção): a tela da
-- ordem mostrava R$ 1.910,00, e a lista de ordens e o financeiro, R$ 1.190,00.
-- Um item de 1 × R$ 800,00 estava gravado com total de R$ 80,00.
--
-- A causa estava na tela: ao mudar o preço de um item que já estava na ordem,
-- ela gravava a cada tecla só a quantidade e o total, nunca o preço. Apagar um
-- zero (800 → 80) gravava total 80; redigitar o zero não regravava nada, porque
-- o preço no banco continuava 800 e, para a tela, "não tinha mudado". A tela
-- mostra quantidade × preço; o banco somava os totais gravados — e os dois
-- passaram a contar histórias diferentes.
--
-- A tela foi corrigida, mas a regra fica aqui, como a 0069 fez no orçamento:
-- o total do item é quantidade × preço, calculado pelo banco, escreva quem
-- escrever. A conta é a MESMA de `salvar_orcamento_com_itens`
-- ((quantidade * valor_unitario)::numeric(12, 2)), então o item copiado do
-- orçamento aprovado continua com o centavo idêntico.
--
-- O que já está gravado NÃO é mexido aqui. Um item divergente pode ser de uma
-- ordem já entregue e com conta recebida; corrigir isso é decisão da oficina,
-- caso a caso. Por isso, no UPDATE, o total só é refeito quando a quantidade,
-- o preço ou o próprio total mudam — marcar um item como feito não reescreve
-- o valor de ninguém por baixo dos panos.

create or replace function public.total_do_item_da_os()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT'
     or new.quantidade is distinct from old.quantidade
     or new.valor_unitario is distinct from old.valor_unitario
     or new.valor_total is distinct from old.valor_total then
    new.valor_total := (new.quantidade * new.valor_unitario)::numeric(12, 2);
  end if;
  return new;
end;
$$;

comment on function public.total_do_item_da_os() is
  'Gatilho: o total do item da OS é sempre quantidade × preço (0084). O total da OS (0026) soma estes totais.';

drop trigger if exists os_itens_total_do_servidor on public.os_itens;
create trigger os_itens_total_do_servidor
  before insert or update on public.os_itens
  for each row execute function public.total_do_item_da_os();

select public.conferir_fechadura();
