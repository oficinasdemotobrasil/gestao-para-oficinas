-- 0019 — O estoque é a soma das movimentações
--
-- produtos.estoque_atual é cache; a verdade é o extrato. Se os dois divergirem,
-- o cache mente e a oficina compra peça que já tem. Por isso quem mexe no cache
-- é o banco, em gatilho, e nunca o aplicativo.
--
-- O 'for update' não é zelo excessivo: sem ele, duas saídas simultâneas da mesma
-- peça leem o mesmo saldo, as duas passam pela verificação e o estoque termina
-- negativo. Trava a linha do produto, aplica, libera.

create or replace function public.delta_da_movimentacao(
  p_tipo public.tipo_movimentacao,
  p_quantidade numeric
)
returns numeric
language sql
immutable
as $$
  select case p_tipo
    when 'entrada' then p_quantidade
    when 'saida'   then -p_quantidade
    when 'ajuste'  then p_quantidade  -- já vem com sinal
  end
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

  -- Estoque físico negativo não existe. A mensagem sai pronta para a tela:
  -- diz quanto tem, quanto foi pedido e de qual peça.
  if v_novo < 0 then
    raise exception 'Não há estoque suficiente de %: tem % %, você pediu %.',
      v_nome,
      trim(to_char(v_saldo, 'FM999999990.999')),
      v_unidade,
      trim(to_char(abs(p_delta), 'FM999999990.999'))
      using errcode = 'check_violation';
  end if;

  update public.produtos set estoque_atual = v_novo where id = p_produto_id;
end;
$$;

create or replace function public.movimentar_estoque()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Desfaz o efeito da linha antiga e aplica o da nova. Cobre insert, update
  -- (inclusive troca de produto) e delete com o mesmo raciocínio.
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.aplicar_no_estoque(
      old.produto_id,
      -public.delta_da_movimentacao(old.tipo, old.quantidade)
    );
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.aplicar_no_estoque(
      new.produto_id,
      public.delta_da_movimentacao(new.tipo, new.quantidade)
    );
  end if;

  return coalesce(new, old);
end;
$$;

create trigger movimentacoes_estoque_aplicar
  after insert or update or delete on public.movimentacoes_estoque
  for each row execute function public.movimentar_estoque();

-- Rede de segurança: refaz o saldo a partir do extrato inteiro. Se algum dia o
-- cache divergir, é isto que reconcilia — e é a prova viva de que o estoque é a
-- soma das movimentações.
create or replace function public.recalcular_estoque(p_produto_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_soma numeric(12, 3);
begin
  select coalesce(sum(public.delta_da_movimentacao(tipo, quantidade)), 0)
    into v_soma
  from public.movimentacoes_estoque
  where produto_id = p_produto_id;

  update public.produtos set estoque_atual = v_soma where id = p_produto_id;
  return v_soma;
end;
$$;

-- Registrar movimentação manual sem passar pela tabela.
--
-- Por que uma função em vez de insert direto: a tabela guarda custo_unitario,
-- que é preço de custo, e o vendedor não pode ler isso. A função deixa o
-- vendedor lançar entrada, saída e ajuste sem nunca receber a coluna de custo
-- de volta — ela devolve só o saldo novo.
create or replace function public.registrar_movimentacao(
  p_produto_id uuid,
  p_tipo public.tipo_movimentacao,
  p_quantidade numeric,
  p_motivo text
)
returns numeric
language plpgsql
as $$
declare
  v_oficina_id uuid := public.oficina_do_usuario();
  v_saldo numeric(12, 3);
begin
  if v_oficina_id is null then
    raise exception 'Usuário sem oficina ativa.' using errcode = 'insufficient_privilege';
  end if;

  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da movimentação.' using errcode = 'check_violation';
  end if;

  insert into public.movimentacoes_estoque
    (oficina_id, produto_id, tipo, quantidade, motivo, usuario_id)
  values
    (v_oficina_id, p_produto_id, p_tipo, p_quantidade, trim(p_motivo), auth.uid());

  select estoque_atual into v_saldo from public.produtos where id = p_produto_id;
  return v_saldo;
end;
$$;

revoke all on function public.registrar_movimentacao(uuid, public.tipo_movimentacao, numeric, text) from public, anon;
grant execute on function public.registrar_movimentacao(uuid, public.tipo_movimentacao, numeric, text) to authenticated;
revoke all on function public.recalcular_estoque(uuid) from public, anon;
grant execute on function public.recalcular_estoque(uuid) to authenticated;
