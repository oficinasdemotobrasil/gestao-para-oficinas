# Gestão para Oficinas

SaaS multi-tenant de gestão para oficinas de moto. Cada oficina é um cliente que
enxerga apenas os próprios dados. Feito para ser usado no celular, dentro da
oficina, com a mão suja de graxa.

Primeiro cliente: **Oficina Tiago Carvalho**.

**Fase 2 de 4** — estoque, orçamento, PDF, WhatsApp e aprovação virando ordem
de serviço. A Fase 1 (cadastros, acesso e a base multi-tenant) está fechada.

Em produção: **https://gestao-para-oficinas.vercel.app**

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
| `npm run teste:funcao` | Ataca a Edge Function `criar-colaborador`, o único lugar onde a service_role roda. Precisa de `.env.test.local` |
| `npm run teste:fase3` | Prova o ciclo da OS, a baixa de estoque e o estorno contra o Supabase real. Precisa de `.env.test.local` |
| `npm run teste:ia` | Prova a Edge Function do texto comercial. Precisa de `.env.test.local` e da chave do Gemini configurada |
| `npm run teste:fase2` | Prova estoque, nota, orçamento e aprovação contra o Supabase real. Precisa de `.env.test.local` |
| `npm run checar-tipos` | TypeScript sem gerar arquivos |
| `npm run migrations:juntar` | Regera `supabase/_todas_migrations_em_ordem.sql`, o arquivo colável no SQL Editor. Rode sempre que criar uma migration |

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
- Dois níveis de teste de isolamento entre oficinas, mais um teste de ataque à
  Edge Function (tenta plantar colaborador na oficina de outro cliente)

### Pronto na Fase 2

- Motor de estoque no banco: entrada, saída e ajuste com trava contra saldo
  negativo, extrato que nunca é apagado e recálculo a partir do extrato
- Orçamento: editor de uma tela só, itens de catálogo e itens avulsos, desconto,
  validade e garantia, numeração por oficina
- Texto comercial opcional gerado por IA para o campo de observações
- Envio ao cliente: mensagem pronta de WhatsApp, cópia do texto e PDF de uma
  página com cabeçalho da oficina, tabela de itens, desconto, total, validade e
  garantia. No celular, o botão de compartilhar usa o menu do próprio aparelho
- Aprovação: o orçamento vira ordem de serviço aberta, com todos os itens
  copiados e um responsável escolhido na hora — qualquer perfil, não só mecânico.
  O estoque **não** é baixado nesse momento
- Recusa com motivo, e o orçamento decidido fica só de leitura
- Tela de ordem de serviço de leitura, e a lista de ordens do mecânico na tela
  inicial dele

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
- **Inserção em lote pelo PostgREST não respeita o `DEFAULT` da coluna.** Quando
  vários registros vão numa chamada só, ele monta um único INSERT com a união
  das colunas; o registro que não traz uma coluna recebe `NULL` explícito, e
  `NULL` não aciona o default — o lote inteiro falha com `23502`. **Regra: em
  inserção em lote, todas as linhas mandam todas as colunas.** Isso vai importar
  na Fase 2, que grava itens de orçamento e de OS em lote. A `moto_proprietarios`
  já está protegida por gatilho (migration `0015`).
- **"Copiar texto" depende do navegador.** Em https funciona; fora de contexto
  seguro o app cai no caminho antigo e, se ele também falhar, avisa em vez de
  fingir que copiou. Vale conferir uma vez no celular do cliente.
- **Não existe transferência de moto entre donos** ainda. A estrutura suporta
  (`moto_proprietarios` com `data_fim`), mas não há tela. Entra na Fase 2.

---

## Publicar

### Supabase

1. **Migrations** — no SQL Editor, cole
   `supabase/_todas_migrations_em_ordem.sql` (arquivo gerado, com todas na ordem)
   ou rode um a um os arquivos de `supabase/migrations`. O `0014` para com erro
   se sobrar qualquer tabela sem RLS.
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

   Se a CLI der `403 — your account does not have the necessary privileges`, ela
   está logada em outra conta: `npx supabase logout`, saia do Supabase no
   navegador e entre de novo. Dá para publicar sem CLI nenhuma pelo painel, em
   **Edge Functions › Deploy a new function › Via editor**, colando o mesmo
   código. Depois de publicar, confirme com `npm run teste:funcao`.

   **Não desligue o "Verify JWT"** dessa função. Ela já valida a sessão por conta
   própria, e a verificação do portão é uma camada a mais que está funcionando —
   o teste prova que um token de admin real passa.
5. **Edge Function do texto por IA** (opcional — o app funciona sem ela, o
   botão só mostra erro se for clicado):
   ```bash
   npx supabase functions deploy gerar-texto-orcamento
   ```
   Em **Edge Functions → gerar-texto-orcamento → Secrets**, adicione:
   - `GEMINI_API_KEY` — a chave da sua conta Google AI Studio / Gemini
   - `GEMINI_MODEL` — o id do modelo mais barato disponível *hoje*. Confira em
     ai.google.dev/pricing antes de definir; não existe um valor certo para
     sempre, os modelos e preços mudam. Em fev/2025 algo como
     `gemini-2.0-flash-lite` era a opção mais barata — pode já ter mudado.

   A chave nunca passa pelo navegador: fica só nesta função, que confere sessão
   e perfil (admin ou vendedor) antes de gastar um único token.
6. **URLs de autenticação** — Authentication › URL Configuration:
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

O arquivo `vercel.json` na raiz cuida de três coisas, e nenhuma delas é opcional:

- **Rewrite de tudo para `/index.html`.** O app é uma página única: o roteamento
  acontece no navegador. Sem isso, abrir `/motos` direto, atualizar a tela com F5
  ou seguir o link de recuperação de senha (`/redefinir-senha`) devolve 404.
  Arquivo que existe em disco (`sw.js`, manifest, ícones) continua sendo servido
  normalmente — a Vercel tenta o arquivo antes da regra.
- **`sw.js` sem cache.** É o service worker quem descobre que existe versão nova.
  Guardado em cache, a oficina continuaria abrindo a versão antiga por dias.
- **`/assets` com cache eterno.** O Vite põe hash no nome de cada arquivo, então
  o conteúdo nunca muda — o que faz o app abrir rápido na internet da oficina.

Cuidado ao editar: a Vercel valida esse arquivo de forma estrita e recusa
qualquer propriedade que não conheça. JSON não aceita comentário, e tentar
colocar um (uma chave `"//"`, por exemplo) faz o deploy falhar na leitura da
configuração — o build passa, mas as regras não valem.
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
