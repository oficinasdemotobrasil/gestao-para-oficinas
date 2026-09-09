-- 0048 — Um aviso que falhou hoje ainda sai amanhã
--
-- A 0047 procurava as oficinas cujo acesso vence EXATAMENTE daqui a N dias.
-- O defeito: se o envio falhar naquele dia, no dia seguinte a igualdade não
-- bate mais e ninguém tenta de novo. A oficina simplesmente nunca é avisada de
-- que o teste dela acabou — e não há erro em lugar nenhum, porque do ponto de
-- vista do banco tudo correu bem.
--
-- Rodar a rotina duas vezes por dia reduz a chance, mas não resolve: se o
-- provedor estiver fora o dia inteiro, o aviso se perde igual.
--
-- A correção é trocar a igualdade por uma JANELA e lembrar o que já saiu:
--
--   • entra quem tem `dias_restantes <= marco`
--   • sai quem já recebeu com sucesso aquele marco, para ESTE vencimento
--
-- Com os marcos 3 e 1, o dia normal é: avisa aos 3, avisa ao 1. Se o de 3
-- falhar, ele sai no dia 2 dizendo "faltam 2 dias" — atrasado e correto, em
-- vez de pontual e inexistente. O texto usa os dias que realmente faltam, e
-- não o marco, senão o e-mail mentiria.

-- O que já foi avisado, e para qual vencimento --------------------------------
alter table public.emails_enviados
  add column if not exists referencia text;

comment on column public.emails_enviados.referencia is
  'O que este envio cobre, para não repetir. Nos avisos de teste: vencimento|marco.';

create index if not exists emails_por_referencia
  on public.emails_enviados (oficina_id, tipo, referencia)
  where enviado;

-- A busca ---------------------------------------------------------------------
drop function if exists public.oficinas_com_teste_terminando(integer);

create or replace function public.oficinas_para_avisar(p_marco integer)
returns table (
  oficina_id uuid,
  oficina_nome text,
  responsavel_nome text,
  responsavel_email text,
  acesso_ate date,
  dias_restantes integer,
  referencia text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.nome,
    u.nome,
    u.email,
    o.acesso_ate,
    (o.acesso_ate - current_date)::integer,
    o.acesso_ate::text || '|' || p_marco::text
  from public.oficinas o
  join public.usuarios u
    on u.oficina_id = o.id and u.perfil = 'admin' and u.ativo
  where o.acesso_ate is not null
    -- Ainda não venceu, e já entrou na janela do marco.
    and o.acesso_ate >= current_date
    and (o.acesso_ate - current_date) <= p_marco
    and o.status = 'ativa'
    -- Em teste é quem não tem assinatura. Quem paga recebe outro aviso.
    and not exists (
      select 1 from public.assinaturas a
      where a.oficina_id = o.id and a.situacao = 'ativa'
    )
    -- E não recebeu este marco para este vencimento. Se a oficina ganhar mais
    -- prazo, o vencimento muda, a referência muda, e ela volta a ser avisada
    -- quando chegar perto de novo — que é o comportamento certo.
    and not exists (
      select 1 from public.emails_enviados e
      where e.oficina_id = o.id
        and e.tipo = 'teste_terminando'
        and e.enviado
        and e.referencia = o.acesso_ate::text || '|' || p_marco::text
    );
$$;

revoke execute on function public.oficinas_para_avisar(integer)
  from public, anon, authenticated;

comment on function public.oficinas_para_avisar is
  'Quem ainda precisa ser avisado neste marco. Só a service_role executa.';

select public.conferir_fechadura();
