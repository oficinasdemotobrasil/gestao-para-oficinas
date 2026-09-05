-- 0038 — Oficina suspensa: consulta sim, registro não
--
-- A coluna `status` existe desde a Fase 1 e até agora não fazia nada: marcar
-- uma oficina como suspensa deixava tudo funcionando igual. O painel da
-- plataforma vai existir para virar essa chave, e a chave não estava ligada em
-- lugar nenhum.
--
-- A regra escolhida é SÓ LEITURA, e não bloqueio total. Os dados são da
-- oficina, não nossos: tirar dela o histórico dos próprios clientes por causa
-- de uma fatura em atraso transforma uma cobrança em refém. Não conseguir
-- lançar nada já é pressão suficiente.
--
-- Por que gatilho e não política de RLS:
--
-- Fazer isso pelo RLS exigiria tocar em quarenta e poucas políticas, várias
-- delas 'for all' — as mesmas que sustentam o isolamento entre oficinas e que
-- 59 checagens de teste protegem. Um gatilho por tabela responde exatamente à
-- pergunta certa ("esta escrita pode acontecer agora?"), fica em uma função só,
-- e não encosta em nada do isolamento.

create or replace function public.oficina_pode_escrever()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    join public.oficinas o on o.id = u.oficina_id
    where u.id = auth.uid()
      and u.ativo
      and o.status = 'ativa'
  );
$$;

comment on function public.oficina_pode_escrever is
  'Falso quando a oficina está suspensa ou cancelada. A leitura continua liberada de propósito.';

create or replace function public.exigir_oficina_ativa()
returns trigger
language plpgsql
as $$
begin
  -- pg_trigger_depth() > 1: a escrita veio de outro gatilho ou de uma função do
  -- próprio banco — o recálculo do total da OS, o registro de histórico, o
  -- relógio do mecânico. Barrar isso deixaria o banco inconsistente por dentro
  -- em vez de impedir a pessoa de registrar algo.
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  -- A service_role não passa por aqui: ela não tem auth.uid(), e é ela que o
  -- painel da plataforma usa para reativar a oficina.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if not public.oficina_pode_escrever() then
    raise exception
      'A oficina está suspensa. Você continua consultando tudo, mas não dá para registrar nada até a situação ser regularizada.'
      using errcode = 'insufficient_privilege';
  end if;

  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
  tabelas text[] := array[
    'clientes', 'motos', 'moto_proprietarios', 'produtos', 'servicos',
    'notas_fiscais_entrada', 'movimentacoes_estoque',
    'orcamentos', 'orcamento_itens',
    'ordens_servico', 'os_itens', 'os_status_historico', 'apontamentos_tempo',
    'contas_receber', 'contas_pagar'
  ];
begin
  foreach t in array tabelas loop
    execute format('drop trigger if exists %I on public.%I', t || '_exigir_oficina_ativa', t);
    execute format(
      'create trigger %I before insert or update or delete on public.%I
         for each row execute function public.exigir_oficina_ativa()',
      t || '_exigir_oficina_ativa', t);
  end loop;
end $$;

-- A própria oficina não se reativa ---------------------------------------------
-- Sem isto, o admin de uma oficina suspensa abriria as configurações e mudaria
-- o próprio status. Mudar plano e status é da plataforma, não do cliente.
create or replace function public.proteger_plano_e_status()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.status is distinct from old.status or new.plano is distinct from old.plano then
    raise exception 'Plano e situação da oficina são definidos pela plataforma.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists oficinas_proteger_plano_e_status on public.oficinas;
create trigger oficinas_proteger_plano_e_status
  before update on public.oficinas
  for each row execute function public.proteger_plano_e_status();

select public.conferir_fechadura();
