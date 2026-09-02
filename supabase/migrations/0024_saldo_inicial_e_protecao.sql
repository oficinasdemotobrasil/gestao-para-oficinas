-- 0024 — O saldo inicial também é uma movimentação
--
-- Defeito encontrado testando a 0019: o formulário de produto tem o campo
-- "estoque atual", e o que era digitado ali ia direto para a coluna, sem
-- movimentação nenhuma. O invariante "estoque = soma das movimentações" nascia
-- falso, e recalcular_estoque zeraria o produto — porque, para o extrato, ele
-- nunca tinha recebido nada.
--
-- Duas travas:
--
-- 1. Produto cadastrado com estoque vira um ajuste de "Saldo inicial do
--    cadastro". A quantidade entra pelo caminho normal, e o extrato conta a
--    história desde o primeiro dia.
-- 2. Ninguém mais escreve em estoque_atual direto. Quem tentar recebe uma
--    mensagem dizendo o que fazer. O único jeito de mexer no saldo passa a ser
--    registrar movimentação — que é exatamente o que foi pedido.

create or replace function public.registrar_saldo_inicial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inicial numeric(12, 3) := coalesce(new.estoque_atual, 0);
begin
  if v_inicial = 0 then
    return null;
  end if;

  -- Devolve a coluna a zero e deixa a movimentação recompor o valor. O gatilho
  -- de proteção deixa esta escrita passar porque ela vem de dentro de um gatilho.
  update public.produtos set estoque_atual = 0 where id = new.id;

  insert into public.movimentacoes_estoque
    (oficina_id, produto_id, tipo, quantidade, motivo, usuario_id)
  values
    (new.oficina_id, new.id, 'ajuste', v_inicial, 'Saldo inicial do cadastro', auth.uid());

  return null;
end;
$$;

create trigger produtos_saldo_inicial
  after insert on public.produtos
  for each row execute function public.registrar_saldo_inicial();

create or replace function public.proteger_estoque_atual()
returns trigger
language plpgsql
as $$
begin
  -- Escrita vinda de outro gatilho (o de movimentação, o de saldo inicial) ou da
  -- reconciliação: essas são as donas legítimas da coluna.
  if pg_trigger_depth() > 1
     or coalesce(current_setting('app.estoque_interno', true), 'nao') = 'sim'
  then
    return new;
  end if;

  if new.estoque_atual is distinct from old.estoque_atual then
    raise exception
      'O estoque não é alterado direto no cadastro. Registre uma entrada, uma saída ou um ajuste.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger produtos_proteger_estoque
  before update on public.produtos
  for each row execute function public.proteger_estoque_atual();

-- A reconciliação escreve na coluna por dever de ofício: avisa que é ela.
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

  perform set_config('app.estoque_interno', 'sim', true);
  update public.produtos set estoque_atual = v_soma where id = p_produto_id;
  perform set_config('app.estoque_interno', 'nao', true);

  return v_soma;
end;
$$;

revoke all on function public.recalcular_estoque(uuid) from public, anon;
grant execute on function public.recalcular_estoque(uuid) to authenticated;
