-- 0073 — O suporte entra na oficina do cliente
--
-- Para atender, o suporte precisa ver o sistema como o dono vê. Havia três
-- formas de fazer isso, e a escolhida não é a mais fácil:
--
-- 1. Gerar uma sessão para o usuário do próprio cliente. Nada de RLS mudaria,
--    e tudo que o suporte fizesse ficaria registrado como se fosse ele. Semanas
--    depois, ninguém consegue dizer quem apagou o quê.
--
-- 2. Trocar a `oficina_do_usuario()` por uma que aceite "oficina em suporte"
--    para qualquer administrador da plataforma. Resolve, e deixa a função mais
--    complicada para 165 lugares por causa de um caso raro.
--
-- 3. Uma conta de suporte que MUDA de oficina. É esta. Uma única linha em
--    `usuarios`, reapontada para a oficina durante o atendimento e desativada
--    no fim. As políticas continuam idênticas, porque para elas é só mais um
--    usuário da oficina — e as ações ficam com o nome do suporte, que é o
--    ponto.
--
-- A `oficina_do_usuario()` muda mesmo assim, mas de um jeito que se pode
-- provar inerte: a condição nova só tem efeito quando `de_suporte` é
-- verdadeiro, e ela é falsa para toda conta de cliente que existe. O prazo de
-- validade precisa ser imposto por quem CONCEDE o acesso; imposto em qualquer
-- outro lugar, ele vira enfeite — a sessão esquecida continuaria aberta.

alter table public.usuarios
  add column if not exists de_suporte boolean not null default false;

comment on column public.usuarios.de_suporte is
  'Conta da equipe do GIRO, que entra na oficina para dar suporte. Não é colaborador: não conta no limite do plano e não aparece na lista da oficina.';

-- O registro de quem entrou onde, quando e por quê -----------------------------
-- Existe para responder "quem viu os dados dos meus clientes?". Sem ele, a
-- resposta é dar de ombros — e os clientes dessas oficinas são pessoas físicas,
-- com nome, telefone e documento guardados aqui.
create table if not exists public.sessoes_de_suporte (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null references public.oficinas (id) on delete cascade,
  /** A linha de `usuarios` que foi emprestada para o atendimento. */
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  /** Quem, da plataforma, abriu o acesso. */
  admin_id uuid not null references auth.users (id) on delete restrict,
  motivo text not null check (length(trim(motivo)) >= 5),
  iniciada_em timestamptz not null default now(),
  expira_em timestamptz not null,
  encerrada_em timestamptz
);

create index if not exists sessoes_de_suporte_abertas_idx
  on public.sessoes_de_suporte (usuario_id, oficina_id)
  where encerrada_em is null;
create index if not exists sessoes_de_suporte_oficina_idx
  on public.sessoes_de_suporte (oficina_id, iniciada_em desc);

alter table public.sessoes_de_suporte enable row level security;

-- Nega tudo, como a lista de administradores da plataforma (0040): quem lê e
-- escreve aqui é a Edge Function com a service_role, que não passa por RLS. A
-- política existe para a decisão ficar escrita, e não parecer esquecimento.
drop policy if exists "ninguem le as sessoes de suporte" on public.sessoes_de_suporte;
create policy "ninguem le as sessoes de suporte"
  on public.sessoes_de_suporte for all to authenticated
  using (false)
  with check (false);

/*
 * A oficina de quem está logado, agora com o prazo do suporte.
 *
 * Para toda conta de cliente, `de_suporte` é falso e a condição nova é
 * verdadeira: o resultado é exatamente o de antes. Para a conta de suporte, o
 * acesso só existe enquanto houver sessão aberta e dentro do prazo — então
 * esquecer de encerrar não deixa porta aberta, fecha sozinha na hora marcada.
 *
 * O corpo parte da versão da 0044, e não da 0003: a junção com `oficinas` e o
 * `status <> 'cancelada'` são a regra que fecha a conta encerrada.
 */
create or replace function public.oficina_do_usuario()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.oficina_id
  from public.usuarios u
  join public.oficinas o on o.id = u.oficina_id
  where u.id = auth.uid()
    and u.ativo
    -- A junção e esta linha vêm da 0044: conta encerrada devolve nulo, o que
    -- fecha todas as políticas de uma vez. Reescrever a função a partir da
    -- versão da 0003 apagaria essa regra sem ninguém notar — foram dois testes
    -- que me avisaram, e é para isso que eles existem.
    and o.status <> 'cancelada'
    and (
      not u.de_suporte
      or exists (
        select 1
        from public.sessoes_de_suporte s
        where s.usuario_id = u.id
          and s.oficina_id = u.oficina_id
          and s.encerrada_em is null
          and s.expira_em > now()
      )
    )
$$;

-- A conta de suporte não aparece na equipe da oficina --------------------------
-- O `id = auth.uid()` continua primeiro de propósito: é ele que deixa a própria
-- conta de suporte ler o seu cadastro, que é o que o aplicativo faz ao entrar.
drop policy if exists "equipe visivel na propria oficina" on public.usuarios;
create policy "equipe visivel na propria oficina"
  on public.usuarios for select to authenticated
  using (
    id = auth.uid()
    or (
      oficina_id = public.oficina_do_usuario()
      and not public.eh_mecanico()
      and not de_suporte
    )
  );

/*
 * E não ocupa vaga no plano.
 *
 * Sem isto, atender uma oficina que está no limite de acessos seria impossível
 * — justamente a oficina com mais gente dentro, que é a que mais chama.
 */
create or replace function public.conferir_limite_de_colaboradores()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite integer;
  v_quantos integer;
  v_plano public.plano_oficina;
begin
  if new.de_suporte then
    return new;
  end if;

  if tg_op = 'UPDATE' and not (new.ativo and not old.ativo) then
    return new;
  end if;
  if tg_op = 'INSERT' and not new.ativo then
    return new;
  end if;

  select plano into v_plano from public.oficinas where id = new.oficina_id;
  v_limite := public.limite_da_oficina(new.oficina_id);
  if v_limite is null then
    return new;
  end if;

  select count(*) into v_quantos
  from public.usuarios
  where oficina_id = new.oficina_id and ativo and id <> new.id and not de_suporte;

  if v_quantos >= v_limite then
    raise exception
      'O plano % permite % pessoas com acesso, e a oficina já tem %. Desative alguém ou mude de plano.',
      v_plano, v_limite, v_quantos
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

select public.conferir_fechadura();
