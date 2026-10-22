
## Contas deste projeto: GIRO Motos

Esta pasta é o **GIRO Motos** (gestão para oficinas de moto). Cada produto GIRO
tem contas próprias. **Nesta pasta, use só as contas abaixo.** Se alguma coisa
apontar para outra conta (outro projeto Supabase, outra organização, outro
repositório, outro domínio), **pare e avise antes de seguir**. Nada de senha ou
chave aqui: só nomes e identificadores.

| Serviço | Conta / identificador |
|---|---|
| E-mail dos commits | `oficinasdemotobrasil@gmail.com` (nome "Gestao para Oficinas", configurado só neste repositório) |
| GitHub | `oficinasdemotobrasil/gestao-para-oficinas` (SSH) |
| Supabase | organização **Oficinademotosbrasil**, projeto **SAAS PARA OFICINAS DE MOTO**, ref **`ilkwxilkwjinuktgzlaq`**, us-west-2, plano gratuito |
| Vercel | site **usegiromotos.com** (antigo gestao-para-oficinas.vercel.app) e painel **admin-oficinas.vercel.app**, publicados pelo GitHub. Nome do time: a confirmar |
| Domínio | `usegiromotos.com` registrado na HostGator; DNS na Vercel (ns1/ns2.vercel-dns.com) |
| E-mail do domínio | `contato@usegiromotos.com` (Titan, pela HostGator) |
| Envio de e-mail | Resend, domínio `usegiromotos.com` (conta: a confirmar) |
| Cobrança | Asaas, produção (a titular da conta está anotada na memória do Claude, fora do repositório) |
| IA do orçamento | Google Gemini (chave nos Secrets do Supabase) |
| Cloudflare | não usa |

Secrets das funções do servidor (só os nomes): `APP_URL`, `ASAAS_AMBIENTE`,
`ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `CADASTRO_ABERTO`, `EMAIL_REMETENTE`,
`EMAIL_RESPOSTA`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `RESEND_API_KEY`.

### Como mexer em cada coisa (sem navegador)

- **Ler o banco:** conector **`supabase-giro`**: só leitura, só este projeto,
  configurado só nesta pasta. O conector "Supabase" do claude.ai (sem `-giro`)
  enxerga **outro** projeto (girofoods-homologacao) — não é este.
- **Mudar o banco:** escreva a migração, rode `npm run validar:banco`, e o Ed
  aplica com `./scripts/aplicar-migracao.sh <arquivo.sql> [conferencia.sql]`.
  O script recusa endereço de outro projeto, pede SIM e roda numa transação.
  Consultas soltas, só leitura: `./scripts/aplicar-migracao.sh --so-conferir <arquivo.sql>`
  (as reaproveitáveis ficam em `supabase/conferencias/`).
- **Publicar função do servidor:** `./scripts/publicar-funcao.sh <nome>`, com um
  token `sbp_` da conta do GIRO colado na hora. A CLI do Supabase deste Mac está
  logada em **outra conta** (PLYVO, cadencia…): **nunca** rode `npx supabase`
  direto nesta pasta.
- **Backup:** `./scripts/backup-do-banco.sh`, toda semana; o endereço de conexão
  fica no cofre do Ed. As cópias vão para Documentos → "Backups do GIRO".
- **Site e painel:** `git push` (a Vercel publica sozinha).
- **Navegador / Open Claude:** só para telas que não têm comando (Asaas, Vercel,
  configurações do Supabase). Em site financeiro, o prompt começa travado em
  somente leitura.
- **GiroClima** fica em `SISTEMAS/CLIMA` e é uma cópia **sem conexão**: nunca
  ler nem mexer lá a partir desta pasta.

## Passar SQL para o SQL Editor

O caminho normal agora é `./scripts/aplicar-migracao.sh` (acima). Quando ainda
for preciso colar no SQL Editor, use `./scripts/copiar-sql.sh <arquivo>`, nunca
`pbcopy` direto.

`pbcopy` sem `LC_CTYPE` lê os bytes UTF-8 como MacRoman: "devolução" chega no
editor do Supabase como "devolu√ß√£o". E como `pbpaste` erra de volta na mesma
direção, conferir com `pbcopy arquivo && pbpaste` mostra tudo certo — o defeito
é invisível exatamente para quem tentaria enxergá-lo.

Quem vê a área de transferência como os outros aplicativos é o `osascript`. O
script copia com o locale certo e confere por ele; se não bater, ele recusa e
mostra a diferença em vez de deixar você colar lixo em produção.

## Antes de dar como "publicado"

`tsc --noEmit -p .` e `npm run build` **não são a mesma checagem**. O build
de verdade usa `tsc -b` (modo de projeto), mais rígido, e é o comando que a
Vercel roda. Um arquivo pode passar limpo no primeiro e quebrar o segundo —
foi o que aconteceu em setembro/2026: 7 erros em `scripts/validar-banco.ts`
ficaram invisíveis por dias, cada deploy falhava em silêncio na Vercel, e o
site continuava servindo a versão antiga sem ninguém perceber.

Por isso: **antes de dizer "está no ar", rode `npm run build` de verdade** —
não só `tsc --noEmit`. E depois de publicar, confira o bundle no próprio
site (o hash do arquivo em `assets/index-*.js` muda a cada deploy).

Há também um gancho de pré-push (`.githooks/pre-push`) que roda o build
automaticamente e trava o `git push` se ele falhar. Ele já está ativo neste
clone (`git config core.hooksPath .githooks`). Numa clonagem nova, rode esse
comando uma vez para ligar a trava — sem isso o gancho existe no repositório
mas não é chamado.
