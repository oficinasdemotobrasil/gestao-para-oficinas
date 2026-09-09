-- 0047 — Todo e-mail enviado fica registrado
--
-- E-mail é a única parte deste sistema que falha em silêncio. Uma cobrança
-- errada aparece na tela; um e-mail que não saiu não aparece em lugar nenhum —
-- a oficina simplesmente não fica sabendo que o teste dela acabou, e ninguém
-- descobre por quê.
--
-- Por isso cada tentativa vira linha aqui, com o resultado. Não é auditoria
-- burocrática: é a diferença entre "o cliente diz que não recebeu" e "o envio
-- falhou às 14h com este erro".
--
-- Não construímos fila com nova tentativa. Com uma oficina piloto e cadastro
-- fechado, o limite do provedor está a duas ordens de grandeza do uso. Fila é
-- manutenção para um problema que ainda não existe — e este registro é o que
-- vai dizer o dia em que passar a existir.

create table if not exists public.emails_enviados (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null references public.oficinas(id) on delete cascade,
  tipo text not null,
  destinatario text not null,
  assunto text not null,
  enviado boolean not null,
  /** O identificador que o provedor devolve. É por ele que se rastreia lá. */
  id_externo text,
  erro text,
  criado_em timestamptz not null default now()
);

create index if not exists emails_por_oficina
  on public.emails_enviados (oficina_id, criado_em desc);

comment on table public.emails_enviados is
  'Toda tentativa de envio, com o resultado. Escrito pelo servidor; o app só lê.';

alter table public.emails_enviados enable row level security;

-- A oficina vê o que foi mandado para ela. Transparência barata: quando o dono
-- ligar dizendo que não recebeu, a resposta está na tela dele.
drop policy if exists "a oficina ve os proprios emails" on public.emails_enviados;
create policy "a oficina ve os proprios emails"
  on public.emails_enviados for select to authenticated
  using (oficina_id = public.oficina_do_usuario() and public.eh_admin());

-- Sem política de escrita: quem envia é o servidor, com a service_role.

-- Quem está para acabar o teste ------------------------------------------------
-- Devolve as oficinas cujo acesso vence exatamente daqui a p_dias e que ainda
-- não têm assinatura — ou seja, estão em teste. A comparação é por igualdade,
-- e não "menor que", de propósito: assim o aviso sai uma vez só, no dia certo,
-- mesmo que a rotina rode duas vezes.
create or replace function public.oficinas_com_teste_terminando(p_dias integer)
returns table (
  oficina_id uuid,
  oficina_nome text,
  responsavel_nome text,
  responsavel_email text,
  acesso_ate date
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
    o.acesso_ate
  from public.oficinas o
  join public.usuarios u
    on u.oficina_id = o.id and u.perfil = 'admin' and u.ativo
  where o.acesso_ate = current_date + p_dias
    and o.status = 'ativa'
    and not exists (
      select 1 from public.assinaturas a
      where a.oficina_id = o.id and a.situacao = 'ativa'
    )
    -- Um aviso por dia por oficina, mesmo que a rotina rode de novo.
    and not exists (
      select 1 from public.emails_enviados e
      where e.oficina_id = o.id
        and e.tipo = 'teste_terminando'
        and e.enviado
        and e.criado_em::date = current_date
    );
$$;

revoke execute on function public.oficinas_com_teste_terminando(integer)
  from public, anon, authenticated;

comment on function public.oficinas_com_teste_terminando is
  'Quem avisar hoje. Só a service_role executa.';

select public.conferir_fechadura();
