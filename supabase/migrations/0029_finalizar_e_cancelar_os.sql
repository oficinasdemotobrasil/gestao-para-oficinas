-- 0029 — Finalizar dá baixa no estoque; cancelar devolve
--
-- A baixa acontece na finalização, e não na aprovação, porque entre uma coisa
-- e outra a moto pode nem ter entrado na oficina. Peça reservada não é peça
-- consumida.
--
-- A parte delicada é o saldo insuficiente. Hoje o banco recusa qualquer
-- movimentação que deixe o estoque negativo, e essa trava já evitou erro nos
-- testes. Mas na finalização ela mente: a peça FOI aplicada na moto: negar
-- isso é o sistema discordando da realidade, e quem perde é o dono, que fica
-- sem saber o que saiu.
--
-- Então a trava continua valendo em todo lugar — entrada, saída avulsa,
-- ajuste, cancelamento de nota — e só a finalização pode passar por cima, com
-- pedido explícito de quem está finalizando. A movimentação nasce marcada, e o
-- extrato mostra exatamente onde o cadastro descolou da realidade.

-- A brecha, estreita de propósito ---------------------------------------------
-- 'app.estoque_pode_negativar' só existe dentro da transação que a liga, e só
-- finalizar_os a liga. Mesma técnica do 'app.estoque_interno' da 0024.
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

  if v_novo < 0 and coalesce(current_setting('app.estoque_pode_negativar', true), '') <> 'sim' then
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

-- O que falta para finalizar --------------------------------------------------
-- Devolve uma linha por peça sem saldo. A tela chama antes de finalizar para
-- dizer o que falta; finalizar_os chama de novo, porque entre a pergunta e a
-- resposta outra pessoa pode ter dado saída na mesma peça.
create or replace function public.faltas_para_finalizar_os(p_ordem_servico_id uuid)
returns table (
  produto_id uuid,
  nome text,
  unidade text,
  necessario numeric,
  em_estoque numeric,
  falta numeric
)
language sql
stable
as $$
  select p.id, p.nome, p.unidade,
         sum(i.quantidade) as necessario,
         p.estoque_atual,
         sum(i.quantidade) - p.estoque_atual as falta
  from public.os_itens i
  join public.produtos p on p.id = i.produto_id
  where i.ordem_servico_id = p_ordem_servico_id
    and i.tipo = 'produto'
  group by p.id, p.nome, p.unidade, p.estoque_atual
  having sum(i.quantidade) > p.estoque_atual;
$$;

-- Só finaliza quem passa pela porta certa -------------------------------------
-- Sem isto, um update direto na tabela levaria a ordem para 'finalizada' sem
-- baixar peça nenhuma, e o estoque continuaria dizendo que a peça está na
-- prateleira. A regra não pode depender de a tela chamar a função certa.
create or replace function public.conferir_fechamento_da_os()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status in ('finalizada', 'cancelada')
     and coalesce(current_setting('app.os_fechamento', true), '') <> 'sim' then
    raise exception 'Finalizar e cancelar mexem no estoque: use finalizar_os ou cancelar_os.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists ordens_servico_conferir_fechamento on public.ordens_servico;
create trigger ordens_servico_conferir_fechamento
  before update on public.ordens_servico
  for each row execute function public.conferir_fechamento_da_os();

-- Finalizar -------------------------------------------------------------------
create or replace function public.finalizar_os(
  p_ordem_servico_id uuid,
  p_permitir_negativo boolean default false
)
returns public.ordens_servico
language plpgsql
as $$
declare
  v_os public.ordens_servico;
  v_faltas text;
  v_item record;
  v_negativou boolean := false;
begin
  select * into v_os from public.ordens_servico where id = p_ordem_servico_id for update;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'no_data_found';
  end if;

  if not public.transicao_de_os_valida(v_os.status, 'finalizada') then
    raise exception 'A ordem está % e não pode ser finalizada.',
      public.nome_do_status_os(v_os.status) using errcode = 'check_violation';
  end if;

  select string_agg(
           format('%s (tem %s %s, precisa de %s)',
                  f.nome,
                  public.formatar_quantidade(f.em_estoque),
                  f.unidade,
                  public.formatar_quantidade(f.necessario)),
           E'\n')
    into v_faltas
  from public.faltas_para_finalizar_os(p_ordem_servico_id) f;

  if v_faltas is not null then
    if not p_permitir_negativo then
      -- A mensagem já sai pronta para a tela: quais peças e quanto falta de
      -- cada uma. Sem isso, o dono descobre a falta uma peça por vez.
      raise exception E'Falta peça em estoque para finalizar:\n%', v_faltas
        using errcode = 'check_violation';
    end if;
    v_negativou := true;
    perform set_config('app.estoque_pode_negativar', 'sim', true);
  end if;

  for v_item in
    select i.produto_id, sum(i.quantidade) as quantidade
    from public.os_itens i
    where i.ordem_servico_id = p_ordem_servico_id and i.tipo = 'produto'
      and i.produto_id is not null
    group by i.produto_id
  loop
    insert into public.movimentacoes_estoque
      (oficina_id, produto_id, tipo, quantidade, motivo, ordem_servico_id, usuario_id)
    values
      (v_os.oficina_id, v_item.produto_id, 'saida', v_item.quantidade,
       case when v_negativou
            then format('Aplicado na OS nº %s (saldo insuficiente no cadastro)',
                        lpad(v_os.numero::text, 4, '0'))
            else format('Aplicado na OS nº %s', lpad(v_os.numero::text, 4, '0'))
       end,
       p_ordem_servico_id, auth.uid());
  end loop;

  perform set_config('app.estoque_pode_negativar', '', true);

  perform set_config('app.os_fechamento', 'sim', true);
  update public.ordens_servico
     set status = 'finalizada',
         data_conclusao = now()
   where id = p_ordem_servico_id
  returning * into v_os;
  perform set_config('app.os_fechamento', '', true);

  return v_os;
end;
$$;

-- Cancelar --------------------------------------------------------------------
-- Estorna com movimentação de entrada, nunca apagando o extrato. Mesma razão da
-- nota fiscal cancelada (0021): o extrato conta o que aconteceu, e o que
-- aconteceu foi uma saída seguida de uma devolução.
create or replace function public.cancelar_os(
  p_ordem_servico_id uuid,
  p_motivo text default null
)
returns public.ordens_servico
language plpgsql
as $$
declare
  v_os public.ordens_servico;
  v_mov record;
begin
  select * into v_os from public.ordens_servico where id = p_ordem_servico_id for update;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'no_data_found';
  end if;

  if not public.transicao_de_os_valida(v_os.status, 'cancelada') then
    raise exception 'A ordem está % e não pode mais ser cancelada.',
      public.nome_do_status_os(v_os.status) using errcode = 'check_violation';
  end if;

  for v_mov in
    select produto_id, quantidade
    from public.movimentacoes_estoque
    where ordem_servico_id = p_ordem_servico_id and tipo = 'saida'
  loop
    insert into public.movimentacoes_estoque
      (oficina_id, produto_id, tipo, quantidade, motivo, ordem_servico_id, usuario_id)
    values
      (v_os.oficina_id, v_mov.produto_id, 'entrada', v_mov.quantidade,
       format('Devolvido do cancelamento da OS nº %s', lpad(v_os.numero::text, 4, '0')),
       p_ordem_servico_id, auth.uid());
  end loop;

  perform set_config('app.os_fechamento', 'sim', true);
  update public.ordens_servico
     set status = 'cancelada',
         observacoes_tecnicas = case
           when coalesce(trim(p_motivo), '') = '' then observacoes_tecnicas
           else concat_ws(E'\n\n', observacoes_tecnicas,
                          format('Cancelada: %s', trim(p_motivo)))
         end
   where id = p_ordem_servico_id
  returning * into v_os;
  perform set_config('app.os_fechamento', '', true);

  return v_os;
end;
$$;

select public.conferir_fechadura();
