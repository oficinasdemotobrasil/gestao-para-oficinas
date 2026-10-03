-- 0079 — Fotos e vistoria na ordem de serviço
--
-- Pedido da oficina: registrar com foto como a moto chegou, o defeito
-- encontrado e como ela saiu. O motivo é proteção dos dois lados — "a moto não
-- tinha esse risco quando deixei aí" se resolve com uma foto com data — e
-- confiança: mostrar ao cliente a peça gasta que foi trocada.
--
-- Decisões, todas da oficina com a plataforma:
--
-- * Só foto, sem vídeo. Vídeo de celular pesa cem vezes mais, sobe mal no 4G
--   da oficina e multiplica o custo de armazenamento.
-- * Até 5 fotos por OS, no total. A foto já chega reduzida, feita no próprio
--   celular antes de enviar (src/lib/foto.ts) — o banco recusa o que passar de
--   1 MB ou não for JPEG, para a regra não depender do app.
-- * Limite de fotos guardadas por plano. Ao chegar nele, nada é apagado: o app
--   avisa e sugere o plano maior.
-- * As fotos valem enquanto vale a garantia, com mínimo de 30 dias, contados
--   da ENTREGA da moto. Depois somem sozinhas — a foto é prova durante a
--   garantia, e é por isso que não existe botão de "limpar tudo".
-- * Vistoria de entrada, opcional: itens para marcar, combustível, o que o
--   cliente deixou. Registra o que foto não mostra direito.
--
-- O arquivo da foto mora no Storage, num bucket privado, no caminho
--   <oficina_id>/<ordem_servico_id>/<foto_id>.jpg
-- A linha em os_fotos é a autorização: o arquivo só pode ser gravado depois
-- que a linha existe (e passou pelos limites), e só pode ser lido por quem
-- enxerga a linha. Assim os limites e a regra do mecânico valem para o
-- arquivo sem serem repetidos no Storage.

-- O limite de cada plano -----------------------------------------------------
alter table public.planos
  add column if not exists limite_fotos integer
    check (limite_fotos is null or limite_fotos >= 0);

comment on column public.planos.limite_fotos is
  'Quantas fotos de OS a oficina guarda ao mesmo tempo. Nulo é sem limite.';

update public.planos set limite_fotos = case id
    when 'gratuito' then 10
    when 'essencial' then 500
    when 'completo' then 2000
  end
where limite_fotos is null;

/*
 * O limite que vale hoje para a oficina.
 *
 * Durante o teste vale o do maior plano, pela mesma regra da 0066: quem está
 * conhecendo o sistema vê tudo. Fora do teste, o do plano dela.
 */
create or replace function public.limite_de_fotos(p_oficina uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.oficina_em_teste(p_oficina)
      then (select max(limite_fotos) from public.planos where ativo)
    else (
      select p.limite_fotos
      from public.oficinas o
      join public.planos p on p.id = o.plano
      where o.id = p_oficina
    )
  end;
$$;

-- Até quando as fotos de uma OS valem ----------------------------------------
/*
 * Nulo enquanto a moto não foi entregue: ordem aberta, parada ou só
 * finalizada guarda as fotos sem prazo.
 *
 * Entregue: a garantia da OS, contada da entrega, e nunca menos de 30 dias.
 * `garantia_ate` nasce na aprovação (current_date + dias de garantia), então
 * os dias de garantia são a distância entre ela e a abertura.
 *
 * Cancelada: 30 dias depois do cancelamento. Não há garantia, mas a conversa
 * com o cliente que desistiu ainda pode precisar da foto.
 *
 * Roda como dona do banco porque o mecânico não lê ordens_servico direto
 * (0033). Devolve só uma data, de uma OS cujo id é preciso conhecer.
 */
create or replace function public.fotos_da_os_valem_ate(p_ordem_servico_id uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select case os.status
    when 'entregue' then
      coalesce(os.data_conclusao, os.data_abertura)::date
        + greatest(coalesce(os.garantia_ate - os.data_abertura::date, 0), 30)
    when 'cancelada' then
      coalesce(
        (select max(h.criado_em) from public.os_status_historico h
          where h.ordem_servico_id = os.id and h.para = 'cancelada'),
        os.atualizado_em
      )::date + 30
    else null
  end
  from public.ordens_servico os
  where os.id = p_ordem_servico_id;
$$;

create or replace function public.foto_vencida(p_ordem_servico_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.fotos_da_os_valem_ate(p_ordem_servico_id) < current_date, false);
$$;

-- As fotos ---------------------------------------------------------------------
create table if not exists public.os_fotos (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  ordem_servico_id uuid not null,
  momento text not null check (momento in ('entrada', 'servico', 'entrega')),
  caminho text not null unique,
  bytes integer check (bytes is null or bytes > 0),
  -- A linha nasce antes do arquivo, para os limites serem conferidos antes do
  -- envio. Vira verdadeiro quando o arquivo chegou. Ver `foto_conta`.
  enviada boolean not null default false,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  constraint os_fotos_os_fk
    foreign key (ordem_servico_id, oficina_id)
    references public.ordens_servico (id, oficina_id) on delete cascade,
  constraint os_fotos_autor_fk
    foreign key (criado_por, oficina_id)
    references public.usuarios (id, oficina_id) on delete set null (criado_por)
);

create index if not exists os_fotos_por_ordem on public.os_fotos (ordem_servico_id);
create index if not exists os_fotos_por_oficina on public.os_fotos (oficina_id);

comment on table public.os_fotos is
  'Fotos da OS. O arquivo fica no bucket fotos-os, em <oficina>/<ordem>/<id>.jpg.';

/*
 * A foto conta (para os limites e para aparecer)?
 *
 * Enviada, sim. Não enviada, só na primeira hora: é o envio em andamento, e
 * precisa contar para duas pessoas não passarem juntas do limite. Depois de
 * uma hora sem arquivo, o envio falhou e o celular foi embora — a linha não
 * pode prender uma vaga para sempre. A limpeza da plataforma a apaga depois.
 */
create or replace function public.foto_conta(p_enviada boolean, p_criado_em timestamptz)
returns boolean
language sql
stable
as $$
  select p_enviada or p_criado_em > now() - interval '1 hour';
$$;

create or replace function public.fotos_em_uso(p_oficina uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.os_fotos f
  where f.oficina_id = p_oficina
    and public.foto_conta(f.enviada, f.criado_em)
    and not public.foto_vencida(f.ordem_servico_id);
$$;

-- Para a tela: quanto a oficina já usou e quanto cabe.
create or replace function public.minhas_fotos_em_uso()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'em_uso', public.fotos_em_uso(public.oficina_do_usuario()),
    'limite', public.limite_de_fotos(public.oficina_do_usuario())
  )
  where public.oficina_do_usuario() is not null;
$$;

/*
 * As travas de quem envia.
 *
 * Roda como dona do banco porque precisa contar fotos que o mecânico não
 * enxerga (as das ordens dos colegas) para conferir o limite do plano.
 *
 * O bloqueio por oficina serializa dois envios simultâneos da mesma oficina:
 * sem ele, duas pessoas com a vaga 499 de 500 passariam juntas.
 */
create or replace function public.conferir_foto_nova()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.status_os;
  v_na_ordem integer;
  v_em_uso integer;
  v_limite integer;
  v_plano text;
begin
  if new.caminho is distinct from
     format('%s/%s/%s.jpg', new.oficina_id, new.ordem_servico_id, new.id) then
    raise exception 'Caminho da foto fora do formato.' using errcode = 'check_violation';
  end if;

  select status into v_status
  from public.ordens_servico
  where id = new.ordem_servico_id and oficina_id = new.oficina_id;

  if v_status = 'cancelada' then
    raise exception 'Esta ordem foi cancelada e não recebe mais fotos.'
      using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('os_fotos:' || new.oficina_id::text));

  select count(*) into v_na_ordem
  from public.os_fotos
  where ordem_servico_id = new.ordem_servico_id
    and public.foto_conta(enviada, criado_em);

  if v_na_ordem >= 5 then
    raise exception 'Esta ordem já tem 5 fotos. Apague uma para colocar outra.'
      using errcode = 'check_violation';
  end if;

  v_limite := public.limite_de_fotos(new.oficina_id);
  if v_limite is not null then
    v_em_uso := public.fotos_em_uso(new.oficina_id);
    if v_em_uso >= v_limite then
      select p.nome into v_plano
      from public.oficinas o join public.planos p on p.id = o.plano
      where o.id = new.oficina_id;
      -- O hint é o que o app reconhece para mostrar o convite ao plano maior.
      raise exception 'O plano % guarda até % fotos de cada vez, e a oficina chegou nesse limite.',
        coalesce(v_plano, 'atual'), v_limite
        using errcode = 'check_violation', hint = 'limite_de_fotos_do_plano';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists os_fotos_conferir_nova on public.os_fotos;
create trigger os_fotos_conferir_nova
  before insert on public.os_fotos
  for each row execute function public.conferir_foto_nova();

-- Depois de criada, a foto só muda numa coisa: o envio terminou. Data, autor,
-- momento e caminho são o que dá valor de prova a ela.
create or replace function public.foto_so_marca_envio()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.oficina_id is distinct from old.oficina_id
     or new.ordem_servico_id is distinct from old.ordem_servico_id
     or new.momento is distinct from old.momento
     or new.caminho is distinct from old.caminho
     or new.criado_por is distinct from old.criado_por
     or new.criado_em is distinct from old.criado_em then
    raise exception 'A foto não pode ser alterada depois de registrada.'
      using errcode = 'check_violation';
  end if;
  if old.enviada and not new.enviada then
    raise exception 'A foto não pode ser alterada depois de registrada.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists os_fotos_so_marca_envio on public.os_fotos;
create trigger os_fotos_so_marca_envio
  before update on public.os_fotos
  for each row execute function public.foto_so_marca_envio();

alter table public.os_fotos enable row level security;

drop policy if exists "atendimento le as fotos da oficina" on public.os_fotos;
create policy "atendimento le as fotos da oficina"
  on public.os_fotos for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_atendimento()
    and public.foto_conta(enviada, criado_em)
    and not public.foto_vencida(ordem_servico_id)
  );

drop policy if exists "mecanico le as fotos das proprias ordens" on public.os_fotos;
create policy "mecanico le as fotos das proprias ordens"
  on public.os_fotos for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and public.ordem_e_do_mecanico(ordem_servico_id)
    and public.foto_conta(enviada, criado_em)
    and not public.foto_vencida(ordem_servico_id)
  );

-- O mecânico fotografa na bancada: é ele quem vê o defeito. Mas só nas dele.
drop policy if exists "equipe registra foto" on public.os_fotos;
create policy "equipe registra foto"
  on public.os_fotos for insert to authenticated
  with check (
    oficina_id = public.oficina_do_usuario()
    and criado_por = auth.uid()
    and (
      public.eh_atendimento()
      or (public.eh_mecanico() and public.ordem_e_do_mecanico(ordem_servico_id))
    )
  );

drop policy if exists "quem enviou marca o envio" on public.os_fotos;
create policy "quem enviou marca o envio"
  on public.os_fotos for update to authenticated
  using (oficina_id = public.oficina_do_usuario() and criado_por = auth.uid())
  with check (oficina_id = public.oficina_do_usuario() and criado_por = auth.uid());

-- Apagar uma foto é do dono. A exceção é o envio que falhou: quem tentou
-- desfaz a própria linha, para a vaga não ficar presa.
drop policy if exists "dono apaga foto" on public.os_fotos;
create policy "dono apaga foto"
  on public.os_fotos for delete to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and (public.eh_admin() or (criado_por = auth.uid() and not enviada))
  );

drop trigger if exists os_fotos_exigir_oficina_ativa on public.os_fotos;
create trigger os_fotos_exigir_oficina_ativa
  before insert or update or delete on public.os_fotos
  for each row execute function public.exigir_oficina_ativa();

-- O arquivo ------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-os', 'fotos-os', false, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg'];

-- Ler: quem enxerga a linha enxerga o arquivo. O RLS de os_fotos roda dentro
-- desta consulta, então o mecânico, a foto vencida e a outra oficina ficam de
-- fora sem regra repetida aqui.
drop policy if exists "le foto de os que enxerga" on storage.objects;
create policy "le foto de os que enxerga"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'fotos-os'
    and exists (select 1 from public.os_fotos f where f.caminho = storage.objects.name)
  );

-- Gravar: só no caminho de uma linha que a própria pessoa acabou de criar e
-- que ainda espera o arquivo. Os limites já foram conferidos na linha.
drop policy if exists "grava foto reservada" on storage.objects;
create policy "grava foto reservada"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fotos-os'
    and exists (
      select 1 from public.os_fotos f
      where f.caminho = storage.objects.name
        and f.criado_por = auth.uid()
        and not f.enviada
    )
  );

-- Apagar: o dono, dentro da própria oficina; ou quem desfaz o próprio envio.
drop policy if exists "apaga foto da oficina" on storage.objects;
create policy "apaga foto da oficina"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'fotos-os'
    and (storage.foldername(name))[1] = public.oficina_do_usuario()::text
    and (
      public.eh_admin()
      or exists (
        select 1 from public.os_fotos f
        where f.caminho = storage.objects.name
          and f.criado_por = auth.uid()
          and not f.enviada
      )
    )
  );

-- A vistoria de entrada -----------------------------------------------------
create table if not exists public.os_vistorias (
  ordem_servico_id uuid primary key,
  oficina_id uuid not null default public.oficina_do_usuario()
    references public.oficinas (id) on delete cascade,
  -- { "riscos": "avaria", "retrovisores": "ok", ... } — as chaves são as da
  -- tela (src/funcionalidades/ordens/vistoria.ts). Guardado assim para a lista
  -- de itens poder crescer sem migração.
  itens jsonb not null default '{}'::jsonb check (jsonb_typeof(itens) = 'object'),
  combustivel text check (combustivel in ('reserva', '1/4', '1/2', '3/4', 'cheio')),
  pertences text,
  observacoes text,
  feita_por uuid default auth.uid(),
  feita_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint os_vistorias_os_fk
    foreign key (ordem_servico_id, oficina_id)
    references public.ordens_servico (id, oficina_id) on delete cascade,
  constraint os_vistorias_autor_fk
    foreign key (feita_por, oficina_id)
    references public.usuarios (id, oficina_id) on delete set null (feita_por)
);

comment on table public.os_vistorias is
  'Como a moto chegou. Opcional, uma por OS, editável até a entrega.';

drop trigger if exists os_vistorias_atualizado_em on public.os_vistorias;
create trigger os_vistorias_atualizado_em
  before update on public.os_vistorias
  for each row execute function public.marcar_atualizacao();

-- Depois que a moto saiu, a vistoria de quando ela entrou não muda mais.
create or replace function public.vistoria_so_com_moto_na_oficina()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.status_os;
begin
  select status into v_status
  from public.ordens_servico
  where id = coalesce(new.ordem_servico_id, old.ordem_servico_id);

  if v_status in ('entregue', 'cancelada') then
    raise exception 'A ordem já foi encerrada, e a vistoria de entrada não muda mais.'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists os_vistorias_so_com_moto_na_oficina on public.os_vistorias;
create trigger os_vistorias_so_com_moto_na_oficina
  before insert or update on public.os_vistorias
  for each row execute function public.vistoria_so_com_moto_na_oficina();

alter table public.os_vistorias enable row level security;

drop policy if exists "atendimento cuida da vistoria" on public.os_vistorias;
create policy "atendimento cuida da vistoria"
  on public.os_vistorias for all to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_atendimento())
  with check (oficina_id = public.oficina_do_usuario() and public.eh_atendimento());

drop policy if exists "mecanico le a vistoria das proprias ordens" on public.os_vistorias;
create policy "mecanico le a vistoria das proprias ordens"
  on public.os_vistorias for select to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and public.ordem_e_do_mecanico(ordem_servico_id)
  );

drop policy if exists "mecanico faz a vistoria das proprias ordens" on public.os_vistorias;
create policy "mecanico faz a vistoria das proprias ordens"
  on public.os_vistorias for insert to authenticated
  with check (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and public.ordem_e_do_mecanico(ordem_servico_id)
  );

drop policy if exists "mecanico ajusta a vistoria das proprias ordens" on public.os_vistorias;
create policy "mecanico ajusta a vistoria das proprias ordens"
  on public.os_vistorias for update to authenticated
  using (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and public.ordem_e_do_mecanico(ordem_servico_id)
  )
  with check (
    oficina_id = public.oficina_do_usuario()
    and public.eh_mecanico()
    and public.ordem_e_do_mecanico(ordem_servico_id)
  );

drop trigger if exists os_vistorias_exigir_oficina_ativa on public.os_vistorias;
create trigger os_vistorias_exigir_oficina_ativa
  before insert or update or delete on public.os_vistorias
  for each row execute function public.exigir_oficina_ativa();

-- Para a plataforma ---------------------------------------------------------
-- Quanto cada oficina usa, para o aviso amarelo e vermelho do painel.
create or replace function public.plataforma_uso_de_fotos()
returns table (oficina_id uuid, em_uso integer, limite integer)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, public.fotos_em_uso(o.id), public.limite_de_fotos(o.id)
  from public.oficinas o;
$$;

-- O que já pode sair: foto vencida, e envio que falhou há mais de um dia. A
-- função `plataforma` apaga o arquivo no Storage e depois a linha.
create or replace function public.plataforma_fotos_para_apagar(p_quantas integer default 500)
returns table (id uuid, caminho text)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.caminho
  from public.os_fotos f
  where public.foto_vencida(f.ordem_servico_id)
     or (not f.enviada and f.criado_em < now() - interval '1 day')
  order by f.criado_em
  limit greatest(p_quantas, 0);
$$;

-- Permissões -------------------------------------------------------------------
-- O Supabase dá EXECUTE a authenticated por conta própria (ver 0070): revogar
-- só de public não fecha nada.
revoke all on function public.limite_de_fotos(uuid) from public, anon, authenticated;
revoke all on function public.fotos_da_os_valem_ate(uuid) from public, anon;
revoke all on function public.foto_vencida(uuid) from public, anon;
revoke all on function public.fotos_em_uso(uuid) from public, anon, authenticated;
revoke all on function public.minhas_fotos_em_uso() from public, anon;
revoke all on function public.conferir_foto_nova() from public, anon, authenticated;
revoke all on function public.vistoria_so_com_moto_na_oficina() from public, anon, authenticated;
revoke all on function public.plataforma_uso_de_fotos() from public, anon, authenticated;
revoke all on function public.plataforma_fotos_para_apagar(integer) from public, anon, authenticated;

-- As políticas chamam estas como quem está logado.
grant execute on function public.fotos_da_os_valem_ate(uuid) to authenticated;
grant execute on function public.foto_vencida(uuid) to authenticated;
grant execute on function public.minhas_fotos_em_uso() to authenticated;

grant select, insert, update, delete on public.os_fotos to authenticated;
grant select, insert, update, delete on public.os_vistorias to authenticated;

select public.conferir_fechadura();
