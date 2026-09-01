# Gestão para Oficinas

SaaS multi-tenant de gestão para oficinas de moto. Cada oficina é um cliente que
enxerga apenas os próprios dados. Feito para ser usado no celular, dentro da
oficina, com a mão suja de graxa.

Primeiro cliente: **Oficina Tiago Carvalho**.

**Fase 1 de 4** — cadastros, acesso e a base de segurança multi-tenant.

---

## Rodar na sua máquina

```bash
npm install
cp .env.local.example .env.local   # preencha com os dados do painel do Supabase
npm run dev
```

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o app em http://localhost:5173 |
| `npm run build` | Build de produção (checa os tipos antes) |
| `npm run preview` | Serve o build, para testar o PWA de verdade |
| `npm run validar:banco` | Roda as migrations num Postgres local e testa o RLS. Não precisa de internet nem de projeto Supabase |
| `npm run teste:isolamento` | Teste oficial de isolamento, contra o Supabase real. Precisa de `.env.test.local` |
| `npm run checar-tipos` | TypeScript sem gerar arquivos |

---

## Como a segurança funciona

Esta é a parte que não pode dar errado: se falhar, uma oficina vê os dados da
outra.

1. **Toda tabela de negócio tem `oficina_id`**, e o banco recusa a criação de
   qualquer tabela sem ela (migration `0014`).
2. **RLS ativado em todas as 16 tabelas**, com políticas que comparam
   `oficina_id = public.oficina_do_usuario()`.
3. **O frontend nunca filtra por tenant.** Nenhuma consulta em `src/` passa
   `oficina_id`. Se o filtro estivesse no app, bastaria abrir o navegador para
   contorná-lo.
4. **A `service_role` nunca entra no navegador.** Ela existe em dois lugares
   apenas: na Edge Function `criar-colaborador` (no servidor do Supabase) e no
   `.env.test.local` da sua máquina, para o script de teste.
5. **Chaves estrangeiras compostas `(id, oficina_id)`** impedem que uma linha da
   oficina A referencie uma linha da oficina B. O RLS impediria a leitura; a
   chave composta impede a escrita.
6. **`preco_custo` é invisível para o vendedor** porque ele lê a view
   `vw_produtos`, e não a tabela. RLS filtra linha, não coluna — sem a view, o
   custo viria no JSON mesmo com a tela escondendo.

### Perfis

| | admin | vendedor | mecânico |
|---|---|---|---|
| Clientes e motos | tudo | tudo | só os das OS dele |
| Produtos | tudo, com custo e margem | sem preço de custo | nenhum |
| Serviços | tudo | ver e usar | só os ativos |
| Colaboradores | criar, editar, ativar/desativar | não | não |
| Configurações da oficina | sim | não | não |
| Financeiro (Fase 3) | sim | não | não |

---

## Estado do projeto

### Pronto na Fase 1

- Migrations completas (todas as tabelas das 4 fases), índices e RLS
- Login, recuperação de senha, rota protegida e redirecionamento por perfil
- Design system: `DESIGN.md` + componentes base
- Clientes: lista com busca, cadastro, edição e detalhe com as motos
- Motos: busca por placa, cadastro atômico com o dono, edição, atualização de km,
  histórico da placa e de proprietários
- Produtos e serviços: lista, busca, cadastro, edição, ativar/desativar
- Colaboradores: cadastro via Edge Function, edição e ativar/desativar
- Configurações da oficina, incluindo chave PIX
- PWA instalável, abrindo offline, com tela de sem conexão
- Dois níveis de teste de isolamento entre oficinas

### Fora do escopo da Fase 1 (de propósito)

Movimentação de estoque, notas fiscais, orçamentos, PDF, WhatsApp, ordens de
serviço, apontamento de tempo, financeiro, PIX cobrando de verdade, painel de
indicadores, white-label, assinatura, IA e áudio.

### Riscos conhecidos

- **Admin de oficina não é admin de plataforma.** Hoje todo usuário está amarrado
  a uma `oficina_id`. Quando o segundo cliente entrar, vai ser preciso um perfil
  de plataforma acima do RLS ou um painel separado. **Decidir antes de vender o
  segundo**, não depois.
- **Offline é só o shell.** O app abre sem internet, mas os dados vêm do
  servidor. Fila de escrita e sincronização seriam um projeto à parte.
- **O plano gratuito do Supabase pausa o projeto** após cerca de 7 dias sem
  acesso. O primeiro acesso depois disso é lento.
- **A `vw_produtos` roda como dono do banco**, ou seja, passa por cima do RLS de
  `produtos`. O isolamento dela depende do `WHERE` dentro da view — que está
  coberto pelos dois testes, justamente por isso.
- **Não existe transferência de moto entre donos** ainda. A estrutura suporta
  (`moto_proprietarios` com `data_fim`), mas não há tela. Entra na Fase 2.

---

## Publicar

### Supabase

1. **Migrations** — no SQL Editor, rode os arquivos de `supabase/migrations` na
   ordem numérica. O `0014` para com erro se sobrar qualquer tabela sem RLS.
2. **Primeiro usuário** — Authentication › Users › Add user, com *Auto Confirm*.
3. **Vincular à oficina** — edite `supabase/seed/oficina_inicial.sql` com o
   e-mail e o nome, e rode no SQL Editor.
4. **Edge Function** — sem ela, o cadastro de colaborador não funciona:
   ```bash
   npx supabase login
   npx supabase link --project-ref SEU-PROJECT-REF
   npx supabase functions deploy criar-colaborador
   ```
   As variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
   `SUPABASE_SERVICE_ROLE_KEY` já existem no ambiente das Edge Functions; não é
   preciso configurar nada.
5. **URLs de autenticação** — Authentication › URL Configuration:
   - *Site URL*: a URL da Vercel (em desenvolvimento, `http://localhost:5173`)
   - *Redirect URLs*: `http://localhost:5173/redefinir-senha` e
     `https://SEU-APP.vercel.app/redefinir-senha`

### Vercel

1. Suba o repositório para o GitHub e importe o projeto na Vercel.
2. Framework: **Vite**. Build: `npm run build`. Saída: `dist`.
3. Variáveis de ambiente (Production e Preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` — a *publishable key*, nunca a service_role
4. Depois do primeiro deploy, volte ao Supabase e acrescente a URL da Vercel nas
   URLs de autenticação do passo 5 acima.
5. No iPhone, abra a URL no **Safari** → Compartilhar → **Adicionar à Tela de
   Início**. O iOS não oferece instalação automática; o app ensina o caminho na
   aba "Mais".

---

## Estrutura

```
src/
  auth/            sessão, permissões, rotas protegidas e telas de acesso
  componentes/ui/  design system (Botão, Campo, Card, Badge, Modal, Toast…)
  componentes/layout/  casca do app, tab bar, cabeçalhos, aviso de conexão
  funcionalidades/ uma pasta por assunto, cada uma com api.ts e esquemas.ts
  lib/             cliente Supabase, formatação pt-BR, tradução de erros
  tipos/           tipos do banco
supabase/
  migrations/      o banco, versionado
  functions/       Edge Functions
  seed/            script da oficina inicial
scripts/           validação do banco, teste de isolamento, geração de ícones
```

Regra de ouro do design: nenhum valor de cor, espaço, raio ou sombra escrito
solto dentro de componente. A fonte é `src/estilos/tokens.css`, documentada em
[DESIGN.md](DESIGN.md).
