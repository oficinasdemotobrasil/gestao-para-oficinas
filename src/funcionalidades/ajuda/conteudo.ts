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
      'Toque em "Criar orçamento" e depois em "Enviar no WhatsApp".',
    ],
    atencao:
      'Enquanto não for aprovado, o orçamento pode ser editado. Depois de aprovado, não — porque a ordem de serviço já nasceu dele.',
    visivel: (p) => p.editarOrcamentos,
  },
  {
    id: 'aprovar',
    secao: 'Atendimento',
    titulo: 'O cliente aprovou: virar ordem de serviço',
    resumo: 'Aprovar cria a OS com os mesmos itens e reserva o serviço para um responsável.',
    passos: [
      'Abra o orçamento e toque em "Aprovar".',
      'Escolha quem vai executar o serviço.',
      'A ordem de serviço nasce aberta, com os itens do orçamento e o valor aprovado.',
    ],
    atencao:
      'Se o orçamento tiver um indicador, a comissão dele nasce agora. Cancelar a ordem depois cancela a comissão.',
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
    id: 'andamento-os',
    secao: 'Serviço',
    titulo: 'Tocar a ordem de serviço até o fim',
    resumo: 'Cada passo fica registrado com quem deu e quando — inclusive o tempo na bancada.',
    passos: [
      'Abra a OS e toque em "Começar" quando o serviço entrar na bancada. O relógio começa a contar.',
      '"Pausar" para quando parar, "Retomar" para voltar.',
      'O mecânico marca cada item como feito enquanto trabalha.',
      'Quando terminar, ele toca em "Pronta para conferência".',
      'Quem confere toca em "Finalizar" — é aqui que as peças saem do estoque.',
      'Ao entregar a moto, toque em "Entregar".',
    ],
    atencao:
      'Finalizar e cancelar são de quem atende, não do mecânico: é o passo que mexe no estoque e no dinheiro.',
    visivel: (p) => p.verOrdensDaOficina || p.ehMecanico,
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
      'Toque em "Ajustar estoque".',
      'Informe a quantidade que EXISTE de verdade na prateleira e o motivo.',
    ],
    atencao:
      'O extrato guarda todo ajuste. É por ele que se descobre se a peça está sumindo, e quando começou.',
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
      'Quando o cliente pagar, abra Financeiro e toque em "Receber".',
      'Se ele pagou só uma parte, informe o valor: a conta continua aberta pelo resto.',
    ],
    atencao:
      'Conta vencida aparece como "atrasada" sozinha, pela data. Ninguém precisa marcar nada.',
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
      'Menu → Catálogo → "Nova peça" ou "Novo serviço".',
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
      'A pessoa recebe um e-mail para criar a senha.',
    ],
    atencao:
      'O mecânico não vê dinheiro em lugar nenhum do app. É de propósito.',
    visivel: (p) => p.editarColaboradores,
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
      'A moto saiu da oficina. É o fim do caminho da OS, e a partir daí ela não muda mais.',
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
