-- Cria a primeira oficina e liga o primeiro administrador.
--
-- Rode este script UMA VEZ, no SQL Editor do painel do Supabase, DEPOIS de
-- criar o usuário no painel (Authentication > Users > Add user). Não existe
-- tela de cadastro no aplicativo: quem entra é sempre convidado por um admin,
-- e o primeiro admin de todos tem que nascer aqui.
--
-- Antes de rodar, troque o e-mail abaixo pelo que você cadastrou no Auth.

do $$
declare
  v_email text := 'troque-pelo-email-do-tiago@exemplo.com';  -- <<< TROQUE AQUI
  v_nome  text := 'Tiago Carvalho';                          -- <<< e aqui
  v_usuario_id uuid;
  v_oficina_id uuid;
begin
  select id into v_usuario_id from auth.users where lower(email) = lower(v_email);

  if v_usuario_id is null then
    raise exception 'Nenhum usuário com o e-mail % em Authentication > Users. Crie o usuário primeiro.', v_email;
  end if;

  if exists (select 1 from public.usuarios where id = v_usuario_id) then
    raise notice 'Este usuário já está vinculado a uma oficina. Nada a fazer.';
    return;
  end if;

  insert into public.oficinas (nome, telefone, plano, status)
  values ('Oficina Tiago Carvalho', null, 'gratuito', 'ativa')
  returning id into v_oficina_id;

  insert into public.usuarios (id, oficina_id, nome, email, perfil, ativo)
  values (v_usuario_id, v_oficina_id, v_nome, v_email, 'admin', true);

  raise notice 'Pronto. Oficina % criada e % virou administrador.', v_oficina_id, v_email;
end $$;
