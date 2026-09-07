# Painel da plataforma

Aplicativo **separado** do sistema das oficinas. É por aqui que se cadastra uma
oficina nova, se troca o plano dela e se suspende ou reativa o acesso.

Ele é separado de propósito: o app do cliente não ganhou nenhum perfil, rota ou
condição capaz de enxergar outra oficina. O teste de isolamento continua provando
que ninguém atravessa a parede, sem exceção para ninguém.

## Quem entra

Só quem estiver na tabela `admins_plataforma`. Um administrador da plataforma
**não tem linha em `usuarios`** — ou seja, ele não pertence a oficina nenhuma e,
se tentar entrar no app do cliente, não vê nada.

Para dar acesso a alguém, crie a conta em Authentication > Users no Supabase e
depois rode, no SQL Editor:

```sql
insert into public.admins_plataforma (usuario_id, observacao)
select id, 'dono da plataforma' from auth.users where email = 'o-email@exemplo.com';
```

## Rodar aqui

```
cd painel
npm install
cp .env.local.example .env.local   # e preencha
npm run dev                        # http://localhost:5273
```

## Publicar

Um **segundo projeto na Vercel**, apontando para o mesmo repositório, com:

- Root Directory: `painel`
- Variáveis: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`

O `index.html` já pede aos buscadores que não indexem a página.
