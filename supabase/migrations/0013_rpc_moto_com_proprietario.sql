-- 0013 — Cadastro de moto já vinculada ao dono
--
-- A moto e o vínculo com o cliente precisam nascer juntos: uma moto gravada sem
-- proprietário, porque a segunda chamada falhou no meio, é um registro órfão que
-- ninguém encontra depois. Aqui as duas escritas estão na mesma transação.
--
-- security invoker (padrão do plpgsql): a função roda com as permissões de quem
-- chamou, então o RLS continua valendo. Um vendedor da oficina A não consegue
-- usar esta função para gravar moto na oficina B.

create or replace function public.criar_moto_com_proprietario(
  p_cliente_id uuid,
  p_placa text,
  p_marca text default null,
  p_modelo text default null,
  p_ano integer default null,
  p_cor text default null,
  p_chassi text default null,
  p_km_atual integer default 0
)
returns public.motos
language plpgsql
as $$
declare
  v_oficina_id uuid := public.oficina_do_usuario();
  v_moto public.motos;
begin
  if v_oficina_id is null then
    raise exception 'Usuário sem oficina ativa.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.motos (oficina_id, placa, marca, modelo, ano, cor, chassi, km_atual)
  values (v_oficina_id, p_placa, p_marca, p_modelo, p_ano, p_cor, p_chassi, coalesce(p_km_atual, 0))
  returning * into v_moto;

  insert into public.moto_proprietarios (oficina_id, moto_id, cliente_id, data_inicio)
  values (v_oficina_id, v_moto.id, p_cliente_id, current_date);

  return v_moto;
end;
$$;

revoke all on function public.criar_moto_com_proprietario(uuid, text, text, text, integer, text, text, integer) from public, anon;
grant execute on function public.criar_moto_com_proprietario(uuid, text, text, text, integer, text, text, integer) to authenticated;
