-- 0025 — A mensagem de estoque insuficiente em português de gente
--
-- O teste contra o Supabase mostrou a mensagem saindo assim:
--   "Não há estoque suficiente de Óleo 10W30: tem 14. L, você pediu 999."
-- Sobra um ponto depois do 14, e o separador decimal é o americano. Quem lê
-- rápido, com a moto na frente, tropeça nisso.
--
-- Passa a sair:
--   "Não há estoque suficiente de Óleo 10W30: tem 14 L, você pediu 999."
--   "Não há estoque suficiente de Óleo 10W30: tem 2,5 L, você pediu 4."

create or replace function public.formatar_quantidade(p_valor numeric)
returns text
language sql
immutable
as $$
  -- to_char devolve "14." para um inteiro; tira o zero à direita, depois o
  -- ponto solto, e por fim troca o separador decimal pela vírgula.
  select replace(
    rtrim(rtrim(to_char(p_valor, 'FM999999990.999'), '0'), '.'),
    '.', ','
  )
$$;

create or replace function public.aplicar_no_estoque(
  p_produto_id uuid,
  p_delta numeric
)
returns void
language plpgsql
as $$
declare
  v_saldo numeric(12, 3);
  v_novo numeric(12, 3);
  v_nome text;
  v_unidade text;
begin
  if p_delta = 0 then return; end if;

  select estoque_atual, nome, unidade
    into v_saldo, v_nome, v_unidade
  from public.produtos
  where id = p_produto_id
  for update;

  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'foreign_key_violation';
  end if;

  v_novo := v_saldo + p_delta;

  if v_novo < 0 then
    raise exception 'Não há estoque suficiente de %: tem % %, você pediu %.',
      v_nome,
      public.formatar_quantidade(v_saldo),
      v_unidade,
      public.formatar_quantidade(abs(p_delta))
      using errcode = 'check_violation';
  end if;

  update public.produtos set estoque_atual = v_novo where id = p_produto_id;
end;
$$;
