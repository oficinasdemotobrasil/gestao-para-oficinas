-- 0015 — Defaults que sobrevivem à inserção em lote
--
-- O problema, descoberto testando a tela da moto:
--
-- Quando o PostgREST recebe vários registros numa única chamada, ele monta UM
-- comando INSERT com a união das colunas de todos os registros. O registro que
-- não traz uma coluna recebe NULL explícito — e NULL não aciona o DEFAULT da
-- coluna, ele viola o NOT NULL. Ou seja: um lote onde alguns registros contam
-- com o valor padrão falha inteiro, com uma mensagem que não explica nada para
-- quem está na oficina.
--
-- Isso não afeta o cadastro de moto de hoje, que passa pela função
-- criar_moto_com_proprietario e sempre envia a data. Mas a Fase 2 é feita de
-- inserção em lote (itens de orçamento, itens de OS), e a armadilha ficaria
-- armada. Um gatilho que preenche o valor quando vier nulo resolve na origem.
--
-- Só vale para colunas cujo NULL não significa nada: a posse de uma moto sempre
-- começa em algum dia. Onde NULL carrega sentido — data_fim, que quer dizer
-- "é o dono atual" — nada é preenchido.

create or replace function public.preencher_inicio_da_posse()
returns trigger
language plpgsql
as $$
begin
  if new.data_inicio is null then
    new.data_inicio = current_date;
  end if;
  return new;
end;
$$;

create trigger moto_proprietarios_preencher_inicio
  before insert on public.moto_proprietarios
  for each row execute function public.preencher_inicio_da_posse();

comment on column public.moto_proprietarios.data_inicio is
  'Início da posse. Preenchido com a data de hoje quando vier nulo, para que a inserção em lote pelo PostgREST não quebre. Ver gatilho moto_proprietarios_preencher_inicio.';
