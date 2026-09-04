-- 0033 — O mecânico deixa de enxergar dinheiro, no banco e não só na tela
--
-- Até aqui a tela escondia os valores do mecânico, e a tela é conveniência: o
-- mesmo mecânico abrindo o aplicativo no navegador do computador, ou chamando a
-- API na mão, recebia o preço de cada item e o total da ordem. O critério de
-- aceite da fase é outro — ele não vê valor "nem digitando a URL na mão".
--
-- RLS filtra LINHA, não COLUNA. Não existe política que devolva a ordem sem o
-- valor_total. Então o caminho é o mesmo do preço de custo (vw_produtos, 0012):
-- o mecânico perde a leitura direta das tabelas com dinheiro e passa a receber,
-- por funções que rodam como dono do banco, exatamente o que a tela dele
-- precisa — e nada além.
--
-- Isso muda a forma do aplicativo dele, e está certo assim: a Fase 3 pediu um
-- app diferente e mais simples para quem está com a chave na mão.

-- Item executado --------------------------------------------------------------
alter table public.os_itens
  add column if not exists executado_em timestamptz,
  add column if not exists executado_por uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'os_itens_executado_por_fk'
  ) then
    alter table public.os_itens
      add constraint os_itens_executado_por_fk
      foreign key (executado_por, oficina_id)
      references public.usuarios (id, oficina_id)
      on delete set null (executado_por);
  end if;
end $$;

comment on column public.os_itens.executado_em is
  'Quando o mecânico marcou este item como feito. Nulo enquanto está por fazer.';

-- A ordem é dele? -------------------------------------------------------------
-- Vira função porque, sem a leitura direta de ordens_servico, as políticas que
-- perguntavam "existe uma OS minha com este cliente?" parariam de enxergar a
-- própria OS. Roda como dono do banco pelo mesmo motivo das outras auxiliares.
create or replace function public.ordem_e_do_mecanico(p_ordem_servico_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ordens_servico os
    where os.id = p_ordem_servico_id
      and os.oficina_id = public.oficina_do_usuario()
      and os.responsavel_id = auth.uid()
  );
$$;

-- Fim da leitura direta do que tem dinheiro -----------------------------------
drop policy if exists "mecanico le as proprias ordens" on public.ordens_servico;
drop policy if exists "mecanico le itens das proprias ordens" on public.os_itens;

-- As políticas que dependiam daquela leitura passam pela função --------------
-- Cliente e moto da ordem dele ------------------------------------------------
-- Estas duas perguntavam "existe uma OS minha com este cliente?" olhando
-- ordens_servico direto — e é justamente essa leitura que ele acabou de perder.
-- A pergunta continua a mesma; quem responde passa a ser uma função que roda
-- como dona do banco. Sem isto, o mecânico abre a ordem e não sabe de que moto
-- nem de quem ela é.
create or replace function public.cliente_tem_ordem_do_mecanico(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ordens_servico os
    where os.cliente_id = p_cliente_id
      and os.oficina_id = public.oficina_do_usuario()
      and os.responsavel_id = auth.uid()
  );
$$;

create or replace function public.moto_tem_ordem_do_mecanico(p_moto_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ordens_servico os
    where os.moto_id = p_moto_id
      and os.oficina_id = public.oficina_do_usuario()
      and os.responsavel_id = auth.uid()
  );
$$;

drop policy if exists "mecanico le o cliente da propria ordem" on public.clientes;
create policy "mecanico le o cliente da propria ordem"
  on public.clientes for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and public.cliente_tem_ordem_do_mecanico(clientes.id)
  );

drop policy if exists "mecanico le a moto da propria ordem" on public.motos;
create policy "mecanico le a moto da propria ordem"
  on public.motos for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and public.moto_tem_ordem_do_mecanico(motos.id)
  );

drop policy if exists "mecanico le o historico das proprias ordens" on public.os_status_historico;
create policy "mecanico le o historico das proprias ordens"
  on public.os_status_historico for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and public.ordem_e_do_mecanico(os_status_historico.ordem_servico_id)
  );

drop policy if exists "mecanico registra o proprio apontamento" on public.apontamentos_tempo;
create policy "mecanico registra o proprio apontamento"
  on public.apontamentos_tempo for insert to authenticated
  with check (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and mecanico_id = auth.uid()
    and public.ordem_e_do_mecanico(apontamentos_tempo.ordem_servico_id)
  );

-- Marcar item como feito ------------------------------------------------------
-- Única escrita do mecânico em os_itens, e ela não toca em preço nem em
-- quantidade. Por isso é uma função, e não uma política de update: política
-- libera a LINHA inteira, e a linha tem dinheiro.
create or replace function public.marcar_item_executado(
  p_item_id uuid,
  p_feito boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os_id uuid;
  v_status public.status_os;
begin
  select i.ordem_servico_id, os.status
    into v_os_id, v_status
  from public.os_itens i
  join public.ordens_servico os on os.id = i.ordem_servico_id
  where i.id = p_item_id
    and os.oficina_id = public.oficina_do_usuario();

  if v_os_id is null then
    raise exception 'Item não encontrado.' using errcode = 'no_data_found';
  end if;

  -- Definer passa por cima do RLS: a dona da permissão aqui é esta verificação.
  if public.eh_mecanico() and not public.ordem_e_do_mecanico(v_os_id) then
    raise exception 'Esta ordem não está com você.' using errcode = 'insufficient_privilege';
  end if;

  if v_status not in ('aberta', 'em_andamento', 'pausada', 'aguardando_conferencia') then
    raise exception 'A ordem está % e não aceita mais mudança.',
      public.nome_do_status_os(v_status) using errcode = 'check_violation';
  end if;

  update public.os_itens
     set executado_em = case when p_feito then now() else null end,
         executado_por = case when p_feito then auth.uid() else null end
   where id = p_item_id;
end;
$$;

-- O mecânico não mexe no dinheiro da ordem ------------------------------------
-- Ele continua com update em ordens_servico (é assim que muda de status e
-- escreve a observação técnica). A política libera a linha inteira; este gatilho
-- fecha as colunas que ela abriria.
create or replace function public.mecanico_nao_mexe_no_dinheiro()
returns trigger
language plpgsql
as $$
begin
  -- pg_trigger_depth() > 1: a mudança veio de outro gatilho ou de uma função do
  -- próprio banco — o recálculo do total, por exemplo —, e não do dedo dele.
  if not public.eh_mecanico() or pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.valor_total is distinct from old.valor_total
     or new.desconto is distinct from old.desconto
     or new.desconto_tipo is distinct from old.desconto_tipo
     or new.cliente_id is distinct from old.cliente_id
     or new.moto_id is distinct from old.moto_id
     or new.responsavel_id is distinct from old.responsavel_id
     or new.orcamento_id is distinct from old.orcamento_id then
    raise exception 'Valores e atribuição da ordem são de quem atende o cliente.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists ordens_servico_mecanico_nao_mexe_no_dinheiro on public.ordens_servico;
create trigger ordens_servico_mecanico_nao_mexe_no_dinheiro
  before update on public.ordens_servico
  for each row execute function public.mecanico_nao_mexe_no_dinheiro();

-- Mudar de status sem ler a tabela --------------------------------------------
-- 'update ... returning' exige política de select, que o mecânico já não tem.
-- A função passa a rodar como dona do banco, e a permissão que valia pelo RLS
-- é refeita aqui, escrita à vista.
drop function if exists public.mudar_status_da_os(uuid, public.status_os);

create function public.mudar_status_da_os(
  p_ordem_servico_id uuid,
  p_status public.status_os
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os public.ordens_servico;
  v_pausada text;
begin
  if p_status in ('finalizada', 'cancelada') then
    raise exception 'Finalizar e cancelar têm caminho próprio, que mexe no estoque.'
      using errcode = 'check_violation';
  end if;

  select * into v_os from public.ordens_servico
   where id = p_ordem_servico_id and oficina_id = public.oficina_do_usuario();
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'no_data_found';
  end if;

  if public.eh_mecanico() and not public.ordem_e_do_mecanico(p_ordem_servico_id) then
    raise exception 'Esta ordem não está com você.' using errcode = 'insufficient_privilege';
  end if;
  if not public.eh_mecanico() and not public.eh_atendimento() then
    raise exception 'Sem permissão para mexer nesta ordem.' using errcode = 'insufficient_privilege';
  end if;

  -- Lido ANTES da mudança: depois dela o apontamento da outra ordem já fechou.
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

  -- O mecânico recebe a ordem sem os campos de dinheiro. Mandar o objeto
  -- inteiro aqui desfaria, numa linha, tudo o que esta migration fez.
  return jsonb_build_object(
    'ordem', case
      when public.eh_mecanico()
        then to_jsonb(v_os) - 'valor_total' - 'desconto' - 'desconto_tipo'
      else to_jsonb(v_os)
    end,
    'pausou_a_ordem', v_pausada
  );
end;
$$;

-- A observação técnica, que é dele -------------------------------------------
-- Também precisa de função própria, e pelo mesmo motivo do status: um
-- 'update ... where id = X' precisa LER a linha para achá-la, e ler é
-- justamente o que ele não pode mais. Sem isto, o campo de observação do
-- mecânico salvaria em silêncio, sem gravar nada — o pior tipo de defeito.
create or replace function public.salvar_observacoes_tecnicas(
  p_ordem_servico_id uuid,
  p_texto text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.status_os;
begin
  select status into v_status
  from public.ordens_servico
  where id = p_ordem_servico_id and oficina_id = public.oficina_do_usuario();

  if v_status is null then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'no_data_found';
  end if;

  if public.eh_mecanico() and not public.ordem_e_do_mecanico(p_ordem_servico_id) then
    raise exception 'Esta ordem não está com você.' using errcode = 'insufficient_privilege';
  end if;
  if not public.eh_mecanico() and not public.eh_atendimento() then
    raise exception 'Sem permissão para mexer nesta ordem.' using errcode = 'insufficient_privilege';
  end if;

  if v_status not in ('aberta', 'em_andamento', 'pausada', 'aguardando_conferencia') then
    raise exception 'A ordem está % e não aceita mais mudança.',
      public.nome_do_status_os(v_status) using errcode = 'check_violation';
  end if;

  update public.ordens_servico
     set observacoes_tecnicas = nullif(trim(p_texto), '')
   where id = p_ordem_servico_id;
end;
$$;

-- Política que virou letra morta ----------------------------------------------
-- Ela deixaria o mecânico atualizar a própria ordem — mas um update precisa ler
-- a linha para achá-la, e a leitura acabou de sair. Na prática ela não casa mais
-- nada. Fica removida para não enganar quem ler as políticas amanhã achando que
-- por ali passa alguma coisa.
drop policy if exists "mecanico atualiza as proprias ordens" on public.ordens_servico;

-- O aplicativo do mecânico ----------------------------------------------------
-- Duas funções entregam a tela dele inteira, sem passar por nenhuma tabela com
-- dinheiro. O que não está aqui, ele não recebe — e é mais fácil conferir uma
-- lista de campos do que confiar que nenhuma consulta da tela pediu demais.
create or replace function public.ordens_do_mecanico()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(linha order by linha->>'ordem_status', linha->>'numero'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', os.id,
      'numero', os.numero,
      'status', os.status,
      'data_abertura', os.data_abertura,
      'km_entrada', os.km_entrada,
      'cliente_nome', c.nome,
      'placa', m.placa,
      'marca', m.marca,
      'modelo', m.modelo,
      -- Em andamento primeiro, depois pausada, depois o resto: é a ordem em que
      -- o dia dele acontece.
      'ordem_status', case os.status
        when 'em_andamento' then '1'
        when 'pausada' then '2'
        when 'aberta' then '3'
        when 'aguardando_conferencia' then '4'
        else '5' end
    ) as linha
    from public.ordens_servico os
    left join public.clientes c on c.id = os.cliente_id
    left join public.motos m on m.id = os.moto_id
    where os.oficina_id = public.oficina_do_usuario()
      and os.responsavel_id = auth.uid()
      and os.status in ('aberta', 'em_andamento', 'pausada', 'aguardando_conferencia')
  ) t;
$$;

create or replace function public.os_do_mecanico(p_ordem_servico_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.ordem_e_do_mecanico(p_ordem_servico_id) then
    raise exception 'Esta ordem não está com você.' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'id', os.id,
    'numero', os.numero,
    'status', os.status,
    'data_abertura', os.data_abertura,
    'km_entrada', os.km_entrada,
    'garantia_ate', os.garantia_ate,
    'observacoes_tecnicas', os.observacoes_tecnicas,
    'cliente_nome', c.nome,
    'placa', m.placa,
    'marca', m.marca,
    'modelo', m.modelo,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'tipo', i.tipo,
        'descricao', i.descricao,
        'quantidade', i.quantidade,
        'executado_em', i.executado_em
      ) order by i.criado_em)
      from public.os_itens i
      where i.ordem_servico_id = os.id
    ), '[]'::jsonb)
  )
  into v
  from public.ordens_servico os
  left join public.clientes c on c.id = os.cliente_id
  left join public.motos m on m.id = os.moto_id
  where os.id = p_ordem_servico_id;

  return v;
end;
$$;

comment on function public.os_do_mecanico is
  'A tela do mecânico inteira, sem nenhum valor. O que não está listado aqui, ele não recebe.';

select public.conferir_fechadura();
