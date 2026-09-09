-- 0049 — Os primeiros dez minutos da oficina
--
-- Duas coisas para quem acabou de entrar e está olhando telas vazias:
--
--   1. Uma lista curta do que fazer primeiro.
--   2. Um catálogo de exemplo, para a pessoa ver o sistema funcionando antes
--      de digitar qualquer coisa.
--
-- O progresso NÃO é guardado. Ele é derivado do que existe: tem serviço
-- cadastrado? tem produto? já fez um orçamento? Pela mesma razão da situação
-- da oficina — estado guardado é estado que um dia discorda da realidade, e
-- aqui o custo seria a lista dizendo "falta cadastrar serviço" para quem já
-- tem trinta.
--
-- O que se guarda é só a decisão de esconder a lista, que é preferência e não
-- pode ser calculada.

alter table public.oficinas
  add column if not exists primeiros_passos_ocultos boolean not null default false;

comment on column public.oficinas.primeiros_passos_ocultos is
  'A oficina dispensou a lista de primeiros passos. Preferência, não progresso.';

-- Exemplos --------------------------------------------------------------------
-- A marca fica na linha, e não numa lista de nomes no código: renomear um
-- produto de exemplo não pode fazer o botão de apagar perdê-lo de vista.
alter table public.produtos
  add column if not exists de_exemplo boolean not null default false;
alter table public.servicos
  add column if not exists de_exemplo boolean not null default false;

comment on column public.produtos.de_exemplo is
  'Veio do botão "carregar exemplos". Some junto quando a oficina limpa.';

create or replace function public.primeiros_passos()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'dados_da_oficina', (
      select o.telefone is not null and o.endereco is not null and o.cidade is not null
      from public.oficinas o where o.id = public.oficina_do_usuario()
    ),
    'logo', (
      select o.logo_miniatura_url is not null
      from public.oficinas o where o.id = public.oficina_do_usuario()
    ),
    -- Exemplo não conta como passo cumprido: quem carregou o catálogo pronto
    -- ainda não aprendeu a cadastrar o serviço dele, que é o ponto do passo.
    'primeiro_servico', exists (
      select 1 from public.servicos s
      where s.oficina_id = public.oficina_do_usuario() and not s.de_exemplo
    ),
    'primeiro_produto', exists (
      select 1 from public.produtos p
      where p.oficina_id = public.oficina_do_usuario() and not p.de_exemplo
    ),
    'primeiro_orcamento', exists (
      select 1 from public.orcamentos o
      where o.oficina_id = public.oficina_do_usuario()
    ),
    'ocultos', (
      select o.primeiros_passos_ocultos
      from public.oficinas o where o.id = public.oficina_do_usuario()
    )
  );
$$;

comment on function public.primeiros_passos is
  'O que já foi feito, calculado do que existe. Nada aqui é guardado.';

-- Carregar exemplos -------------------------------------------------------------
-- Serviços e peças que qualquer oficina de moto do Brasil reconhece. Os preços
-- são referência para a pessoa ver o formato e trocar pelo dela — não é tabela
-- de mercado, e a tela diz isso.
create or replace function public.carregar_exemplos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oficina uuid;
  v_servicos integer;
  v_produtos integer;
begin
  v_oficina := public.oficina_do_usuario();
  if v_oficina is null or not public.eh_admin() then
    raise exception 'Só o responsável pela oficina carrega os exemplos.'
      using errcode = 'insufficient_privilege';
  end if;
  if not public.oficina_pode_escrever() then
    raise exception 'A oficina está sem permissão para registrar agora.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.servicos (oficina_id, nome, descricao, preco, tempo_estimado_minutos, de_exemplo)
  select v_oficina, nome, descricao, preco, minutos, true
  from (values
    ('Troca de óleo',              'Óleo e filtro, com descarte do usado.',        90.00,  30),
    ('Revisão simples',            'Freios, corrente, pneus, luzes e fluidos.',   150.00,  60),
    ('Troca de pastilha de freio', 'Dianteira ou traseira, mão de obra.',          70.00,  40),
    ('Regulagem de corrente',      'Tensão, alinhamento e lubrificação.',          40.00,  20),
    ('Troca de pneu',              'Desmontagem, montagem e balanceamento.',       60.00,  40),
    ('Limpeza de carburador',      'Desmontagem, limpeza e regulagem.',           180.00, 120),
    ('Troca de vela',              'Retirada, limpeza do alojamento e troca.',     35.00,  20),
    ('Troca de kit relação',       'Coroa, pinhão e corrente. Mão de obra.',      120.00,  90)
  ) as t(nome, descricao, preco, minutos)
  where not exists (
    select 1 from public.servicos s
    where s.oficina_id = v_oficina and s.de_exemplo and s.nome = t.nome
  );
  get diagnostics v_servicos = row_count;

  insert into public.produtos (oficina_id, nome, unidade, preco_custo, preco_venda, estoque_minimo, de_exemplo)
  select v_oficina, nome, unidade, custo, venda, minimo, true
  from (values
    ('Óleo 20W50 mineral 1L',       'un', 22.00,  38.00, 4),
    ('Óleo 10W30 semissintético 1L','un', 28.00,  48.00, 4),
    ('Filtro de óleo',              'un', 12.00,  28.00, 3),
    ('Vela de ignição',             'un',  9.00,  22.00, 4),
    ('Pastilha de freio dianteira', 'par',28.00,  65.00, 2),
    ('Lona de freio traseira',      'par',24.00,  55.00, 2),
    ('Corrente 428H 118 elos',      'un', 55.00, 110.00, 1),
    ('Coroa 428 - 43 dentes',       'un', 38.00,  85.00, 1),
    ('Pinhão 428 - 15 dentes',      'un', 18.00,  40.00, 1),
    ('Câmara de ar 90/90-18',       'un', 16.00,  35.00, 2),
    ('Cabo de embreagem',           'un', 14.00,  32.00, 2),
    ('Lâmpada do farol H4',         'un', 11.00,  26.00, 3)
  ) as t(nome, unidade, custo, venda, minimo)
  where not exists (
    select 1 from public.produtos p
    where p.oficina_id = v_oficina and p.de_exemplo and p.nome = t.nome
  );
  get diagnostics v_produtos = row_count;

  return jsonb_build_object('servicos', v_servicos, 'produtos', v_produtos);
end;
$$;

comment on function public.carregar_exemplos is
  'Catálogo de referência para a oficina ver o sistema andando. Some inteiro no botão de limpar.';

-- Apagar exemplos ----------------------------------------------------------------
-- O que já foi usado num orçamento ou numa ordem NÃO é apagado: naquele momento
-- deixou de ser exemplo e virou histórico de um atendimento real. Some o resto,
-- e a tela diz quantos ficaram e por quê.
create or replace function public.apagar_exemplos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oficina uuid;
  v_servicos integer := 0;
  v_produtos integer := 0;
  v_mantidos integer := 0;
begin
  v_oficina := public.oficina_do_usuario();
  if v_oficina is null or not public.eh_admin() then
    raise exception 'Só o responsável pela oficina apaga os exemplos.'
      using errcode = 'insufficient_privilege';
  end if;
  if not public.oficina_pode_escrever() then
    raise exception 'A oficina está sem permissão para registrar agora.'
      using errcode = 'insufficient_privilege';
  end if;

  with usados as (
    select servico_id as id from public.orcamento_itens where oficina_id = v_oficina and servico_id is not null
    union
    select servico_id from public.os_itens where oficina_id = v_oficina and servico_id is not null
  ), apagados as (
    delete from public.servicos s
    where s.oficina_id = v_oficina and s.de_exemplo
      and not exists (select 1 from usados u where u.id = s.id)
    returning 1
  )
  select count(*) into v_servicos from apagados;

  with usados as (
    select produto_id as id from public.orcamento_itens where oficina_id = v_oficina and produto_id is not null
    union
    select produto_id from public.os_itens where oficina_id = v_oficina and produto_id is not null
    union
    select produto_id from public.movimentacoes_estoque where oficina_id = v_oficina
  ), apagados as (
    delete from public.produtos p
    where p.oficina_id = v_oficina and p.de_exemplo
      and not exists (select 1 from usados u where u.id = p.id)
    returning 1
  )
  select count(*) into v_produtos from apagados;

  select count(*) into v_mantidos from (
    select 1 from public.servicos where oficina_id = v_oficina and de_exemplo
    union all
    select 1 from public.produtos where oficina_id = v_oficina and de_exemplo
  ) t;

  return jsonb_build_object(
    'servicos', v_servicos,
    'produtos', v_produtos,
    'mantidos_por_uso', v_mantidos
  );
end;
$$;

select public.conferir_fechadura();
