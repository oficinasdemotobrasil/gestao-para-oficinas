-- 0062 — Uma busca só, que devolve a ficha inteira
--
-- Hoje a oficina procura em dois lugares: a busca de Clientes acha gente, a
-- busca de Motos acha placa. Quem chega no balcão com uma moto na mão não sabe
-- em qual das duas está a resposta — e a pergunta real nunca é "existe esta
-- placa?", é "de quem é, o que já fizemos nela e o cliente está devendo?".
--
-- Esta função responde tudo de uma vez, numa chamada só. Uma chamada importa:
-- a internet da oficina é ruim, e fazer quatro consultas em sequência com o
-- cliente esperando na frente do balcão é o que faz parecer que o sistema
-- travou.
--
-- Ela NÃO é security definer: roda com as permissões de quem chamou, e é o RLS
-- de sempre que decide o que aparece. Assim o mecânico enxerga por aqui
-- exatamente o que já enxergaria pelas telas — nem mais, nem menos.

create or replace function public.busca_geral(p_termo text)
returns jsonb
language plpgsql
stable
as $$
declare
  v_oficina uuid := public.oficina_do_usuario();
  v_termo text := trim(coalesce(p_termo, ''));
  -- Placa entra suja: "abc-1d23", "ABC 1D23". Só letra e número interessam.
  v_placa text := upper(regexp_replace(v_termo, '[^A-Za-z0-9]', '', 'g'));
  v_digitos text := regexp_replace(v_termo, '\D', '', 'g');
  -- '%' e '_' são curinga no like: escapados, senão "100%" casa com tudo.
  v_texto text := '%' || replace(replace(replace(v_termo, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_numero integer := case when v_digitos <> '' and length(v_digitos) <= 9
                           then v_digitos::integer else null end;
  v_clientes jsonb;
  v_motos jsonb;
  v_ordens jsonb;
begin
  if v_oficina is null then
    raise exception 'Usuário sem oficina ativa.' using errcode = 'insufficient_privilege';
  end if;

  -- Busca curta demais devolveria a oficina inteira, uma letra por vez.
  if length(v_termo) < 2 then
    return jsonb_build_object('clientes', '[]'::jsonb, 'motos', '[]'::jsonb, 'ordens', '[]'::jsonb);
  end if;

  -- Motos: pela placa (limpa ou como foi digitada), marca e modelo -----------
  select coalesce(jsonb_agg(m order by m->>'placa'), '[]'::jsonb)
  into v_motos
  from (
    select jsonb_build_object(
      'id', mo.id,
      'placa', mo.placa,
      'marca', mo.marca,
      'modelo', mo.modelo,
      'ano', mo.ano,
      'km_atual', mo.km_atual,
      'dono_id', dono.cliente_id,
      'dono_nome', dono.nome,
      'dono_telefone', dono.telefone,
      -- O que a oficina quer saber antes de abrir a ficha: quando ela esteve
      -- aqui pela última vez, e se tem serviço em aberto agora.
      'ultimo_servico', (
        select max(os.data_conclusao) from public.ordens_servico os
        where os.moto_id = mo.id and os.status in ('finalizada', 'entregue')
      ),
      'servicos_abertos', (
        select count(*) from public.ordens_servico os
        where os.moto_id = mo.id
          and os.status in ('aberta', 'em_andamento', 'pausada', 'aguardando_conferencia')
      )
    ) as m
    from public.motos mo
    left join lateral (
      select mp.cliente_id, c.nome, c.telefone
      from public.moto_proprietarios mp
      join public.clientes c on c.id = mp.cliente_id
      where mp.moto_id = mo.id and mp.data_fim is null
      order by mp.data_inicio desc
      limit 1
    ) dono on true
    where mo.oficina_id = v_oficina
      and (
        -- Sem o teste de vazio, um termo só de pontuação viraria LIKE '%%'
        -- e devolveria a garagem inteira.
        (v_placa <> '' and mo.placa like '%' || v_placa || '%')
        or mo.marca ilike v_texto
        or mo.modelo ilike v_texto
        or dono.nome ilike v_texto
      )
    limit 12
  ) x;

  -- Clientes: nome, telefone, documento --------------------------------------
  select coalesce(jsonb_agg(c order by c->>'nome'), '[]'::jsonb)
  into v_clientes
  from (
    select jsonb_build_object(
      'id', cl.id,
      'nome', cl.nome,
      'telefone', cl.telefone,
      'motos', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', mo.id, 'placa', mo.placa, 'marca', mo.marca, 'modelo', mo.modelo
        ) order by mo.placa), '[]'::jsonb)
        from public.moto_proprietarios mp
        join public.motos mo on mo.id = mp.moto_id
        where mp.cliente_id = cl.id and mp.data_fim is null
      ),
      /*
       * Quanto ele está devendo.
       *
       * Sem security definer de propósito: no plano sem financeiro, e para
       * quem não pode ver dinheiro, a política de contas_receber não deixa
       * ler nada e isto vira 0. É a mesma informação que a pessoa teria em
       * qualquer outra tela — a busca não abre porta nova.
       */
      'em_aberto', (
        select coalesce(sum(cr.valor - cr.valor_recebido), 0)
        from public.contas_receber cr
        where cr.cliente_id = cl.id and cr.status = 'aberta' and cr.valor_recebido < cr.valor
      )
    ) as c
    from public.clientes cl
    where cl.oficina_id = v_oficina
      and (
        cl.nome ilike v_texto
        or (v_digitos <> '' and cl.telefone like '%' || v_digitos || '%')
        or (v_digitos <> '' and cl.cpf_cnpj like '%' || v_digitos || '%')
      )
    limit 12
  ) y;

  -- Ordens e orçamentos pelo número ------------------------------------------
  select coalesce(jsonb_agg(o order by o->>'numero'), '[]'::jsonb)
  into v_ordens
  from (
    select jsonb_build_object(
      'id', os.id,
      'numero', os.numero,
      'status', os.status,
      'data', os.data_abertura,
      'valor', os.valor_total,
      'placa', mo.placa,
      'cliente_nome', cl.nome
    ) as o
    from public.ordens_servico os
    left join public.motos mo on mo.id = os.moto_id
    left join public.clientes cl on cl.id = os.cliente_id
    where os.oficina_id = v_oficina
      and v_numero is not null
      and os.numero = v_numero
    limit 12
  ) z;

  return jsonb_build_object(
    'clientes', v_clientes,
    'motos', v_motos,
    'ordens', v_ordens
  );
end;
$$;

revoke all on function public.busca_geral(text) from public, anon;
grant execute on function public.busca_geral(text) to authenticated;

comment on function public.busca_geral is
  'Busca única do balcão: placa, cliente, moto e número de OS numa chamada só. Roda com as permissões de quem chamou.';

select public.conferir_fechadura();
