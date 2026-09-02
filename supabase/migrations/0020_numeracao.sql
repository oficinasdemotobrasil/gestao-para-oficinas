-- 0020 — Numeração sequencial por oficina
--
-- Cada oficina tem o seu 1, o seu 2, o seu 3. O número não pode sair do
-- frontend: dois celulares criando orçamento ao mesmo tempo leriam o mesmo
-- "último número" e gerariam dois de número 42.
--
-- A trava é a linha da própria oficina. Enquanto um insert está escolhendo o
-- número, o outro espera — mas só quem for da mesma oficina. Uma oficina nunca
-- segura a outra.

create or replace function public.definir_numero_sequencial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
begin
  if new.numero is not null then
    return new;
  end if;

  perform 1 from public.oficinas where id = new.oficina_id for update;

  if tg_table_name = 'orcamentos' then
    select coalesce(max(numero), 0) + 1 into v_numero
    from public.orcamentos where oficina_id = new.oficina_id;
  else
    select coalesce(max(numero), 0) + 1 into v_numero
    from public.ordens_servico where oficina_id = new.oficina_id;
  end if;

  new.numero := v_numero;
  return new;
end;
$$;

create trigger orcamentos_numerar
  before insert on public.orcamentos
  for each row execute function public.definir_numero_sequencial();

create trigger ordens_servico_numerar
  before insert on public.ordens_servico
  for each row execute function public.definir_numero_sequencial();

-- Validade: guardada como data para a lista poder filtrar "expirado" sem
-- calcular nada na leitura. Recalculada quando o prazo muda.
create or replace function public.definir_validade_orcamento()
returns trigger
language plpgsql
as $$
begin
  new.validade_ate := (coalesce(new.criado_em, now()))::date + new.validade_dias;
  return new;
end;
$$;

create trigger orcamentos_validade
  before insert or update of validade_dias, criado_em on public.orcamentos
  for each row execute function public.definir_validade_orcamento();
