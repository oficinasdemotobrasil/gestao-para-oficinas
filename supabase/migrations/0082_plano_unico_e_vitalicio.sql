-- 0082 — Um plano só, quatro jeitos de pagar, e 30 vagas vitalícias
--
-- Decisão do negócio (05/10/2026): sai o plano Essencial (R$ 29,99) e fica um
-- plano só, com tudo. O que muda é o período:
--
--   mensal      R$  49,90                (renova sozinho)
--   trimestral  R$ 134,70  = 44,90/mês   (renova sozinho)
--   anual       R$ 478,80  = 39,90/mês   (à vista renova sozinho; ou em até
--                                         12x no cartão, juros do cliente)
--   vitalício   R$ 2.000,00              (pagamento único, até 12x; 30 vagas)
--
-- Nesta migração fica a parte do banco. A cobrança (funções `assinatura` e
-- `asaas-webhook`) e as telas vêm depois, e só leem o que está aqui: o preço
-- não fica escrito em código nenhum, para mudar preço ser trocar um número.
--
-- O que NÃO muda: o teste de 7 dias (plano 'gratuito'), o acesso de quem já
-- está dentro, e o histórico — o Essencial sai de venda, mas a linha fica,
-- porque assinaturas antigas apontam para ela.

-- Os preços por período --------------------------------------------------------
create table if not exists public.precos (
  periodo text primary key
    check (periodo in ('mensal', 'trimestral', 'anual', 'vitalicio')),
  plano public.plano_oficina not null default 'completo' references public.planos (id),
  valor numeric(12, 2) not null check (valor > 0),
  -- Quantos meses de acesso o pagamento compra. Nulo é para sempre.
  meses integer check (meses is null or meses > 0),
  -- Até quantas vezes dá para parcelar no cartão. 1 é só à vista.
  parcelas_max integer not null default 1 check (parcelas_max between 1 and 12),
  ordem integer not null,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

comment on table public.precos is
  'O que cada período custa. Mudar preço é mudar aqui; quem já assinou guarda o valor dele em assinaturas.valor.';

insert into public.precos (periodo, valor, meses, parcelas_max, ordem) values
  ('mensal',      49.90,    1,  1, 1),
  ('trimestral', 134.70,    3,  1, 2),
  ('anual',      478.80,   12, 12, 3),
  ('vitalicio', 2000.00, null, 12, 4)
on conflict (periodo) do nothing;

drop trigger if exists precos_atualizado_em on public.precos;
create trigger precos_atualizado_em
  before update on public.precos
  for each row execute function public.marcar_atualizacao();

-- Preço é público: a página de vendas mostra para quem nem tem conta.
alter table public.precos enable row level security;
drop policy if exists "precos sao publicos" on public.precos;
create policy "precos sao publicos"
  on public.precos for select to anon, authenticated
  using (true);
grant select on public.precos to anon, authenticated;

-- A fechadura (0042) passa a conhecer a tabela de preços: ela é catálogo,
-- igual à de planos, e não pertence a oficina nenhuma; a de taxas do cartão
-- também. Copiada da 0042; a única mudança são as duas na lista.
create or replace function public.conferir_fechadura()
returns void
language plpgsql
as $$
declare
  pendentes text;
  fora_do_tenant text[] := array['oficinas', 'admins_plataforma', 'planos', 'precos', 'taxas_cartao'];
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
  where n.nspname = 'public' and c.relkind = 'r'
    and not (c.relname = any(fora_do_tenant))
    and not exists (
      select 1 from pg_attribute a
      where a.attrelid = c.oid and a.attname = 'oficina_id' and not a.attisdropped
    );
  if pendentes is not null then
    raise exception 'Tabelas sem coluna oficina_id: %', pendentes;
  end if;
end;
$$;

-- O parcelamento no cartão, com a taxa por conta de quem parcela ------------------
--
-- Decisão do negócio: o anual e o vitalício podem ser pagos em até 12x, e a
-- taxa do parcelamento é do cliente. O provedor não calcula isso sozinho — a
-- taxa dele sai do valor da oficina —, então a conta é feita aqui: o total
-- cobrado é o que faz sobrar, depois da taxa, exatamente o preço.
--
--   total = (preço + fixo) / (1 - percentual)
--
-- As taxas são as NORMAIS da conta no provedor (2,99% / 3,49% / 3,99% +
-- R$ 0,49), e não as promocionais de 3 meses: assim o preço que o cliente vê
-- não muda quando a promoção acaba. Considera receber mês a mês, sem
-- antecipação; antecipar é mudar o percentual aqui.
--
-- À vista (1x) não repassa nada: o preço anunciado é o preço pago.
create table if not exists public.taxas_cartao (
  parcelas_de integer primary key check (parcelas_de between 1 and 12),
  parcelas_ate integer not null check (parcelas_ate between 1 and 12),
  percentual numeric(5, 2) not null check (percentual >= 0 and percentual < 100),
  fixo numeric(8, 2) not null default 0 check (fixo >= 0),
  check (parcelas_ate >= parcelas_de)
);

insert into public.taxas_cartao (parcelas_de, parcelas_ate, percentual, fixo) values
  (2, 6, 3.49, 0.49),
  (7, 12, 3.99, 0.49)
on conflict (parcelas_de) do nothing;

alter table public.taxas_cartao enable row level security;
drop policy if exists "taxas sao publicas" on public.taxas_cartao;
create policy "taxas sao publicas"
  on public.taxas_cartao for select to anon, authenticated
  using (true);
grant select on public.taxas_cartao to anon, authenticated;

/*
 * Quanto se cobra para o preço chegar inteiro, em N parcelas.
 * Sem faixa de taxa para N (1x, por exemplo), o total é o próprio preço.
 */
create or replace function public.valor_parcelado(p_valor numeric, p_parcelas integer)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select round((p_valor + t.fixo) / (1 - t.percentual / 100), 2)
       from public.taxas_cartao t
      where p_parcelas between t.parcelas_de and t.parcelas_ate),
    p_valor
  );
$$;

/*
 * As opções de parcelamento de um período, prontas para a tela: "12x de
 * R$ 41,60 (total R$ 499,21)". A tela não calcula nada; o servidor cobra
 * pelo mesmo número.
 */
create or replace function public.simular_parcelas(p_periodo text)
returns table (parcelas integer, total numeric, valor_parcela numeric)
language sql
stable
security definer
set search_path = public
as $$
  select n, public.valor_parcelado(p.valor, n), round(public.valor_parcelado(p.valor, n) / n, 2)
  from public.precos p, generate_series(1, p.parcelas_max) n
  where p.periodo = p_periodo and p.ativo
  order by n;
$$;

-- Um plano só ----------------------------------------------------------------------
-- O mensal do plano acompanha a tabela de preços: é o número que as telas
-- antigas e o painel usam como referência.
update public.planos set preco_mensal = 49.90 where id = 'completo';
update public.planos set ativo = false where id = 'essencial';

-- A assinatura guarda o período e o valor que contratou ------------------------------
--
-- O valor fica aqui, e não só na tabela de preços, porque é ele que trava o
-- preço de quem assinou: se o preço subir, a assinatura antiga continua com o
-- dela. É a promessa de "preço de fundador" escrita no banco.
alter table public.assinaturas
  add column if not exists periodo text not null default 'mensal'
    check (periodo in ('mensal', 'trimestral', 'anual')),
  add column if not exists valor numeric(12, 2) check (valor is null or valor > 0),
  add column if not exists parcelas integer not null default 1
    check (parcelas between 1 and 12),
  -- O anual parcelado não é assinatura no provedor (ele não parcela cobrança
  -- recorrente): é uma cobrança parcelada, e o id dela fica aqui.
  add column if not exists id_externo_parcelamento text;

update public.assinaturas a
   set valor = p.preco_mensal
  from public.planos p
 where p.id = a.plano and a.valor is null and p.preco_mensal > 0;

comment on column public.assinaturas.valor is
  'O valor contratado, no período da assinatura. Não muda quando o preço muda.';

/*
 * Assinatura sem valor ganha o preço do período na hora de nascer.
 *
 * A função de cobrança passa a mandar o valor (próximo passo), mas não pode
 * existir janela em que uma assinatura nova entre com valor vazio — ela
 * contaria zero na receita do painel, sem erro nenhum. Com isto, a ordem de
 * publicação deixa de importar.
 */
create or replace function public.assinatura_com_valor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.valor is null then
    select valor into new.valor from public.precos where periodo = new.periodo;
  end if;
  return new;
end;
$$;

drop trigger if exists assinaturas_com_valor on public.assinaturas;
create trigger assinaturas_com_valor
  before insert on public.assinaturas
  for each row execute function public.assinatura_com_valor();

/*
 * Até quando o acesso vale depois de um pagamento. Antes, era "30 dias depois
 * do vencimento", escrito em código em dois lugares (o aviso do provedor e o
 * reprocessar do painel). Com os períodos, a conta depende da assinatura — e
 * fica aqui, num lugar só, onde dá para provar com teste:
 *
 *   recorrente (mensal, trimestral, anual à vista): o vencimento pago + os
 *     meses do período. Contado do vencimento, e não de hoje: quem paga com
 *     três dias de atraso não perde três dias.
 *   anual parcelado: o início da assinatura + 12 meses. Cada parcela chega
 *     como um pagamento, com vencimentos de meses diferentes; contar de cada
 *     uma faria a 12ª parcela estender o acesso para quase dois anos.
 *
 * Sem assinatura ativa (cobrança avulsa antiga), vale um mês, como antes.
 */
create or replace function public.acesso_depois_do_pagamento(p_oficina uuid, p_vencimento date)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case
              when a.parcelas > 1
                then (a.inicio + make_interval(months => coalesce(pr.meses, 12)))::date
              else (p_vencimento + make_interval(months => coalesce(pr.meses, 1)))::date
            end
       from public.assinaturas a
       left join public.precos pr on pr.periodo = a.periodo
      where a.oficina_id = p_oficina and a.situacao = 'ativa'
      order by a.criado_em desc
      limit 1),
    (p_vencimento + interval '1 month')::date
  );
$$;

/*
 * Quanto a assinatura vale por mês — para somar receita sem que um anual pago
 * num mês pareça 478 reais de mensalidade. Sem valor (assinatura antiga sem o
 * campo preenchido), conta zero em vez de inventar.
 */
create or replace function public.valor_mensal_da_assinatura(p_periodo text, p_valor numeric)
returns numeric
language sql
immutable
as $$
  select round(coalesce(p_valor, 0) / case p_periodo
    when 'trimestral' then 3
    when 'anual' then 12
    else 1
  end, 2);
$$;

-- As vagas vitalícias --------------------------------------------------------------
create table if not exists public.vitalicios (
  id uuid primary key default gen_random_uuid(),
  -- Nulo enquanto quem comprou ainda não tem oficina no GIRO: venda feita
  -- fora do app, que a plataforma liga à oficina quando ela se cadastrar.
  oficina_id uuid unique references public.oficinas (id) on delete set null,
  comprador text not null check (length(trim(comprador)) >= 2),
  email text,
  valor numeric(12, 2) not null check (valor >= 0),
  origem text not null check (origem in ('fora_do_app', 'app')),
  -- 'reservada' é a compra em andamento no app: segura a vaga enquanto o PIX
  -- não cai. Expira sozinha em `reservada_ate`. 'estornar' é dinheiro que
  -- entrou e não deveria (oficina que já era vitalícia pagou de novo): fica
  -- registrado para a plataforma devolver, sem ocupar vaga.
  situacao text not null default 'paga' check (situacao in ('reservada', 'paga', 'estornar')),
  reservada_ate timestamptz,
  id_externo_cobranca text unique,
  observacao text,
  vendido_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  check (situacao <> 'reservada' or reservada_ate is not null)
);

comment on table public.vitalicios is
  'As 30 vagas vitalícias. Só a plataforma lê e escreve; a oficina pergunta pela função minha_oficina_e_vitalicia().';

create or replace function public.limite_de_vitalicios()
returns integer
language sql
immutable
as $$ select 30 $$;

/*
 * Quantas vagas estão ocupadas agora: as pagas e as reservadas que ainda não
 * expiraram. Reserva vencida devolve a vaga sem ninguém precisar apagar nada.
 */
create or replace function public.vitalicios_ocupados()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.vitalicios v
  where v.situacao = 'paga'
     or (v.situacao = 'reservada' and v.reservada_ate > now());
$$;

-- O número que a página de vendas mostra: "restam X vagas".
create or replace function public.vagas_vitalicias_restantes()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(public.limite_de_vitalicios() - public.vitalicios_ocupados(), 0);
$$;

/*
 * A trava das 30 vagas, no banco: dois cliques ao mesmo tempo na vaga 30 não
 * passam juntos (o bloqueio serializa), e nenhuma tela consegue vender a 31ª.
 *
 * A única exceção é o pagamento que JÁ caiu (registrar_vitalicio_pago): se a
 * reserva de um PIX venceu e as vagas acabaram antes de o dinheiro chegar, o
 * cliente pagou — a venda é registrada e marcada para a plataforma decidir,
 * em vez de o dinheiro ficar sem dono.
 */
create or replace function public.conferir_vaga_vitalicia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('vitalicios'));
  if coalesce(current_setting('app.vitalicio_ja_pago', true), '') = 'sim' then
    return new;
  end if;
  if public.vitalicios_ocupados() >= public.limite_de_vitalicios() then
    raise exception 'As % vagas vitalícias já foram vendidas.', public.limite_de_vitalicios()
      using errcode = 'check_violation', hint = 'vitalicios_esgotados';
  end if;
  return new;
end;
$$;

drop trigger if exists vitalicios_conferir_vaga on public.vitalicios;
create trigger vitalicios_conferir_vaga
  before insert on public.vitalicios
  for each row execute function public.conferir_vaga_vitalicia();

-- Ninguém do app lê nem escreve aqui: nome e e-mail de comprador são da
-- plataforma. A política explícita de "ninguém" é para a fechadura (0010)
-- distinguir isto de uma tabela esquecida sem regra — como em
-- sessoes_de_suporte (0073).
alter table public.vitalicios enable row level security;
drop policy if exists "ninguem do app alcanca os vitalicios" on public.vitalicios;
create policy "ninguem do app alcanca os vitalicios"
  on public.vitalicios for all to anon, authenticated
  using (false) with check (false);

/*
 * Liga uma vaga à oficina: acesso sem prazo, plano completo. Usada pela
 * plataforma para as vendas feitas fora do app (quando a oficina se cadastra)
 * e pelo pagamento confirmado das vendas feitas no app.
 *
 * Devolve o id da assinatura recorrente que a oficina tinha, se tinha: ela
 * precisa ser cancelada também no provedor, senão a oficina vitalícia continua
 * sendo cobrada todo mês. Quem chama (a função da plataforma) cancela lá.
 */
create or replace function public.vitalicio_na_oficina(p_vitalicio uuid, p_oficina uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assinatura text;
begin
  update public.vitalicios set oficina_id = p_oficina where id = p_vitalicio;
  if not found then
    raise exception 'Vaga vitalícia não encontrada.' using errcode = 'no_data_found';
  end if;

  update public.oficinas
     set acesso_ate = null,
         plano = 'completo',
         status = case when status = 'cancelada' then status else 'ativa' end
   where id = p_oficina;

  select id_externo_assinatura into v_assinatura
  from public.assinaturas
  where oficina_id = p_oficina and situacao = 'ativa'
  order by criado_em desc
  limit 1;

  perform public.encerrar_assinatura(p_oficina, 'virou vitalícia');
  return v_assinatura;
end;
$$;

-- A compra no app: a reserva da vaga enquanto o pagamento não cai.
--
-- Revisão da 0082 (Open Claude): oficina_id é único, e a reserva vencida
-- continuava na tabela — a oficina que deixasse o primeiro PIX vencer não
-- conseguia gerar outro, e se pagasse o novo ficava sem acesso. A reserva
-- anterior da mesma oficina sai antes da nova. Se o PIX antigo ainda for
-- pago, registrar_vitalicio_pago acha a oficina pela reserva nova.
create or replace function public.reservar_vitalicio(
  p_oficina uuid, p_comprador text, p_email text, p_cobranca text, p_horas integer default 72
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if exists (select 1 from public.vitalicios where oficina_id = p_oficina and situacao = 'paga') then
    raise exception 'Esta oficina já é vitalícia.'
      using errcode = 'unique_violation', hint = 'ja_e_vitalicia';
  end if;

  delete from public.vitalicios where oficina_id = p_oficina and situacao = 'reservada';

  insert into public.vitalicios
    (oficina_id, comprador, email, valor, origem, situacao, reservada_ate, id_externo_cobranca)
  select p_oficina, p_comprador, p_email, p.valor, 'app', 'reservada',
         now() + make_interval(hours => greatest(p_horas, 1)), p_cobranca
  from public.precos p where p.periodo = 'vitalicio'
  returning id into v_id;

  return v_id;
end;
$$;

/*
 * O pagamento do vitalício caiu (chamada pelo aviso do provedor, depois de
 * conferir lá). Revisão da 0082 (Open Claude), três casos a mais:
 *
 *   - o provedor avisa duas vezes (confirmado e recebido): a segunda não faz
 *     nada — antes, reescrevia a data da venda;
 *   - reserva VENCIDA paga depois de as 30 acabarem: entra, mas marcada para
 *     conferir — antes, virava a 31ª vaga sem aviso nenhum;
 *   - oficina que já é vitalícia pagou de novo (dois PIX): fica registrado
 *     para estornar, sem ocupar vaga.
 *
 * Sem reserva nenhuma (venceu e foi trocada, ou nunca houve), registra mesmo
 * assim — o dinheiro entrou — e anota para conferir se passou das 30.
 */
create or replace function public.registrar_vitalicio_pago(
  p_cobranca text, p_oficina uuid, p_comprador text, p_email text, p_valor numeric
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_situacao text;
  v_vencida boolean;
  v_acima boolean;
begin
  perform set_config('app.vitalicio_ja_pago', 'sim', true);
  perform pg_advisory_xact_lock(hashtext('vitalicios'));

  select id, situacao, coalesce(reservada_ate <= now(), false)
    into v_id, v_situacao, v_vencida
  from public.vitalicios where id_externo_cobranca = p_cobranca;

  if v_situacao in ('paga', 'estornar') then
    perform set_config('app.vitalicio_ja_pago', '', true);
    return null;
  end if;

  -- Cobrança fora da tabela: a oficina pode ter reservado de novo com outro PIX.
  if v_id is null and p_oficina is not null then
    select id, situacao, coalesce(reservada_ate <= now(), false)
      into v_id, v_situacao, v_vencida
    from public.vitalicios where oficina_id = p_oficina;

    if v_situacao = 'paga' then
      insert into public.vitalicios
        (oficina_id, comprador, email, valor, origem, situacao, id_externo_cobranca, observacao)
      values (null, p_comprador, p_email, p_valor, 'app', 'estornar', p_cobranca,
              'pagou de novo uma oficina que já é vitalícia — estornar');
      perform set_config('app.vitalicio_ja_pago', '', true);
      return null;
    end if;
  end if;

  -- Reserva vencida não ocupa vaga: se as 30 acabaram nesse meio-tempo, esta é a 31ª.
  v_acima := (v_id is null or v_vencida)
             and public.vitalicios_ocupados() >= public.limite_de_vitalicios();

  if v_id is null then
    insert into public.vitalicios
      (oficina_id, comprador, email, valor, origem, situacao, id_externo_cobranca, observacao)
    values
      (p_oficina, p_comprador, p_email, p_valor, 'app', 'paga', p_cobranca,
       case when v_acima then 'paga depois de esgotar as vagas — conferir' end)
    returning id into v_id;
  else
    update public.vitalicios
       set situacao = 'paga', reservada_ate = null, valor = p_valor, vendido_em = now(),
           id_externo_cobranca = p_cobranca,
           observacao = case when v_acima then 'paga depois de esgotar as vagas — conferir' else observacao end
     where id = v_id;
  end if;

  perform set_config('app.vitalicio_ja_pago', '', true);
  return public.vitalicio_na_oficina(v_id, p_oficina);
end;
$$;

/*
 * O registro de pagamento (0050), copiado por programa, com uma trava a mais:
 * oficina vitalícia não volta a ter prazo.
 */
create or replace function public.registrar_pagamento(
  p_oficina uuid,
  p_acesso_ate date,
  p_plano public.plano_oficina default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 0082: oficina vitalícia não tem prazo, e pagamento nenhum devolve um. Um
  -- pagamento atrasado da assinatura mensal que ela tinha antes de virar
  -- vitalícia chegaria aqui e escreveria uma data — o acesso para sempre
  -- viraria acesso até o mês que vem.
  if exists (
    select 1 from public.vitalicios v where v.oficina_id = p_oficina and v.situacao = 'paga'
  ) then
    return;
  end if;

  update public.oficinas
    set acesso_ate = p_acesso_ate,
        plano = coalesce(p_plano, plano),
        -- Um pagamento reabre uma conta bloqueada, mas não ressuscita uma que
        -- foi suspensa ou encerrada à mão: essas são decisão de gente.
        status = case when status in ('suspensa', 'cancelada') then status else 'ativa' end
  where id = p_oficina;

  update public.assinaturas
    set proxima_cobranca = p_acesso_ate,
        situacao = 'ativa',
        atualizado_em = now()
  where oficina_id = p_oficina and situacao = 'ativa';
end;
$$;

-- Para a tela da oficina: "seu acesso é vitalício".
create or replace function public.minha_oficina_e_vitalicia()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.vitalicios v
    where v.oficina_id = public.oficina_do_usuario() and v.situacao = 'paga'
  );
$$;

-- A receita do painel, por mês ----------------------------------------------------
-- As duas funções abaixo são as mesmas da 0078 (painel) e da 0046
-- (indicadores), copiadas por programa: a única diferença são as somas de
-- receita, que passam a usar o valor contratado dividido pelo período.

create or replace function public.plataforma_painel()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  mes as (select date_trunc('month', now()) as inicio),

  situacoes as (
    select o.id, o.nome, o.cidade, o.plano, o.criado_em, o.acesso_ate,
           o.teste_ate, o.exclusao_pedida_em,
           public.situacao_da_oficina(o.id) as situacao
    from public.oficinas o
  ),

  -- Cada cobrança contada uma vez, mesmo tendo gerado dois eventos.
  cobrancas as (
    select distinct on (e.conteudo -> 'payment' ->> 'id')
      e.conteudo -> 'payment' ->> 'id' as cobranca,
      (e.conteudo -> 'payment' ->> 'value')::numeric as valor,
      e.oficina_id,
      e.criado_em
    from public.eventos_asaas e
    where e.tipo in ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED')
      and e.conteudo -> 'payment' ->> 'id' is not null
    order by e.conteudo -> 'payment' ->> 'id', e.criado_em
  ),

  -- Quem tem contrato de verdade. É daqui que sai a receita, e não da lista
  -- de quem está com o acesso aberto.
  -- 0082: cada uma com o quanto vale POR MÊS — o anual dividido por 12, o
  -- trimestral por 3. Somar o valor cheio faria um anual pago num mês
  -- aparecer como 478 reais de receita mensal.
  assinantes as (
    select distinct on (a.oficina_id)
           a.oficina_id, a.plano, public.valor_mensal_da_assinatura(a.periodo, a.valor) as mensal
    from public.assinaturas a
    where a.situacao = 'ativa'
  ),

  ultimo_acesso as (
    select u.oficina_id, max(au.last_sign_in_at) as quando
    from public.usuarios u
    join auth.users au on au.id = u.id
    where u.ativo and not u.de_suporte
    group by u.oficina_id
  )

  select jsonb_build_object(
    'dinheiro', jsonb_build_object(
      -- Só quem paga de fato entra na recorrente.
      'receita_recorrente', coalesce((
        select sum(a.mensal)
        from assinantes a
        join public.planos p on p.id = a.plano
        join situacoes s on s.id = a.oficina_id
        where s.situacao = 'ativa'
      ), 0),
      -- O que está prestes a parar de entrar, se ninguém fizer nada: quem tem
      -- contrato e parou de pagar.
      'em_risco', coalesce((
        select sum(a.mensal)
        from assinantes a
        join public.planos p on p.id = a.plano
        join situacoes s on s.id = a.oficina_id
        where s.situacao in ('atrasada', 'bloqueada')
      ), 0),
      'recebido_no_mes', coalesce((
        select sum(c.valor) from cobrancas c, mes where c.criado_em >= mes.inicio
      ), 0),
      'ticket_medio', coalesce((
        select round(avg(a.mensal), 2)
        from assinantes a
        where a.mensal > 0
      ), 0),
      'por_plano', coalesce((
        select jsonb_agg(t order by t->>'ordem')
        from (
          select jsonb_build_object(
            'plano', p.nome, 'ordem', p.ordem,
            'oficinas', count(s.id),
            'receita', coalesce((
              select sum(a2.mensal)
              from assinantes a2
              where a2.plano = p.id
            ), 0)
          ) as t
          from public.planos p
          left join situacoes s on s.plano = p.id
          group by p.id, p.nome, p.ordem
        ) x
      ), '[]'::jsonb)
    ),

    'clientes', jsonb_build_object(
      'total', (select count(*) from situacoes),
      'por_situacao', coalesce((
        select jsonb_object_agg(situacao, quantas)
        from (select situacao, count(*) as quantas from situacoes group by situacao) t
      ), '{}'::jsonb),
      'novas_no_mes', (select count(*) from situacoes s, mes where s.criado_em >= mes.inicio),
      -- Dos que já passaram pelo teste, quantos viraram pagantes.
      'com_contrato', (select count(*) from assinantes),
      'ja_assinaram_alguma_vez', (
        select count(distinct a.oficina_id) from public.assinaturas a
      ),
      'cancelamentos_no_mes', (
        select count(*) from public.assinaturas a, mes
        where a.cancelada_em >= mes.inicio
      )
    ),

    -- O que a oficina disse ao sair. É a informação que diz o que consertar,
    -- e o provedor de pagamento não guarda nada disso.
    'cancelamentos', coalesce((
      select jsonb_agg(t order by t->>'quando' desc)
      from (
        select jsonb_build_object(
          'oficina', o.nome,
          'plano', p.nome,
          'quando', a.cancelada_em,
          'motivo', coalesce(a.motivo_cancelamento, 'não disse'),
          'durou_dias', greatest(0, (a.cancelada_em::date - a.inicio)::int)
        ) as t
        from public.assinaturas a
        join public.oficinas o on o.id = a.oficina_id
        join public.planos p on p.id = a.plano
        where a.cancelada_em is not null
        order by a.cancelada_em desc
        limit 20
      ) x
    ), '[]'::jsonb),

    'geografia', coalesce((
      select jsonb_agg(t order by (t->>'oficinas')::int desc)
      from (
        select jsonb_build_object(
          'cidade', coalesce(nullif(btrim(s.cidade), ''), 'sem cidade'),
          'oficinas', count(*),
          'pagantes', count(*) filter (where s.situacao = 'ativa')
        ) as t
        from situacoes s
        group by coalesce(nullif(btrim(s.cidade), ''), 'sem cidade')
      ) x
    ), '[]'::jsonb),

    -- A parte que vale mais: quem precisa de atenção HOJE, com o porquê.
    'atencao', coalesce((
      select jsonb_agg(t order by (t->>'urgencia')::int, t->>'oficina')
      from (
        select jsonb_build_object(
          'oficina', s.nome,
          'oficina_id', s.id,
          'urgencia', case
            when s.exclusao_pedida_em is not null then 1
            when s.situacao = 'bloqueada' then 2
            when s.situacao = 'atrasada' then 3
            when s.situacao = 'teste' and s.acesso_ate - current_date <= 3 then 4
            else 5
          end,
          'motivo', case
            when s.exclusao_pedida_em is not null then 'pediu para encerrar a conta'
            when s.situacao = 'bloqueada' then 'bloqueada por falta de pagamento'
            when s.situacao = 'atrasada' then 'pagamento em atraso, na carência'
            when s.situacao = 'teste' then 'teste terminando em ' || (s.acesso_ate - current_date) || ' dia(s)'
            else 'sem acesso há ' || extract(day from now() - ua.quando)::int || ' dias'
          end
        ) as t
        from situacoes s
        left join ultimo_acesso ua on ua.oficina_id = s.id
        where s.exclusao_pedida_em is not null
           or s.situacao in ('atrasada', 'bloqueada')
           or (s.situacao = 'teste' and s.acesso_ate - current_date <= 3)
           -- Sumiu: quem não entra há duas semanas costuma ser quem cancela.
           or (ua.quando is not null and ua.quando < now() - interval '14 days')
        limit 30
      ) x
    ), '[]'::jsonb)
  );
$$;

create or replace function public.plataforma_indicadores()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with situacoes as (
    select public.situacao_da_oficina(o.id) as situacao, o.plano
    from public.oficinas o
  ),
  mes as (select date_trunc('month', now()) as inicio)
  select jsonb_build_object(
    'total', (select count(*) from public.oficinas),
    'por_situacao', coalesce((
      select jsonb_object_agg(situacao, quantas)
      from (select situacao, count(*) as quantas from situacoes group by situacao) t
    ), '{}'::jsonb),
    -- Receita recorrente: só quem está pagando de fato. Teste, atraso e
    -- bloqueio não entram — contar promessa como receita é enganar a si mesmo.
    -- 0082: da assinatura em vigor, por mês. Antes somava o preço do plano de
    -- toda oficina ativa — cortesia e vitalício entravam como se pagassem
    -- todo mês.
    'receita_mensal', coalesce((
      select sum(public.valor_mensal_da_assinatura(a.periodo, a.valor))
      from public.assinaturas a
      where a.situacao = 'ativa'
        and public.situacao_da_oficina(a.oficina_id) = 'ativa'
    ), 0),
    'novas_no_mes', (select count(*) from public.oficinas o, mes where o.criado_em >= mes.inicio),
    'encerramentos_no_mes', (
      select count(*) from public.oficinas o, mes
      where o.exclusao_pedida_em >= mes.inicio
    ),
    'saindo', (select count(*) from public.oficinas o where o.excluir_em is not null)
  );
$$;
-- Permissões ---------------------------------------------------------------------
-- O Supabase dá EXECUTE a authenticated por conta própria (0070): revogar só
-- de public não fecha nada.
revoke all on function public.vitalicios_ocupados() from public, anon, authenticated;
revoke all on function public.assinatura_com_valor() from public, anon, authenticated;
revoke all on function public.registrar_pagamento(uuid, date, public.plano_oficina) from public, anon, authenticated;
revoke all on function public.acesso_depois_do_pagamento(uuid, date) from public, anon, authenticated;
revoke all on function public.valor_parcelado(numeric, integer) from public;
revoke all on function public.simular_parcelas(text) from public;
revoke all on function public.conferir_vaga_vitalicia() from public, anon, authenticated;
revoke all on function public.vitalicio_na_oficina(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reservar_vitalicio(uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.registrar_vitalicio_pago(text, uuid, text, text, numeric) from public, anon, authenticated;
revoke all on function public.plataforma_painel() from public, anon, authenticated;
revoke all on function public.plataforma_indicadores() from public, anon, authenticated;
revoke all on function public.minha_oficina_e_vitalicia() from public, anon;
revoke all on function public.vagas_vitalicias_restantes() from public;

grant execute on function public.minha_oficina_e_vitalicia() to authenticated;
-- A página de vendas mostra quantas vagas restam para quem nem entrou.
grant execute on function public.vagas_vitalicias_restantes() to anon, authenticated;
-- As opções de parcelamento também: a página de vendas mostra "12x de".
grant execute on function public.valor_parcelado(numeric, integer) to anon, authenticated;
grant execute on function public.simular_parcelas(text) to anon, authenticated;

select public.conferir_fechadura();
