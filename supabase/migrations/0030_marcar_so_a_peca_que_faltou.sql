-- 0030 — A marca de "sem saldo" vai só na peça que faltou
--
-- O teste no navegador mostrou o defeito: uma ordem com óleo em falta e kit de
-- relação sobrando finalizou com as DUAS saídas marcadas como
-- "(saldo insuficiente no cadastro)". O kit tinha saldo.
--
-- A marca existe para o dono achar no extrato onde o cadastro descolou da
-- prateleira. Marcando peça que estava certa, ela deixa de servir para isso —
-- vira ruído, e ruído em extrato é pior do que marca nenhuma.
--
-- A lista das peças em falta é lida UMA vez, antes de qualquer baixa. Lida
-- dentro do laço, ela mudaria a cada peça já baixada e voltaria a mentir, agora
-- ao contrário.

-- E a trava só barra o que piora o saldo -------------------------------------
-- Segundo defeito que o teste encontrou, mais grave que o primeiro: cancelar
-- uma ordem finalizada com estoque negativo era impossível. A devolução é uma
-- ENTRADA, mas a trava olhava só o saldo final — e como ele continuava
-- negativo (de -6 para -5), ela recusava a própria devolução.
--
-- O estoque ficava preso: a ordem não podia ser cancelada, e a peça não voltava.
-- A regra certa é olhar a direção: entrada nunca piora nada, e não há motivo
-- para barrá-la. Só a saída e o ajuste para baixo precisam de licença.
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

  if v_novo < 0
     and p_delta < 0
     and coalesce(current_setting('app.estoque_pode_negativar', true), '') <> 'sim' then
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
  v_sem_saldo uuid[];
  v_item record;
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
           E'\n'),
         coalesce(array_agg(f.produto_id), '{}')
    into v_faltas, v_sem_saldo
  from public.faltas_para_finalizar_os(p_ordem_servico_id) f;

  if v_faltas is not null then
    if not p_permitir_negativo then
      raise exception E'Falta peça em estoque para finalizar:\n%', v_faltas
        using errcode = 'check_violation';
    end if;
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
       case when v_item.produto_id = any(v_sem_saldo)
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
