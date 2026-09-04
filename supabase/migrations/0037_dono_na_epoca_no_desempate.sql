-- 0037 — Quem era o dono quando a moto trocou de mãos no mesmo dia
--
-- O teste no navegador mostrou o defeito: a moto passou do João para a Maria, e
-- um serviço feito DEPOIS da troca aparecia no nome do João.
--
-- A busca do dono da época olha quem tinha a moto na data da conclusão:
--
--   data_inicio <= data_da_os  e  (data_fim é nulo ou data_fim >= data_da_os)
--
-- No dia da troca as duas linhas passam — a do dono antigo termina naquele dia,
-- a do novo começa nele. O desempate era 'order by data_inicio desc', e com as
-- duas datas iguais o banco devolvia qualquer uma. Deu a errada.
--
-- O desempate passa a ser a ordem em que os registros foram criados: entre dois
-- donos no mesmo dia, vale o que foi cadastrado depois — que é o que recebeu a
-- moto. Numa troca em dias diferentes nada muda, porque data_inicio já resolve.

create or replace function public.historico_da_placa(p_moto_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_oficina uuid := public.oficina_do_usuario();
begin
  if v_oficina is null then
    raise exception 'Usuário sem oficina ativa.' using errcode = 'insufficient_privilege';
  end if;
  if not public.eh_atendimento() then
    raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.motos where id = p_moto_id and oficina_id = v_oficina
  ) then
    raise exception 'Moto não encontrada.' using errcode = 'no_data_found';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', os.id,
      'numero', os.numero,
      'data', os.data_conclusao,
      'km', os.km_entrada,
      'valor', os.valor_total,
      -- Só o nome. É de propósito: o histórico segue a moto, e telefone,
      -- e-mail e CPF do dono anterior não são assunto de quem comprou a moto.
      -- Este comentário fica para quem pensar em acrescentar campo aqui.
      'dono_na_epoca', (
        select c.nome
        from public.moto_proprietarios mp
        join public.clientes c on c.id = mp.cliente_id
        where mp.moto_id = os.moto_id
          and mp.data_inicio <= os.data_conclusao::date
          and (mp.data_fim is null or mp.data_fim >= os.data_conclusao::date)
        order by mp.data_inicio desc, mp.criado_em desc
        limit 1
      ),
      'servicos', coalesce((
        select jsonb_agg(i.descricao order by i.valor_total desc)
        from public.os_itens i
        where i.ordem_servico_id = os.id and i.tipo in ('servico', 'avulso')
      ), '[]'::jsonb),
      'pecas', coalesce((
        select jsonb_agg(i.descricao order by i.valor_total desc)
        from public.os_itens i
        where i.ordem_servico_id = os.id and i.tipo = 'produto'
      ), '[]'::jsonb)
    ) order by os.data_conclusao desc)
    from public.ordens_servico os
    where os.moto_id = p_moto_id
      and os.oficina_id = v_oficina
      and os.status in ('finalizada', 'entregue')
      and os.data_conclusao is not null
  ), '[]'::jsonb);
end;
$$;
