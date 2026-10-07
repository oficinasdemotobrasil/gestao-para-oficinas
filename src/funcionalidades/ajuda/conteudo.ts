/**
 * O conteúdo da ajuda: os caminhos do dia a dia e o que cada palavra quer
 * dizer.
 *
 * Fica em código, e não no banco, por dois motivos. O primeiro é que ele
 * acompanha a versão: um passo a passo que fala de um botão que mudou de lugar
 * é pior do que não ter ajuda nenhuma. O segundo é que, estando no app, ele
 * funciona sem internet — e a oficina que mais precisa de ajuda é justamente a
 * que está com o sinal ruim no fundo do galpão.
 *
 * Como escrever aqui:
 *   - o passo diz o que TOCAR, não o que "acessar";
 *   - a palavra é a da oficina: peça, não item de estoque; fiado, não crédito;
 *   - quando a regra tem um motivo, ele vem junto, porque é o motivo que faz
 *     a pessoa lembrar da regra.
 */
import type { usePermissoes } from '@/auth/usePermissoes'

/** O que a tela de ajuda precisa saber sobre quem está lendo. */
type Permissoes = ReturnType<typeof usePermissoes>

export type Secao = 'Atendimento' | 'Serviço' | 'Estoque' | 'Dinheiro' | 'Cadastros' | 'Fiscal'

export interface Guia {
  id: string
  secao: Secao
  titulo: string
  resumo: string
  passos: string[]
  /** O que costuma dar errado, quando existe. */
  atencao?: string
  visivel: (p: Permissoes) => boolean
}

export interface Termo {
  termo: string
  explicacao: string
  visivel: (p: Permissoes) => boolean
}

const todos = () => true

export const GUIAS: Guia[] = [
  // Atendimento --------------------------------------------------------------
  {
    id: 'chegou-moto',
    secao: 'Atendimento',
    titulo: 'Chegou uma moto: por onde começar',
    resumo: 'Com a placa na mão você descobre de quem é, o que já foi feito e se tem garantia.',
    passos: [
      'Na tela inicial, toque em "Buscar placa, cliente ou OS".',
      'Digite a placa, o nome do cliente ou o telefone. Não precisa de hífen nem maiúscula.',
      'Toque na moto que apareceu para abrir a ficha dela.',
      'Na ficha você vê o dono, o que já foi feito, as peças trocadas e se há garantia valendo.',
    ],
    atencao:
      'Se a moto não aparecer, ela ainda não foi cadastrada. Cadastre o cliente primeiro, depois a moto.',
    visivel: (p) => p.verMotos,
  },
  {
    id: 'orcamento',
    secao: 'Atendimento',
    titulo: 'Fazer um orçamento',
    resumo: 'Monte com peça e serviço, mande pelo WhatsApp e espere a resposta do cliente.',
    passos: [
      'Tela inicial → "Novo orçamento".',
      'Escolha o cliente e a moto. Se o cliente for novo, dá para cadastrar ali mesmo.',
      'Confira a quilometragem: ela atualiza o cadastro da moto.',
      'Adicione os itens. "Peça" e "Serviço" vêm do catálogo; "Avulso" é para o que não está lá.',
      'Se precisar, aplique desconto em reais ou em porcento.',
      'Toque em "Criar orçamento" e depois em "Enviar pelo WhatsApp".',
    ],
    atencao:
      'Enquanto não for aprovado, o orçamento pode ser editado. Depois de aprovado, não — porque a ordem de serviço já nasceu dele.',
    visivel: (p) => p.editarOrcamentos,
  },
  {
    id: 'aprovar',
    secao: 'Atendimento',
    titulo: 'O cliente aprovou: virar ordem de serviço',
    resumo: 'Aprovar cria a OS com os mesmos itens, separa as peças e passa o serviço para um responsável.',
    passos: [
      'Abra o orçamento e toque em "O cliente aprovou".',
      'Escolha quem vai executar o serviço e toque em "Aprovar e abrir a ordem".',
      'A ordem de serviço nasce aberta, com os itens do orçamento e o valor aprovado.',
      'As peças do orçamento ficam reservadas para essa OS: continuam na prateleira, mas o catálogo mostra que já estão prometidas.',
    ],
    atencao:
      'Se faltar peça livre para o serviço, o app avisa na hora de aprovar — dá para aprovar mesmo assim, contando com a compra. Se o orçamento tiver um indicador, a comissão dele nasce agora; cancelar a ordem depois cancela a comissão.',
    visivel: (p) => p.editarOrcamentos,
  },
  {
    id: 'servico-antigo',
    secao: 'Atendimento',
    titulo: 'Lançar um serviço antigo, de antes do sistema',
    resumo: 'Para o histórico do cliente começar completo, com as datas de verdade.',
    passos: [
      'Tela inicial → "Novo orçamento".',
      'Ligue a chave "Serviço antigo, já feito e pago", no topo.',
      'Informe a data em que o serviço foi feito e quando o cliente pagou.',
      'Monte os itens normalmente e toque em "Lançar serviço antigo".',
    ],
    atencao:
      'O serviço antigo NÃO mexe no estoque: aquelas peças saíram na época, e o estoque de hoje foi contado depois. E ele só aceita datas até o dia em que a oficina entrou no sistema.',
    visivel: (p) => p.ehAdmin,
  },

  // Serviço ------------------------------------------------------------------
  {
    id: 'fotos-e-vistoria',
    secao: 'Serviço',
    titulo: 'Fotos e vistoria da moto',
    resumo: 'Registre como a moto chegou, o defeito e a peça trocada. Protege a oficina e convence o cliente.',
    passos: [
      'Abra a OS e desça até "Fotos". Escolha o momento — Entrada, Serviço ou Entrega — e toque em "Tirar foto".',
      'Cabem até 5 fotos por OS. Cada uma guarda a data e não pode ser alterada depois.',
      'Ao tocar em "Iniciar serviço", o app pergunta se você quer fazer a vistoria de entrada. É opcional.',
      'Na vistoria, marque OK ou Avaria em cada item, o combustível e o que o cliente deixou com a moto.',
      'A vistoria e as fotos saem no PDF da OS, junto com o serviço executado.',
    ],
    atencao:
      'As fotos ficam guardadas enquanto durar a garantia do serviço, e no mínimo 30 dias depois da entrega. Depois saem sozinhas. Só o dono da oficina apaga uma foto antes disso.',
    visivel: (p) => p.verOrdensDaOficina || p.ehMecanico,
  },
  {
    id: 'andamento-os',
    secao: 'Serviço',
    titulo: 'Tocar a ordem de serviço até o fim',
    resumo: 'Cada passo fica registrado com quem deu e quando — inclusive o tempo na bancada.',
    passos: [
      'Abra a OS e toque em "Iniciar serviço" quando a moto entrar na bancada. O relógio começa a contar.',
      '"Pausar" para quando parar, "Retomar" para voltar.',
      'O mecânico marca cada item como feito enquanto trabalha.',
      'Quando terminar, ele toca em "Terminei o serviço".',
      'Quem confere toca em "Conferi: finalizar serviço" — é aqui que as peças saem do estoque. Se faltou algo, "Faltou algo: voltar ao serviço".',
      'Quando o cliente buscar a moto, toque em "Cliente retirou a moto".',
    ],
    atencao:
      'Finalizar e cancelar são de quem atende, não do mecânico: é o passo que mexe no estoque e no dinheiro.',
    visivel: (p) => p.verOrdensDaOficina || p.ehMecanico,
  },
  {
    id: 'avisar-cliente',
    secao: 'Serviço',
    titulo: 'Avisar o cliente e mandar o comprovante',
    resumo: 'Com a OS finalizada, a mensagem de "está pronta" e o PDF saem com um toque.',
    passos: [
      'Abra a OS finalizada e toque em "Avisar que está pronta". O WhatsApp abre com a mensagem escrita.',
      'Para o comprovante, toque em "Baixar PDF da ordem" ou "Compartilhar PDF".',
      'O PDF leva os itens, o valor, o serviço executado, a vistoria de entrada e as fotos.',
      'Quando o cliente buscar a moto, toque em "Cliente retirou a moto".',
    ],
    atencao:
      'O que sai no PDF como "serviço executado" é a observação técnica da OS — o que o mecânico escreveu. Revise antes de mandar.',
    visivel: (p) => p.gerenciarOrdens,
  },
  {
    id: 'cancelar-os',
    secao: 'Serviço',
    titulo: 'O cliente desistiu: cancelar a ordem',
    resumo: 'A ordem não se apaga: ela é cancelada, e o histórico fica.',
    passos: [
      'Abra a OS e toque em "Cancelar ordem". Dá para cancelar até o cliente retirar a moto.',
      'Escreva o motivo: ele fica no histórico da OS.',
      'Se a OS já estava finalizada, as peças voltam para o estoque sozinhas.',
      'Para refazer o serviço com outros itens, abra o orçamento original, toque em "Duplicar", ajuste a cópia e aprove de novo.',
    ],
    atencao:
      'Se já havia cobrança lançada para essa OS, ajuste em Financeiro. A comissão do indicador, se houver, é cancelada junto.',
    visivel: (p) => p.gerenciarOrdens,
  },
  {
    id: 'falta-peca',
    secao: 'Serviço',
    titulo: 'Falta peça para finalizar',
    resumo: 'O sistema avisa quais faltam e quanto, antes de deixar fechar.',
    passos: [
      'Ao finalizar, se faltar peça, aparece a lista com o que tem e o que precisa.',
      'Se a peça existe mas não foi dada entrada, lance a nota de compra em Notas fiscais.',
      'Se preferir fechar mesmo assim, confirme: o estoque fica negativo e a movimentação sai marcada.',
    ],
    atencao:
      'Estoque negativo não é erro do sistema: é o aviso de que o cadastro não bate com a prateleira.',
    visivel: (p) => p.verOrdensDaOficina,
  },

  // Estoque ------------------------------------------------------------------
  {
    id: 'entrada-nota',
    secao: 'Estoque',
    titulo: 'Dar entrada na compra de peças',
    resumo: 'A nota do fornecedor entra uma vez e já ajusta estoque e conta a pagar.',
    passos: [
      'Menu → Notas fiscais → aba "Entrada" → "Lançar nota".',
      'Se você tem o XML, toque em "Importar XML" e confira o que veio.',
      'Se tem a nota impressa, leia o QR code ou digite a chave de 44 dígitos.',
      'Confira os itens e os preços e salve.',
    ],
    atencao:
      'A entrada aumenta o estoque e cria a conta a pagar de uma vez só. Cancelar a nota desfaz as duas coisas.',
    visivel: (p) => p.verFinanceiro,
  },
  {
    id: 'ajuste-estoque',
    secao: 'Estoque',
    titulo: 'A prateleira não bate com o sistema',
    resumo: 'O ajuste corrige a quantidade e deixa registrado o porquê.',
    passos: [
      'Menu → Catálogo → abra a peça.',
      'Toque em "Ajuste".',
      'Informe a quantidade que EXISTE de verdade na prateleira e o motivo.',
    ],
    atencao:
      'O extrato guarda todo ajuste. É por ele que se descobre se a peça está sumindo, e quando começou.',
    visivel: (p) => p.verCatalogo,
  },

  {
    id: 'peca-reservada',
    secao: 'Estoque',
    titulo: 'Saber quanto da peça está livre',
    resumo: 'A peça prometida para uma OS continua na prateleira, mas não está livre para vender.',
    passos: [
      'Menu → Catálogo: ao lado do estoque aparece quanto está reservado. Ex.: "5 L · 2 reservados".',
      'Abra a peça para ver para quais OS ela está reservada, com o link de cada uma.',
      'Ao escolher peça num orçamento, numa OS ou numa venda, a lista mostra quantas estão livres.',
    ],
    atencao:
      'A reserva some sozinha quando a OS é finalizada (aí a peça sai do estoque) ou cancelada (aí ela volta a ficar livre). Ninguém precisa mexer.',
    visivel: (p) => p.verCatalogo,
  },

  // Dinheiro -----------------------------------------------------------------
  {
    id: 'cobrar',
    secao: 'Dinheiro',
    titulo: 'Cobrar o serviço e receber',
    resumo: 'A cobrança nasce da ordem de serviço, inteira ou parcelada.',
    passos: [
      'Na OS finalizada, toque em "Lançar cobrança".',
      'Escolha em quantas vezes e a data do primeiro vencimento.',
      'Quando o cliente pagar, abra Financeiro, toque na conta e em "Marcar como recebida".',
      'Se ele pagou só uma parte, informe o valor: a conta continua aberta pelo resto.',
    ],
    atencao:
      'Conta vencida aparece como "atrasada" sozinha, pela data. Ninguém precisa marcar nada.',
    visivel: (p) => p.verFinanceiro,
  },
  {
    id: 'pix',
    secao: 'Dinheiro',
    titulo: 'Cobrar por PIX',
    resumo: 'O QR code e o "copia e cola" saem prontos, com o valor da conta.',
    passos: [
      'Antes da primeira vez: Configurações → Recebimento por PIX → escolha o tipo e digite a chave da oficina.',
      'Abra Financeiro, aba "A receber", toque na conta e em "Cobrar por PIX".',
      'Mostre o QR code ao cliente ou mande o código "copia e cola" pelo WhatsApp.',
      'Quando o dinheiro cair, volte na conta e toque em "Marcar como recebida".',
    ],
    atencao:
      'O app não vê o seu banco: ele monta a cobrança, mas quem confirma que o dinheiro entrou é você.',
    visivel: (p) => p.verFinanceiro,
  },
  {
    id: 'corrigir-lancamento',
    secao: 'Dinheiro',
    titulo: 'Lancei um recebimento ou pagamento errado',
    resumo: 'Valor, data ou forma de pagamento errados se corrigem, e a correção fica registrada.',
    passos: [
      'Abra Financeiro e encontre a conta (filtro "Pagas").',
      'Toque em "Corrigir recebimento" (ou "Corrigir pagamento", nas contas a pagar).',
      'Informe o valor, a data e a forma certos, e escreva o motivo da correção.',
    ],
    atencao:
      'O lançamento antigo não é apagado: a conta mostra o histórico com o que era, o que ficou e quem corrigiu.',
    visivel: (p) => p.verFinanceiro,
  },
  {
    id: 'desconto-no-pagamento',
    secao: 'Dinheiro',
    titulo: 'Dar desconto na hora de receber',
    resumo: 'O cliente pagou à vista e ganhou desconto: a conta fecha certa, sem ele ficar devendo a diferença.',
    passos: [
      'Abra Financeiro e encontre a conta do cliente (aba "A receber").',
      'Toque em "Marcar como recebida" e marque "Dar desconto ao cliente".',
      'Escolha em reais ou em porcento, digite o desconto e escreva o motivo (ex.: pagou à vista no PIX).',
      'Confira o valor que o cliente paga e toque em "Confirmar".',
      'Vai cobrar por PIX? Toque antes em "Dar desconto": o código do PIX já sai com o valor certo.',
    ],
    atencao:
      'Só o dono dá desconto. O desconto aparece no PDF da ordem de serviço, a comissão de quem indicou o cliente diminui junto (se ainda não foi paga) e tudo fica no histórico da conta. Errou? Toque em "Desfazer", ao lado do desconto.',
    visivel: (p) => p.verFinanceiro,
  },
  {
    id: 'despesa',
    secao: 'Dinheiro',
    titulo: 'Lançar uma despesa',
    resumo: 'Aluguel, luz, fornecedor: o que a oficina tem para pagar, com vencimento.',
    passos: [
      'Abra Financeiro e toque em "Lançar despesa".',
      'Preencha descrição, fornecedor, categoria, valor e vencimento.',
      'Se ela se repete todo mês, como o aluguel, informe em "Repetir por quantos meses".',
      'Quando pagar, abra a conta na aba "A pagar" e toque em "Paguei".',
    ],
    visivel: (p) => p.verFinanceiro,
  },
  {
    id: 'quem-deve',
    secao: 'Dinheiro',
    titulo: 'Saber quem está devendo',
    resumo: 'Pela busca, antes mesmo de abrir a ficha do cliente.',
    passos: [
      'Toque em "Buscar" e digite o nome do cliente.',
      'Se ele tiver conta em aberto, o valor aparece em vermelho no resultado.',
      'Abra a ficha dele para ver conta por conta, com vencimento.',
    ],
    visivel: (p) => p.verFinanceiro,
  },
  {
    id: 'indicador',
    secao: 'Dinheiro',
    titulo: 'Pagar quem indica cliente',
    resumo: 'Cada parceiro tem um código, e a comissão nasce quando o orçamento é aprovado.',
    passos: [
      'Menu → Indicadores → "Cadastrar indicador". O código é escolhido por ele.',
      'No orçamento, em "Validade, garantia e observações", digite o código que o cliente falou.',
      'Aprovou o orçamento, a comissão entra na aba "A pagar".',
      'Quando acertar com o parceiro, toque em "Paguei".',
    ],
    atencao:
      'O percentual padrão fica em Configurações, e cada indicador pode ter o seu. Mudar o padrão não mexe nas comissões já geradas.',
    visivel: (p) => p.ehAdmin,
  },
  {
    id: 'painel',
    secao: 'Dinheiro',
    titulo: 'Ler o painel da tela inicial',
    resumo: 'Quanto do que você ofereceu virou serviço, e quanto entrou.',
    passos: [
      'Escolha o período em cima: Hoje, 7 dias, Mês, Ano ou uma data que você escolhe.',
      'Conversão é quanto dos orçamentos virou serviço aprovado.',
      'Ticket médio é o valor médio do que foi aprovado.',
      'O bloco do dinheiro mostra o que falta receber, o que está vencido e o que já entrou.',
    ],
    atencao:
      'Serviço antigo quase sempre cai fora do mês. Quando isso acontece, o painel avisa com uma linha e leva para o ano inteiro.',
    visivel: (p) => p.verPainel,
  },

  {
    id: 'quem-sumiu',
    secao: 'Atendimento',
    titulo: 'Chamar de volta o cliente que sumiu',
    resumo: 'A lista de quem não volta há tempo, com a mensagem pronta para o WhatsApp.',
    passos: [
      'Menu → Clientes → "Quem sumiu".',
      'Aparecem os clientes sem serviço concluído há 30 dias ou mais. Em "A partir de quantos dias" dá para mudar o prazo.',
      'Toque em "Chamar no WhatsApp" e mande a mensagem — dá para ajustar o texto antes.',
    ],
    visivel: (p) => p.editarClientes,
  },

  // Cadastros ----------------------------------------------------------------
  {
    id: 'cadastrar-moto',
    secao: 'Cadastros',
    titulo: 'Cadastrar cliente e moto',
    resumo: 'Toda moto nasce ligada a um dono, e o histórico segue a placa.',
    passos: [
      'Menu → Clientes → "Novo cliente". Nome e telefone bastam.',
      'Na ficha do cliente, toque em "Adicionar" na seção Motos.',
      'Digite a placa (com ou sem hífen) e toque na marca na lista embaixo do campo.',
      'A quilometragem é a de hoje: ela serve de base para o próximo serviço.',
    ],
    atencao:
      'Se a moto trocar de dono, não cadastre outra: registre a troca de proprietário. O histórico continua com a placa.',
    visivel: (p) => p.editarMotos,
  },
  {
    id: 'catalogo',
    secao: 'Cadastros',
    titulo: 'Montar o catálogo de peças e serviços',
    resumo: 'O que está no catálogo entra no orçamento com dois toques.',
    passos: [
      'Menu → Catálogo → "Novo produto" (peça) ou, na aba Serviços, "Novo serviço".',
      'Na peça, informe preço de custo, preço de venda e o estoque mínimo.',
      'No serviço, informe o preço e o tempo estimado.',
      'Um item avulso pode virar serviço do catálogo: marque a chave ao criá-lo no orçamento.',
    ],
    atencao:
      'Estoque mínimo é o que faz o aviso de "peças para repor" aparecer. Sem ele, ninguém é avisado.',
    visivel: (p) => p.editarCatalogo,
  },
  {
    id: 'equipe',
    secao: 'Cadastros',
    titulo: 'Dar acesso a alguém da equipe',
    resumo: 'Cada perfil vê uma parte diferente do sistema.',
    passos: [
      'Menu → Colaboradores → "Novo colaborador".',
      'Escolha o perfil: administrador vê tudo; vendedor não mexe no catálogo; mecânico vê só as ordens dele.',
      'Informe o e-mail e uma senha inicial, e passe os dois para a pessoa. Ela pode trocar a senha depois.',
    ],
    atencao:
      'O mecânico não vê dinheiro em lugar nenhum do app. É de propósito.',
    visivel: (p) => p.editarColaboradores,
  },

  {
    id: 'marca',
    secao: 'Cadastros',
    titulo: 'Colocar o logo e a cor da oficina',
    resumo: 'O logo e a cor aparecem no app, no orçamento e no PDF da OS.',
    passos: [
      'Menu → Configurações → "A marca da oficina".',
      'Escolha o arquivo do logo (PNG ou JPG, até 2 MB).',
      'Escolha a cor. O app confere se o texto continua legível sobre ela.',
    ],
    visivel: (p) => p.verConfiguracoes,
  },
  {
    id: 'plano',
    secao: 'Cadastros',
    titulo: 'Assinar o GIRO',
    resumo: 'Um plano só, com tudo. Você escolhe por quanto tempo: mensal, trimestral, anual ou vitalício.',
    passos: [
      'Menu → Configurações → desça até "Sua conta".',
      'Escolha o período. O anual sai mais barato por mês; cada opção mostra quanto você economiza.',
      'Escolha PIX ou cartão. No cartão, o anual e o vitalício podem ser parcelados em até 12x — o total com a taxa aparece antes de pagar.',
      'Toque em "Gerar a cobrança". No PIX, o código aparece na hora; no cartão, abre a página segura de pagamento.',
    ],
    atencao:
      'O anual parcelado não renova sozinho: um mês antes de vencer, aparece o botão para renovar. Não trabalhamos com boleto: ele leva até dois dias para compensar.',
    visivel: (p) => p.verConfiguracoes,
  },
  {
    id: 'baixar-dados',
    secao: 'Cadastros',
    titulo: 'Baixar todos os dados da oficina',
    resumo: 'Os dados são seus: clientes, motos, serviços, estoque e financeiro, em planilha.',
    passos: [
      'Menu → Configurações → "Sua conta".',
      'Toque em "Baixar meus dados".',
      'Chega uma pasta de planilhas que abre no Excel ou no Google Planilhas.',
    ],
    atencao: 'Funciona em qualquer situação da conta, inclusive encerrada. As fotos das OS não vão nas planilhas.',
    visivel: (p) => p.verConfiguracoes,
  },

  // Fiscal -------------------------------------------------------------------
  {
    id: 'certificado',
    secao: 'Fiscal',
    titulo: 'Enviar o certificado digital A1',
    resumo: 'É o que vai permitir buscar as notas dos fornecedores automaticamente.',
    passos: [
      'Peça à contabilidade o arquivo .pfx e a senha dele.',
      'Menu → Configurações → Certificado digital.',
      'Escolha o arquivo, digite a senha e toque em "Conferir certificado".',
      'Confira se o CNPJ que apareceu é o da oficina e toque em "Registrar".',
    ],
    atencao:
      'O arquivo não fica guardado no sistema: ele é conferido no seu aparelho e descartado. Fica só o CNPJ, o nome e a validade, para avisar antes de vencer.',
    visivel: (p) => p.verConfiguracoes,
  },
]

export const VOCABULARIO: Termo[] = [
  {
    termo: 'Orçamento',
    explicacao:
      'O preço que você mandou para o cliente. Ainda não é serviço: enquanto ele não aprovar, dá para mudar tudo.',
    visivel: (p) => p.verOrcamentos,
  },
  {
    termo: 'OS (ordem de serviço)',
    explicacao:
      'O serviço em si, depois que o cliente aprovou. Nasce do orçamento com os mesmos itens e o mesmo valor.',
    visivel: todos,
  },
  {
    termo: 'Finalizar',
    explicacao:
      'O passo em que o serviço acaba e as peças saem do estoque. Por isso ele é de quem confere, e não do mecânico.',
    visivel: todos,
  },
  {
    termo: 'Entregar',
    explicacao:
      'A moto saiu da oficina — o botão é "Cliente retirou a moto". É o fim do caminho da OS, e a partir daí ela não muda mais. É também da entrega que conta o prazo das fotos.',
    visivel: todos,
  },
  {
    termo: 'Garantia',
    explicacao:
      'O prazo, em dias, que você deu junto com o serviço. A ficha da moto mostra sozinha quando ainda está valendo.',
    visivel: todos,
  },
  {
    termo: 'Serviço antigo',
    explicacao:
      'Serviço feito antes de a oficina entrar no sistema, lançado depois com a data de verdade. Não mexe no estoque de hoje.',
    visivel: (p) => p.ehAdmin,
  },
  {
    termo: 'Item avulso',
    explicacao:
      'O que não está no catálogo e você digita na hora — "solda no escapamento", "peça que o cliente trouxe".',
    visivel: (p) => p.verOrcamentos,
  },
  {
    termo: 'Estoque mínimo',
    explicacao:
      'A quantidade em que a peça precisa ser reposta. É ela que faz o aviso aparecer na tela inicial.',
    visivel: (p) => p.verCatalogo,
  },
  {
    termo: 'Peça reservada',
    explicacao:
      'A peça que já está prometida para uma OS em aberto. Ela continua na prateleira e só sai do estoque quando a OS for finalizada — mas o catálogo e a busca de peças mostram quanto sobra livre, para o balcão não vender o que está separado para uma moto.',
    visivel: (p) => p.verCatalogo,
  },
  {
    termo: 'Vistoria de entrada',
    explicacao:
      'O registro de como a moto chegou: o que estava OK, o que tinha avaria, o combustível e o que o cliente deixou. É opcional, e sai no PDF da OS.',
    visivel: (p) => p.verOrdensDaOficina || p.ehMecanico,
  },
  {
    termo: 'Ajuste de estoque',
    explicacao:
      'A correção de quando a prateleira não bate com o sistema. Fica registrada com o motivo, e é o que revela peça sumindo.',
    visivel: (p) => p.verCatalogo,
  },
  {
    termo: 'Extrato do estoque',
    explicacao:
      'A lista de tudo que entrou e saiu de uma peça, com a data e o motivo. Nada é apagado dele: cancelamento vira devolução.',
    visivel: (p) => p.verCatalogo,
  },
  {
    termo: 'Conta a receber',
    explicacao:
      'O que o cliente ainda deve por um serviço. Pode ser parcelada, e aceita pagamento pela metade.',
    visivel: (p) => p.verFinanceiro,
  },
  {
    termo: 'Atrasada',
    explicacao:
      'Conta em aberto cujo vencimento já passou. Ninguém marca: o sistema conta pelo calendário na hora de mostrar.',
    visivel: (p) => p.verFinanceiro,
  },
  {
    termo: 'Conversão',
    explicacao:
      'Quantos dos seus orçamentos viraram serviço. Conversão baixa costuma ser preço, demora na resposta ou orçamento confuso.',
    visivel: (p) => p.verPainel,
  },
  {
    termo: 'Ticket médio',
    explicacao: 'O valor médio dos orçamentos aprovados no período.',
    visivel: (p) => p.verPainel,
  },
  {
    termo: 'Indicador',
    explicacao:
      'Quem manda cliente para a oficina e ganha comissão por isso. Cada um tem um código, que o cliente fala no balcão.',
    visivel: (p) => p.ehAdmin,
  },
  {
    termo: 'Comissão',
    explicacao:
      'O que a oficina deve ao indicador. Nasce quando o orçamento é aprovado, e é cancelada se a ordem for cancelada.',
    visivel: (p) => p.ehAdmin,
  },
  {
    termo: 'Chave de acesso',
    explicacao:
      'Os 44 números que identificam uma nota fiscal. Estão embaixo do código de barras do DANFE e dentro do QR code.',
    visivel: (p) => p.verFinanceiro,
  },
  {
    termo: 'XML da nota',
    explicacao:
      'O arquivo que o fornecedor manda por e-mail junto com a nota. Importando ele, os itens entram sem digitação.',
    visivel: (p) => p.verFinanceiro,
  },
  {
    termo: 'Certificado A1',
    explicacao:
      'O arquivo que assina documentos no CNPJ da oficina, com validade de um ano. É comprado numa certificadora.',
    visivel: (p) => p.verConfiguracoes,
  },
]
