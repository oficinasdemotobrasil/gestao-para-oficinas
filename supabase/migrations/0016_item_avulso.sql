-- 0016 — Item avulso no orçamento
--
-- Nem tudo que entra num orçamento está no catálogo: "solda no escapamento",
-- "peça que o cliente trouxe". Hoje o item precisa ser produto ou serviço, e
-- obrigar o cadastro de um serviço novo só para orçar uma vez enche o catálogo
-- de lixo.
--
-- Esta migration tem uma linha só de propósito: o Postgres não deixa usar um
-- valor de enum na mesma transação em que ele é criado. Se estivesse junto com
-- a alteração dos CHECK que dependem dele (0018), nenhuma das duas subiria.

alter type public.tipo_item add value if not exists 'avulso';
