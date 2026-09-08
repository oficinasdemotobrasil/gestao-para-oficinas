-- 0045 — Levar os dados embora, e encerrar a conta
--
-- Duas obrigações que andam juntas: a oficina pode sair, e sair com o que é
-- dela. Isso não é gentileza — é o que impede uma cobrança de virar refém, e é
-- o que a LGPD espera de quem guarda dado de terceiro.
--
-- A exportação funciona em QUALQUER situação, inclusive na conta encerrada. Ela
-- é o único caminho que continua enxergando depois que a leitura fecha.

alter table public.oficinas
  add column if not exists exclusao_pedida_em timestamptz,
  add column if not exists excluir_em timestamptz,
  add column if not exists motivo_da_saida text;

comment on column public.oficinas.excluir_em is
  'Quando a exclusão pode ser efetivada. Até lá o pedido é reversível.';
comment on column public.oficinas.motivo_da_saida is
  'Por que a oficina saiu. Informação comercial: é o que diz o que consertar.';

-- Exportar ---------------------------------------------------------------------
create or replace function public.exportar_dados_da_oficina()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_oficina uuid;
  v_perfil public.perfil_usuario;
begin
  -- Repare que isto NÃO usa oficina_do_usuario(): aquela função devolve nulo na
  -- conta encerrada, e é justamente na conta encerrada que exportar precisa
  -- funcionar. Aqui a pergunta é outra: "a que oficina esta pessoa pertence?",
  -- sem julgar a situação dela.
  select u.oficina_id, u.perfil into v_oficina, v_perfil
  from public.usuarios u
  where u.id = auth.uid() and u.ativo;

  if v_oficina is null then
    raise exception 'Faça login novamente.' using errcode = 'insufficient_privilege';
  end if;
  if v_perfil <> 'admin' then
    raise exception 'Só o responsável pela oficina exporta os dados.'
      using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'gerado_em', now(),
    'oficina', (
      select to_jsonb(o) - 'id'
      from public.oficinas o where o.id = v_oficina
    ),
    'equipe', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nome', u.nome, 'email', u.email, 'perfil', u.perfil, 'ativo', u.ativo,
        'criado_em', u.criado_em))
      from public.usuarios u where u.oficina_id = v_oficina
    ), '[]'::jsonb),
    'clientes', coalesce((select jsonb_agg(to_jsonb(c)) from public.clientes c where c.oficina_id = v_oficina), '[]'::jsonb),
    'motos', coalesce((select jsonb_agg(to_jsonb(m)) from public.motos m where m.oficina_id = v_oficina), '[]'::jsonb),
    'donos_das_motos', coalesce((select jsonb_agg(to_jsonb(mp)) from public.moto_proprietarios mp where mp.oficina_id = v_oficina), '[]'::jsonb),
    'produtos', coalesce((select jsonb_agg(to_jsonb(p)) from public.produtos p where p.oficina_id = v_oficina), '[]'::jsonb),
    'servicos', coalesce((select jsonb_agg(to_jsonb(s)) from public.servicos s where s.oficina_id = v_oficina), '[]'::jsonb),
    'movimentacoes_estoque', coalesce((select jsonb_agg(to_jsonb(me)) from public.movimentacoes_estoque me where me.oficina_id = v_oficina), '[]'::jsonb),
    'notas_fiscais', coalesce((select jsonb_agg(to_jsonb(nf)) from public.notas_fiscais_entrada nf where nf.oficina_id = v_oficina), '[]'::jsonb),
    'orcamentos', coalesce((select jsonb_agg(to_jsonb(orc)) from public.orcamentos orc where orc.oficina_id = v_oficina), '[]'::jsonb),
    'itens_dos_orcamentos', coalesce((select jsonb_agg(to_jsonb(oi)) from public.orcamento_itens oi where oi.oficina_id = v_oficina), '[]'::jsonb),
    'ordens_servico', coalesce((select jsonb_agg(to_jsonb(os)) from public.ordens_servico os where os.oficina_id = v_oficina), '[]'::jsonb),
    'itens_das_ordens', coalesce((select jsonb_agg(to_jsonb(osi)) from public.os_itens osi where osi.oficina_id = v_oficina), '[]'::jsonb),
    'apontamentos_de_tempo', coalesce((select jsonb_agg(to_jsonb(ap)) from public.apontamentos_tempo ap where ap.oficina_id = v_oficina), '[]'::jsonb),
    'contas_a_receber', coalesce((select jsonb_agg(to_jsonb(cr)) from public.contas_receber cr where cr.oficina_id = v_oficina), '[]'::jsonb),
    'contas_a_pagar', coalesce((select jsonb_agg(to_jsonb(cp)) from public.contas_pagar cp where cp.oficina_id = v_oficina), '[]'::jsonb)
  );
end;
$$;

comment on function public.exportar_dados_da_oficina is
  'Tudo o que é da oficina, em qualquer situação, inclusive com a conta encerrada.';

-- Encerrar a conta ---------------------------------------------------------------
-- O pedido só MARCA a data. Nada é apagado aqui, e nada apaga sozinho depois:
-- a exclusão efetiva é ato de gente, pelo painel da plataforma. Um robô que
-- apaga dado de cliente no relógio é o tipo de automação que, no dia em que
-- errar, não tem desfazer.
create or replace function public.pedir_encerramento_da_conta(p_motivo text default null)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oficina uuid;
  v_perfil public.perfil_usuario;
  v_quando timestamptz;
begin
  select u.oficina_id, u.perfil into v_oficina, v_perfil
  from public.usuarios u where u.id = auth.uid() and u.ativo;

  if v_oficina is null then
    raise exception 'Faça login novamente.' using errcode = 'insufficient_privilege';
  end if;
  if v_perfil <> 'admin' then
    raise exception 'Só o responsável pela oficina pode encerrar a conta.'
      using errcode = 'insufficient_privilege';
  end if;

  v_quando := now() + interval '30 days';

  -- Abre a porta que o gatilho abaixo tranca, só dentro desta transação. É o
  -- mesmo recurso usado no fechamento de OS com saldo negativo: a exceção
  -- existe, é estreita, e morre junto com a transação.
  perform set_config('app.encerramento_da_conta', 'sim', true);

  update public.oficinas
    set exclusao_pedida_em = now(),
        excluir_em = v_quando,
        motivo_da_saida = nullif(btrim(coalesce(p_motivo, '')), '')
  where id = v_oficina;

  perform set_config('app.encerramento_da_conta', '', true);
  return v_quando;
end;
$$;

comment on function public.pedir_encerramento_da_conta is
  'Marca a data. Não apaga nada, e nada apaga sozinho: a exclusão é ato de gente.';

create or replace function public.desistir_do_encerramento()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oficina uuid;
  v_perfil public.perfil_usuario;
begin
  select u.oficina_id, u.perfil into v_oficina, v_perfil
  from public.usuarios u where u.id = auth.uid() and u.ativo;

  if v_oficina is null or v_perfil <> 'admin' then
    raise exception 'Só o responsável pela oficina pode fazer isso.'
      using errcode = 'insufficient_privilege';
  end if;

  perform set_config('app.encerramento_da_conta', 'sim', true);
  update public.oficinas
    set exclusao_pedida_em = null, excluir_em = null
  where id = v_oficina;
  perform set_config('app.encerramento_da_conta', '', true);
end;
$$;

-- A oficina não escreve essas colunas na mão -------------------------------------
-- A política de update de `oficinas` deixa o admin editar a própria linha, e
-- sem esta trava ele marcaria (ou desmarcaria) a própria exclusão com um PATCH,
-- por fora das funções acima — que são as que registram data e motivo.
create or replace function public.proteger_encerramento()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  -- As funções pedir_encerramento_da_conta e desistir_do_encerramento ligam
  -- este sinalizador. É o único caminho por onde essas colunas mudam vindas do
  -- aplicativo — e por lá a data e o motivo ficam registrados.
  if coalesce(current_setting('app.encerramento_da_conta', true), '') = 'sim' then
    return new;
  end if;

  if new.excluir_em is distinct from old.excluir_em
     or new.exclusao_pedida_em is distinct from old.exclusao_pedida_em
     or new.acesso_ate is distinct from old.acesso_ate
     or new.teste_ate is distinct from old.teste_ate then
    raise exception 'Prazos e encerramento não se editam direto.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists oficinas_proteger_encerramento on public.oficinas;
create trigger oficinas_proteger_encerramento
  before update on public.oficinas
  for each row execute function public.proteger_encerramento();

select public.conferir_fechadura();
