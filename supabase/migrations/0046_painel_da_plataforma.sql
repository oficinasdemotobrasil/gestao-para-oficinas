-- 0046 — O que a plataforma precisa enxergar
--
-- Duas funções que atravessam TODAS as oficinas. Elas são o oposto de tudo o
-- que este banco faz, então merecem uma trava explícita:
--
--   revoke execute ... from public, anon, authenticated
--
-- Sem isso, qualquer pessoa logada em qualquer oficina chamaria a função e
-- veria a lista inteira de clientes da plataforma. `security definer` não
-- protege nada sozinho — ele só decide COM QUE PODER a função roda, não QUEM
-- pode chamá-la. É o mesmo descuido que já apareceu três vezes neste projeto.
--
-- Só a service_role executa, e ela só existe dentro da Edge Function, que por
-- sua vez confere `admins_plataforma` antes de qualquer coisa.
--
-- Limite de privacidade que o produto assumiu: aqui só entra dado de CONTA e
-- de USO. Nada de nome de cliente, valor de serviço ou histórico. A plataforma
-- sabe que a oficina fez 40 ordens no mês; não sabe de quem nem de quanto.

create or replace function public.plataforma_oficinas()
returns table (
  id uuid,
  nome text,
  cidade text,
  plano public.plano_oficina,
  status public.status_oficina,
  situacao public.status_oficina,
  pessoas integer,
  ordens_no_mes integer,
  orcamentos_no_mes integer,
  ultimo_acesso timestamptz,
  acesso_ate date,
  excluir_em timestamptz,
  criado_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with mes as (select date_trunc('month', now()) as inicio)
  select
    o.id,
    o.nome,
    o.cidade,
    o.plano,
    o.status,
    public.situacao_da_oficina(o.id) as situacao,
    (select count(*)::int from public.usuarios u where u.oficina_id = o.id and u.ativo),
    (select count(*)::int from public.ordens_servico os, mes
      where os.oficina_id = o.id and os.criado_em >= mes.inicio),
    (select count(*)::int from public.orcamentos orc, mes
      where orc.oficina_id = o.id and orc.criado_em >= mes.inicio),
    -- Quem não entra há semanas é quem está prestes a sair. É o número mais
    -- útil desta lista, e o único que não dá para adivinhar pelos outros.
    (select max(au.last_sign_in_at)
       from public.usuarios u
       join auth.users au on au.id = u.id
      where u.oficina_id = o.id),
    o.acesso_ate,
    o.excluir_em,
    o.criado_em
  from public.oficinas o
  order by o.criado_em desc;
$$;

comment on function public.plataforma_oficinas is
  'Conta e uso de todas as oficinas. Só a service_role executa. Sem dado de negócio.';

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
    'receita_mensal', coalesce((
      select sum(p.preco_mensal)
      from situacoes s join public.planos p on p.id = s.plano
      where s.situacao = 'ativa'
    ), 0),
    'novas_no_mes', (select count(*) from public.oficinas o, mes where o.criado_em >= mes.inicio),
    'encerramentos_no_mes', (
      select count(*) from public.oficinas o, mes
      where o.exclusao_pedida_em >= mes.inicio
    ),
    'saindo', (select count(*) from public.oficinas o where o.excluir_em is not null)
  );
$$;

comment on function public.plataforma_indicadores is
  'Números do negócio. Só a service_role executa.';

-- A trava ----------------------------------------------------------------------
-- Estas duas linhas são a parte importante desta migration.
revoke execute on function public.plataforma_oficinas() from public, anon, authenticated;
revoke execute on function public.plataforma_indicadores() from public, anon, authenticated;

-- Prazo de acesso, mexido pela plataforma ---------------------------------------
-- Um único caminho cobre estender teste, liberar bloqueio e dar cortesia:
-- todos são a mesma coisa — mudar até quando o acesso vale. Nulo é sem prazo.
--
-- O gatilho `proteger_encerramento` barra mudanças em acesso_ate vindas do
-- aplicativo; a service_role não tem auth.uid() e passa direto, como já
-- acontece com plano e situação.
create or replace function public.plataforma_definir_prazo(
  p_oficina uuid,
  p_acesso_ate date
)
returns date
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.oficinas set acesso_ate = p_acesso_ate where id = p_oficina;
  if not found then
    raise exception 'Oficina não encontrada.';
  end if;
  return p_acesso_ate;
end;
$$;

revoke execute on function public.plataforma_definir_prazo(uuid, date) from public, anon, authenticated;

select public.conferir_fechadura();
