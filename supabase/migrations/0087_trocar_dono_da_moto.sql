-- 0087 — Trocar o dono da moto
--
-- Um cliente pediu (28/10/2026): a moto foi vendida, o comprador chegou à
-- oficina, e não havia como fazer o orçamento no nome dele. A moto só aparece
-- para o dono atual, e cadastrá-la de novo esbarra na placa repetida. O banco
-- sempre esteve pronto para isso — cada dono tem início e fim (0004), e o
-- histórico mostra o "dono na época" de cada serviço (0036, 0037) —, só faltava
-- a porta.
--
-- Trocar = encerrar o dono atual na data da troca e registrar o novo a partir
-- dela, numa transação só: a moto nunca fica sem dono no meio do caminho. No
-- dia da troca as duas posses valem; o desempate da 0037 (quem foi registrado
-- depois) faz um serviço daquele dia ficar no nome de quem recebeu a moto.
--
-- O que NÃO muda: orçamentos, ordens, contas e notas continuam no nome de quem
-- pediu e pagou. O dono antigo continua cliente, com toda a ficha.
--
-- Desfazer existe para o engano ("troquei para o cliente errado") e só vale
-- enquanto ninguém fez orçamento nem ordem desta moto depois da troca — senão
-- o desfazer reescreveria de quem foi um serviço que já aconteceu. Aí, o
-- caminho é trocar de novo.

-- O dia de hoje no Brasil: à noite, o "hoje" do servidor (UTC) já é amanhã.
create or replace function public.hoje_no_brasil()
returns date
language sql
stable
set search_path = public, extensions
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

/*
 * Roda como quem chama (sem `security definer`): as regras de quem pode mexer
 * em proprietários (RLS da 0010, só atendimento) e a trava de oficina suspensa
 * (0038) valem aqui sem repetição. A conferência de perfil abaixo é só para a
 * mensagem sair em português.
 */
create or replace function public.trocar_dono_da_moto(
  p_moto_id uuid,
  p_novo_cliente_id uuid,
  p_data date default null
)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_oficina uuid := public.oficina_do_usuario();
  v_data date := coalesce(p_data, public.hoje_no_brasil());
  v_atual public.moto_proprietarios;
  v_novo text;
  v_anterior text;
begin
  if v_oficina is null or not public.eh_atendimento() then
    raise exception 'Trocar o dono da moto é de quem atende o cliente.'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.motos where id = p_moto_id and oficina_id = v_oficina) then
    raise exception 'Moto não encontrada.' using errcode = 'no_data_found';
  end if;
  select nome into v_novo from public.clientes
   where id = p_novo_cliente_id and oficina_id = v_oficina;
  if v_novo is null then
    raise exception 'Cliente não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_data > public.hoje_no_brasil() then
    raise exception 'A data da troca não pode ser no futuro.' using errcode = 'check_violation';
  end if;

  select * into v_atual from public.moto_proprietarios
   where moto_id = p_moto_id and data_fim is null
   for update;

  if found then
    if v_atual.cliente_id = p_novo_cliente_id then
      raise exception '% já é o dono desta moto.', v_novo using errcode = 'check_violation';
    end if;
    -- O cadastro da moto (0015) grava o início pelo relógio do servidor (UTC),
    -- que depois das 21h no Brasil já está no dia seguinte. Uma troca feita
    -- "hoje" à noite, numa moto cadastrada na mesma noite, cairia antes do
    -- início do dono. Nesse caso, e só nele, a troca vale no dia do início.
    if v_data < v_atual.data_inicio
       and v_data = public.hoje_no_brasil()
       and v_atual.data_inicio <= current_date then
      v_data := v_atual.data_inicio;
    end if;
    if v_data < v_atual.data_inicio then
      raise exception 'A data da troca (%) é anterior ao dia em que o dono atual recebeu a moto (%).',
        to_char(v_data, 'DD/MM/YYYY'), to_char(v_atual.data_inicio, 'DD/MM/YYYY')
        using errcode = 'check_violation';
    end if;
    select nome into v_anterior from public.clientes where id = v_atual.cliente_id;
    update public.moto_proprietarios set data_fim = v_data where id = v_atual.id;
  end if;

  insert into public.moto_proprietarios (oficina_id, moto_id, cliente_id, data_inicio)
  values (v_oficina, p_moto_id, p_novo_cliente_id, v_data);

  return jsonb_build_object('anterior', v_anterior, 'novo', v_novo, 'data', v_data);
end;
$$;

/*
 * Roda como dono do banco porque apagar uma posse é, pela RLS, só do admin — e
 * o engano pode ser de quem está no balcão. As conferências abaixo fazem o
 * papel da política: mesma oficina, perfil de atendimento, e nada feito na
 * moto depois da troca.
 */
create or replace function public.desfazer_troca_de_dono(p_moto_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_oficina uuid := public.oficina_do_usuario();
  v_atual public.moto_proprietarios;
  v_anterior public.moto_proprietarios;
begin
  if v_oficina is null or not public.eh_atendimento() then
    raise exception 'Desfazer a troca de dono é de quem atende o cliente.'
      using errcode = 'insufficient_privilege';
  end if;
  if not public.oficina_pode_escrever() then
    raise exception 'A oficina está só para consulta. Regularize a assinatura para voltar a alterar.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_atual from public.moto_proprietarios
   where moto_id = p_moto_id and oficina_id = v_oficina and data_fim is null
   for update;
  if not found then
    raise exception 'Esta moto não tem dono atual.' using errcode = 'no_data_found';
  end if;

  -- A posse que a troca encerrou: termina no dia em que a atual começou e foi
  -- registrada antes dela.
  select * into v_anterior from public.moto_proprietarios
   where moto_id = p_moto_id and oficina_id = v_oficina
     and id <> v_atual.id
     and data_fim = v_atual.data_inicio
     and criado_em < v_atual.criado_em
   order by criado_em desc
   limit 1
   for update;
  if not found then
    raise exception 'Não há troca de dono para desfazer nesta moto.' using errcode = 'no_data_found';
  end if;

  if exists (select 1 from public.orcamentos
              where moto_id = p_moto_id and oficina_id = v_oficina and criado_em >= v_atual.criado_em)
     or exists (select 1 from public.ordens_servico
              where moto_id = p_moto_id and oficina_id = v_oficina and criado_em >= v_atual.criado_em) then
    raise exception 'Depois da troca já foi feito orçamento ou ordem de serviço desta moto. Para corrigir, troque o dono de novo.'
      using errcode = 'check_violation';
  end if;

  delete from public.moto_proprietarios where id = v_atual.id;
  update public.moto_proprietarios set data_fim = null where id = v_anterior.id;

  return jsonb_build_object(
    'dono', (select nome from public.clientes where id = v_anterior.cliente_id)
  );
end;
$$;

revoke all on function public.hoje_no_brasil() from public, anon;
revoke all on function public.trocar_dono_da_moto(uuid, uuid, date) from public, anon;
revoke all on function public.desfazer_troca_de_dono(uuid) from public, anon;
grant execute on function public.hoje_no_brasil() to authenticated, service_role;
grant execute on function public.trocar_dono_da_moto(uuid, uuid, date) to authenticated, service_role;
grant execute on function public.desfazer_troca_de_dono(uuid) to authenticated, service_role;

select public.conferir_fechadura();
