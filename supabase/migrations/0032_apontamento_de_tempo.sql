-- 0032 — O relógio da oficina
--
-- O tempo é apontado pelo próprio andamento da ordem: começar o serviço liga o
-- relógio, pausar desliga, avisar que terminou desliga. Ninguém tem de lembrar
-- de dois botões — na oficina, o que exige lembrar não é feito.
--
-- A regra difícil é a do apontamento único: um mecânico não pode estar em duas
-- motos ao mesmo tempo. Ela mora aqui, e não na tela, por dois motivos: o
-- celular dele pode estar com a tela antiga aberta, e um índice único não
-- depende de ninguém lembrar de checar antes.

-- Um relógio ligado por mecânico ---------------------------------------------
-- Índice parcial: só as linhas em aberto disputam. As fechadas, que são a
-- maioria e crescem para sempre, ficam de fora.
create unique index if not exists apontamentos_tempo_um_aberto_por_mecanico
  on public.apontamentos_tempo (mecanico_id)
  where fim is null;

-- Mensagem no lugar de tropeço -----------------------------------------------
-- O mecânico que tentava finalizar recebia "new row violates row-level
-- security policy for table movimentacoes_estoque": a trava funcionava, mas por
-- acidente, e falando inglês de banco de dados. Agora a recusa vem na frente,
-- em português, antes de qualquer escrita.
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
  if public.eh_mecanico() then
    raise exception 'Marque a ordem como pronta para conferência. Finalizar é de quem confere o serviço.'
      using errcode = 'insufficient_privilege';
  end if;

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
  if public.eh_mecanico() then
    raise exception 'Cancelar a ordem é de quem atende o cliente.'
      using errcode = 'insufficient_privilege';
  end if;

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

-- O relógio segue o status ----------------------------------------------------
-- Definer: o apontamento é consequência do andamento, não escrita de ninguém.
-- Sem isto, o admin que também põe a mão na moto não conseguiria apontar tempo
-- — a política de insert da tabela é só do mecânico —, e a ordem mudaria de
-- status com o relógio parado, que é o pior dos dois mundos.
create or replace function public.ajustar_relogio_da_os()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outro record;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Saiu de 'em andamento': o relógio desta ordem para, seja quem for que
  -- estava com ela. Se o gerente pausou, o tempo do mecânico também para.
  if old.status = 'em_andamento' then
    update public.apontamentos_tempo
       set fim = now()
     where ordem_servico_id = new.id and fim is null;
  end if;

  if new.status = 'em_andamento' then
    -- Uma moto de cada vez. O relógio que estava aberto em outra ordem fecha, e
    -- aquela ordem volta para 'pausada' — senão ela ficaria "em andamento" com
    -- ninguém trabalhando nela.
    for v_outro in
      select a.id, a.ordem_servico_id
      from public.apontamentos_tempo a
      where a.mecanico_id = auth.uid() and a.fim is null and a.ordem_servico_id <> new.id
    loop
      update public.apontamentos_tempo set fim = now() where id = v_outro.id;
      update public.ordens_servico
         set status = 'pausada'
       where id = v_outro.ordem_servico_id and status = 'em_andamento';
    end loop;

    -- Retomar o que já estava aberto nesta mesma ordem não abre outro registro.
    if not exists (
      select 1 from public.apontamentos_tempo
      where ordem_servico_id = new.id and mecanico_id = auth.uid() and fim is null
    ) then
      insert into public.apontamentos_tempo (oficina_id, ordem_servico_id, mecanico_id)
      values (new.oficina_id, new.id, auth.uid());
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ordens_servico_ajustar_relogio on public.ordens_servico;
create trigger ordens_servico_ajustar_relogio
  after update on public.ordens_servico
  for each row execute function public.ajustar_relogio_da_os();

-- Quanto tempo já foi ---------------------------------------------------------
-- Uma chamada só devolve o que a tela precisa: o que já fechou, desde quando o
-- relógio está rodando (para o cronômetro contar sozinho, sem consultar o
-- servidor a cada segundo) e quanto os serviços da ordem foram estimados.
create or replace function public.tempo_da_os(p_ordem_servico_id uuid)
returns table (
  minutos_registrados integer,
  rodando_desde timestamptz,
  quem_esta_com_ela text,
  minutos_estimados integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((
      select sum(a.duracao_minutos)::integer
      from public.apontamentos_tempo a
      where a.ordem_servico_id = p_ordem_servico_id and a.fim is not null
    ), 0),
    (select a.inicio from public.apontamentos_tempo a
      where a.ordem_servico_id = p_ordem_servico_id and a.fim is null
      order by a.inicio limit 1),
    (select u.nome from public.apontamentos_tempo a
       join public.usuarios u on u.id = a.mecanico_id
      where a.ordem_servico_id = p_ordem_servico_id and a.fim is null
      order by a.inicio limit 1),
    coalesce((
      select sum(s.tempo_estimado_minutos * i.quantidade)::integer
      from public.os_itens i
      join public.servicos s on s.id = i.servico_id
      where i.ordem_servico_id = p_ordem_servico_id
        and i.tipo = 'servico'
        and s.tempo_estimado_minutos is not null
    ), 0);
$$;

comment on function public.tempo_da_os is
  'O que a tela do cronômetro precisa numa chamada só. Definer porque o total soma o tempo de todos os mecânicos, e cada um só enxerga o próprio apontamento.';

-- Quem foi pausado ------------------------------------------------------------
-- mudar_status_da_os passa a dizer se pausou outra ordem, para a tela avisar em
-- vez de a pessoa descobrir sozinha que a moto de antes parou.
drop function if exists public.mudar_status_da_os(uuid, public.status_os);

create function public.mudar_status_da_os(
  p_ordem_servico_id uuid,
  p_status public.status_os
)
returns jsonb
language plpgsql
as $$
declare
  v_os public.ordens_servico;
  v_pausada text;
begin
  if p_status in ('finalizada', 'cancelada') then
    raise exception 'Finalizar e cancelar têm caminho próprio, que mexe no estoque.'
      using errcode = 'check_violation';
  end if;

  -- Lido ANTES da mudança: depois dela o apontamento da outra ordem já fechou,
  -- e não haveria mais como saber qual foi.
  if p_status = 'em_andamento' then
    select o.numero::text into v_pausada
    from public.apontamentos_tempo a
    join public.ordens_servico o on o.id = a.ordem_servico_id
    where a.mecanico_id = auth.uid() and a.fim is null
      and a.ordem_servico_id <> p_ordem_servico_id
    order by a.inicio
    limit 1;
  end if;

  update public.ordens_servico
     set status = p_status,
         data_conclusao = case when p_status = 'entregue' then now() else data_conclusao end
   where id = p_ordem_servico_id
  returning * into v_os;

  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'no_data_found';
  end if;

  return jsonb_build_object(
    'ordem', to_jsonb(v_os),
    'pausou_a_ordem', v_pausada
  );
end;
$$;

select public.conferir_fechadura();
