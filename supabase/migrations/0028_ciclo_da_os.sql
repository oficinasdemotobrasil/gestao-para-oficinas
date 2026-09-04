-- 0028 — O ciclo de vida da ordem de serviço
--
-- Até aqui a OS nascia 'aberta' e ficava. Agora ela anda, e cada passo fica
-- registrado com quem deu e quando. Três regras moram no banco, e não na tela:
--
-- 1. Não se pula etapa. De 'aberta' não se vai direto para 'entregue'.
-- 2. O mecânico anda só no pedaço dele. Ele começa, pausa, retoma e avisa que
--    terminou. Finalizar, entregar e cancelar são de quem confere e cobra.
-- 3. Ordem finalizada não muda mais de itens. O que foi cobrado foi cobrado.
--
-- Na tela essas regras também aparecem, escondendo botão. Mas é aqui que elas
-- valem: dois celulares abrem a mesma OS ao mesmo tempo, e a tela do segundo
-- não sabe o que o primeiro acabou de fazer.

-- Observação técnica separada da comercial ------------------------------------
-- A OS herda 'observacoes' do orçamento — que hoje costuma ser o texto de venda
-- escrito para convencer o cliente. Mandar isso para o mecânico como se fosse
-- instrução de serviço é confundir quem está trabalhando.
alter table public.ordens_servico
  add column if not exists observacoes_tecnicas text;

comment on column public.ordens_servico.observacoes is
  'Veio do orçamento: é o texto que o cliente leu. Histórico, não instrução.';
comment on column public.ordens_servico.observacoes_tecnicas is
  'O que o mecânico escreveu enquanto trabalhava. É isto que sai no PDF da OS.';

-- Histórico de status ---------------------------------------------------------
create table if not exists public.os_status_historico (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  ordem_servico_id uuid not null,
  -- Nulo na primeira linha: a ordem não vinha de status nenhum.
  de public.status_os,
  para public.status_os not null,
  -- Nulo se a linha nasceu de um processo do banco e não de uma pessoa.
  usuario_id uuid,
  criado_em timestamptz not null default now(),
  constraint os_status_historico_os_fk
    foreign key (ordem_servico_id, oficina_id) references public.ordens_servico (id, oficina_id) on delete cascade,
  constraint os_status_historico_usuario_fk
    foreign key (usuario_id, oficina_id) references public.usuarios (id, oficina_id) on delete set null
);

create index if not exists os_status_historico_oficina_id_idx
  on public.os_status_historico (oficina_id);
create index if not exists os_status_historico_os_idx
  on public.os_status_historico (ordem_servico_id, criado_em);

alter table public.os_status_historico enable row level security;

-- Quem enxerga a ordem enxerga o andamento dela. Ninguém escreve pela mão: as
-- linhas nascem só do gatilho, que roda como dono do banco.
create policy "atendimento le o historico da os"
  on public.os_status_historico for select to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

create policy "mecanico le o historico das proprias ordens"
  on public.os_status_historico for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and exists (
      select 1 from public.ordens_servico os
      where os.id = os_status_historico.ordem_servico_id
        and os.responsavel_id = auth.uid()
    )
  );

-- Quais passos existem --------------------------------------------------------
create or replace function public.transicao_de_os_valida(
  p_de public.status_os,
  p_para public.status_os
)
returns boolean
language sql
immutable
as $$
  select case p_de
    when 'aberta' then p_para in ('em_andamento', 'cancelada')
    when 'em_andamento' then p_para in ('pausada', 'aguardando_conferencia', 'finalizada', 'cancelada')
    when 'pausada' then p_para in ('em_andamento', 'cancelada')
    -- Volta para 'em_andamento' quando a conferência acha que faltou algo.
    when 'aguardando_conferencia' then p_para in ('em_andamento', 'finalizada', 'cancelada')
    when 'finalizada' then p_para in ('entregue', 'cancelada')
    -- Entregue e cancelada são fim de linha. Ordem entregue que voltou é ordem
    -- nova, com o histórico da anterior à vista — não a mesma reaberta.
    else false
  end;
$$;

comment on function public.transicao_de_os_valida is
  'Os passos permitidos do ciclo da OS. Cancelar vale até a entrega; depois dela, não.';

create or replace function public.nome_do_status_os(p_status public.status_os)
returns text
language sql
immutable
as $$
  select case p_status
    when 'aberta' then 'aberta'
    when 'em_andamento' then 'em andamento'
    when 'pausada' then 'pausada'
    when 'aguardando_conferencia' then 'aguardando conferência'
    when 'finalizada' then 'finalizada'
    when 'entregue' then 'entregue'
    when 'cancelada' then 'cancelada'
  end;
$$;

-- A trava ---------------------------------------------------------------------
create or replace function public.conferir_mudanca_de_status_da_os()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not public.transicao_de_os_valida(old.status, new.status) then
    raise exception 'A ordem está % e não pode passar para %.',
      public.nome_do_status_os(old.status), public.nome_do_status_os(new.status)
      using errcode = 'check_violation';
  end if;

  -- O mecânico anda só no pedaço dele. Sem isto, bastaria uma chamada direta à
  -- API para ele finalizar a própria ordem e dar baixa no estoque.
  if public.eh_mecanico()
     and new.status not in ('em_andamento', 'pausada', 'aguardando_conferencia') then
    if new.status = 'cancelada' then
      raise exception 'Cancelar a ordem é de quem atende o cliente.'
        using errcode = 'insufficient_privilege';
    end if;
    raise exception 'Marque a ordem como pronta para conferência. Finalizar é de quem confere o serviço.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists ordens_servico_conferir_status on public.ordens_servico;
create trigger ordens_servico_conferir_status
  before update on public.ordens_servico
  for each row execute function public.conferir_mudanca_de_status_da_os();

-- O registro ------------------------------------------------------------------
-- Definer: a linha do histórico não é escrita por ninguém, é consequência. Se
-- dependesse da política de quem mudou o status, a ordem mudaria e o registro
-- não apareceria — que é a única forma de perder essa informação.
create or replace function public.registrar_status_da_os()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.os_status_historico (oficina_id, ordem_servico_id, de, para, usuario_id)
    values (new.oficina_id, new.id, null, new.status, auth.uid());
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.os_status_historico (oficina_id, ordem_servico_id, de, para, usuario_id)
    values (new.oficina_id, new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists ordens_servico_registrar_status on public.ordens_servico;
create trigger ordens_servico_registrar_status
  after insert or update on public.ordens_servico
  for each row execute function public.registrar_status_da_os();

-- Ordem fechada não muda de itens ---------------------------------------------
create or replace function public.conferir_edicao_de_item_da_os()
returns trigger
language plpgsql
as $$
declare
  v_os_id uuid := coalesce(new.ordem_servico_id, old.ordem_servico_id);
  v_status public.status_os;
begin
  select status into v_status from public.ordens_servico where id = v_os_id;

  if v_status is null then
    return coalesce(new, old);
  end if;

  if v_status not in ('aberta', 'em_andamento', 'pausada', 'aguardando_conferencia') then
    raise exception 'A ordem está % e não aceita mais mudança de itens.',
      public.nome_do_status_os(v_status)
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists os_itens_conferir_edicao on public.os_itens;
create trigger os_itens_conferir_edicao
  before insert or update or delete on public.os_itens
  for each row execute function public.conferir_edicao_de_item_da_os();

-- Mudar de status -------------------------------------------------------------
-- Existe para a tela ter uma porta só, e para a mensagem de erro sair pronta.
-- As regras continuam nos gatilhos: quem chamar a tabela direto passa por elas
-- do mesmo jeito.
create or replace function public.mudar_status_da_os(
  p_ordem_servico_id uuid,
  p_status public.status_os
)
returns public.ordens_servico
language plpgsql
as $$
declare
  v_os public.ordens_servico;
begin
  if p_status in ('finalizada', 'cancelada') then
    raise exception 'Finalizar e cancelar têm caminho próprio, que mexe no estoque.'
      using errcode = 'check_violation';
  end if;

  update public.ordens_servico
     set status = p_status,
         data_conclusao = case when p_status = 'entregue' then now() else data_conclusao end
   where id = p_ordem_servico_id
  returning * into v_os;

  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'no_data_found';
  end if;

  return v_os;
end;
$$;

-- A fechadura, agora reaproveitável -------------------------------------------
-- O mesmo conteúdo da 0014, virado função para as migrations desta fase
-- poderem chamar. O comentário de lá continua valendo: deixar isso na mão de
-- conferência manual significa que, na décima tabela nova, alguém esquece.
create or replace function public.conferir_fechadura()
returns void
language plpgsql
as $$
declare
  pendentes text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into pendentes
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if pendentes is not null then
    raise exception 'Tabelas sem RLS ativado: %', pendentes;
  end if;

  select string_agg(c.relname, ', ' order by c.relname) into pendentes
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid);
  if pendentes is not null then
    raise exception 'Tabelas com RLS mas sem nenhuma política: %', pendentes;
  end if;

  select string_agg(c.relname, ', ' order by c.relname) into pendentes
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('oficinas')
    and not exists (
      select 1 from pg_attribute a
      where a.attrelid = c.oid and a.attname = 'oficina_id' and not a.attisdropped
    );
  if pendentes is not null then
    raise exception 'Tabelas sem coluna oficina_id: %', pendentes;
  end if;
end;
$$;

select public.conferir_fechadura();
