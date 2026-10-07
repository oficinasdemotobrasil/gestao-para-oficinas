/**
 * Os documentos legais, em texto e com versão.
 *
 * A versão é o que dá sentido ao aceite: guardar "aceitou em 12/09" sem saber
 * O QUÊ foi aceito não prova nada no dia de uma discussão. Quando o texto
 * mudar, a versão muda junto, e quem aceitou a anterior aparece na consulta.
 *
 * Regra para mexer aqui: qualquer alteração que mude uma obrigação — prazo,
 * responsabilidade, quem pode o quê — exige subir a versão. Corrigir uma
 * vírgula, não.
 *
 * ATENÇÃO: este texto foi escrito em linguagem simples e descreve com
 * fidelidade o que o sistema faz, mas NÃO passou por advogado. Antes de abrir
 * cadastro para clientes que não sejam o piloto, ele precisa de revisão
 * jurídica — principalmente as partes de responsabilidade e rescisão.
 */

export const VERSAO_DOS_DOCUMENTOS = '2026-10-07'
export const ATUALIZADO_EM = '7 de outubro de 2026'

/**
 * Quem fornece e onde falar. Sem CNPJ por enquanto (05/10/2026): quando a
 * empresa estiver aberta, o nome empresarial e o CNPJ entram aqui — a lei de
 * comércio eletrônico (Decreto 7.962/2013) pede os dois.
 */
export const FORNECEDOR = 'PLYVO'
export const CONTATO = 'contato@plyvo.ai'

export interface Secao {
  titulo: string
  paragrafos: string[]
}

export const TERMOS: Secao[] = [
  {
    titulo: 'Do que se trata',
    paragrafos: [
      'O GIRO é um sistema pela internet para oficinas de moto organizarem clientes, motos, orçamentos, ordens de serviço, estoque e financeiro.',
      `Estes termos valem entre a ${FORNECEDOR}, que fornece o sistema, e a oficina que o contrata. Ao criar uma conta, a oficina concorda com eles. Contato: ${CONTATO}.`,
    ],
  },
  {
    titulo: 'A conta e quem responde por ela',
    paragrafos: [
      'A oficina indica um responsável, que é quem administra a conta: cadastra as outras pessoas, define o que cada uma pode fazer e cuida da assinatura.',
      'A senha é pessoal e intransferível. A oficina responde pelo que for feito com os acessos dela, então desative o acesso de quem sair da equipe.',
      'O plano permite uma quantidade de pessoas com acesso. Ela está descrita na tela de assinatura e é conferida pelo sistema.',
    ],
  },
  {
    titulo: 'Teste, pagamento e o que acontece se atrasar',
    paragrafos: [
      'A conta nova começa com um período de teste gratuito, cuja duração está na tela de assinatura. Não pedimos cartão para testar.',
      'Terminado o teste, o uso depende de pagamento. Há um plano só, com tudo liberado, e a oficina escolhe o período: mensal, trimestral, anual ou vitalício. Os valores estão na tela de assinatura.',
      'O mensal, o trimestral e o anual à vista renovam sozinhos ao fim de cada período, até a oficina cancelar.',
      'O anual e o vitalício podem ser parcelados em até 12 vezes no cartão de crédito. A taxa do parcelamento cobrada pelo cartão fica por conta da oficina, e o valor total de cada opção aparece na tela antes do pagamento. O anual parcelado não renova sozinho: um mês antes de vencer, a renovação aparece na tela de assinatura.',
      'Os preços podem mudar, com aviso de pelo menos 30 dias. Quem já assina mantém o valor que contratou enquanto a assinatura estiver ativa, e a mudança nunca vale para um período já pago.',
      'Se o pagamento atrasar, a oficina continua trabalhando normalmente durante sete dias de carência, com aviso na tela.',
      'Passada a carência, o acesso é bloqueado para registro: a oficina continua consultando tudo o que já cadastrou e continua podendo exportar seus dados, mas não registra nada novo até regularizar.',
      'Nenhum dado é apagado por falta de pagamento. Bloquear é impedir de escrever, não sumir com a informação.',
    ],
  },
  {
    titulo: 'Desistir nos primeiros sete dias',
    paragrafos: [
      'A contratação é feita pela internet, então vale o direito de arrependimento do Código de Defesa do Consumidor: dentro de sete dias corridos a partir do pagamento, a oficina pode desistir e receber de volta o valor pago, integralmente. Vale para qualquer período, inclusive o vitalício.',
      `Para isso, a oficina cancela pela tela de assinatura dentro desse prazo, confirmando com a senha da conta, e envia para ${CONTATO} cópia legível de documento oficial com foto do titular cadastrado e comprovante de residência recente, para a conferência dos dados e a prevenção de fraudes. Conferidos os documentos, a devolução integral é feita pelo mesmo meio do pagamento, em até 30 dias úteis; no cartão parcelado, as parcelas são estornadas.`,
      'Esse prazo é separado do período de teste gratuito: o teste vem antes de qualquer cobrança, e o arrependimento conta a partir do dia em que a assinatura começou.',
      'O direito é da contratação: os sete dias contam do primeiro pagamento da assinatura. As renovações automáticas seguintes — o segundo mês, o segundo trimestre, o segundo ano — não reabrem o prazo, e cancelar depois disso segue a regra abaixo, sem devolução.',
    ],
  },
  {
    titulo: 'Cancelar',
    paragrafos: [
      'Passados os sete dias de arrependimento, a oficina pode cancelar quando quiser, pela própria tela de assinatura, sem multa e sem precisar falar com ninguém. O cancelamento é confirmado com a senha da conta.',
      'O acesso continua até o fim do período já pago. Não devolvemos valor proporcional do período em andamento — seja o mês, o trimestre ou o ano —, e também não cortamos antes do prazo que a oficina comprou.',
      'No anual parcelado, cancelar não interrompe as parcelas que faltam, porque o ano foi comprado de uma vez; o acesso vai até o fim desse ano.',
      'Ao encerrar a conta, os dados ficam guardados por mais trinta dias, e nesse prazo dá para voltar atrás. Depois disso podem ser apagados definitivamente.',
    ],
  },
  {
    titulo: 'O vitalício',
    paragrafos: [
      'O vitalício é um pagamento único que dá acesso ao GIRO enquanto ele estiver em operação, sem mensalidade. As vagas são limitadas, e o número que resta aparece na tela.',
      'Inclui tudo o que o plano tem e as melhorias que vierem para ele. Não inclui serviços que venham a ser cobrados à parte de todos os clientes, como emissão de nota fiscal, recursos com custo por uso ou envio de SMS.',
      'O vitalício fica ligado à oficina que o comprou e não pode ser passado para outra empresa. Se a oficina mudar de dono, ele continua com ela.',
      'Passados os sete dias de arrependimento, o valor do vitalício não é devolvido.',
      'Se um dia o GIRO for encerrar suas atividades, avisaremos com pelo menos 90 dias de antecedência, e a oficina poderá baixar todos os seus dados nesse período. Nesse caso, o valor pago pelo vitalício não é devolvido.',
    ],
  },
  {
    titulo: 'Suporte dentro da conta',
    paragrafos: [
      `Quando a oficina pede ajuda — pela tela de Ajuda ou pelo e-mail ${CONTATO} —, nossa equipe pode entrar na conta dela para ver o problema de perto e resolvê-lo.`,
      'Esse acesso tem o motivo registrado, dura no máximo 30 minutos e se encerra sozinho. Fica guardado quem entrou, quando e por quê. O que a equipe fizer na conta aparece com o nome "Suporte GIRO".',
    ],
  },
  {
    titulo: 'Os dados são da oficina',
    paragrafos: [
      'Tudo o que a oficina cadastra — clientes, motos, serviços, valores, histórico, fotos — é dela. Nós hospedamos e processamos, não somos donos.',
      'As fotos das ordens de serviço ficam guardadas enquanto durar a garantia do serviço, e no mínimo 30 dias depois da entrega da moto. Depois disso são apagadas automaticamente. Cada plano tem um limite de fotos guardadas ao mesmo tempo, informado na tela.',
      'A oficina pode baixar tudo em planilha a qualquer momento, em qualquer situação da conta, inclusive encerrada. O botão fica em Configurações.',
      'Não vendemos, alugamos nem cedemos esses dados para ninguém, e não os usamos para outra finalidade que não seja fazer o sistema funcionar para a própria oficina.',
    ],
  },
  {
    titulo: 'O que garantimos, e o que não',
    paragrafos: [
      'Trabalhamos para o sistema ficar disponível e íntegro, com cópias de segurança e correção de falhas. Não prometemos funcionamento ininterrupto: internet, provedores e serviços de terceiros podem falhar.',
      'O sistema é uma ferramenta de organização. Ele não substitui contador, advogado nem obrigação fiscal, e os números que ele mostra dependem do que foi cadastrado.',
      'Não respondemos por prejuízo causado por informação cadastrada errada, por acesso feito com senha da própria oficina, nem por decisão tomada com base em relatório do sistema.',
    ],
  },
  {
    titulo: 'Uso indevido',
    paragrafos: [
      'É proibido usar o sistema para atividade ilegal, tentar acessar dados de outra oficina, sobrecarregar a infraestrutura de propósito ou revender o acesso sem autorização.',
      'Nesses casos a conta pode ser suspensa. Mesmo suspensa, a oficina continua podendo exportar os próprios dados.',
    ],
  },
  {
    titulo: 'Mudanças nestes termos',
    paragrafos: [
      'Se estes termos mudarem de forma relevante, avisamos por e-mail e dentro do sistema antes de a mudança valer.',
      'A versão vigente e a data da última atualização ficam sempre no topo desta página.',
    ],
  },
  {
    titulo: 'Foro',
    paragrafos: [
      'Fica eleito o foro da comarca do Recife, Pernambuco, para resolver qualquer questão sobre estes termos, sem prejuízo do direito do consumidor de recorrer ao foro do seu domicílio.',
    ],
  },
]

export const PRIVACIDADE: Secao[] = [
  {
    titulo: 'Quem é quem',
    paragrafos: [
      'Esta política explica como tratamos dados pessoais, seguindo a Lei Geral de Proteção de Dados (Lei 13.709/2018).',
      'Sobre os dados dos clientes da oficina — nome, telefone, e-mail, CPF, placa, histórico de serviço — quem decide o que coletar e por quê é a própria oficina. Ela é a controladora; nós somos o operador, e só tratamos esses dados para fazer o sistema funcionar para ela.',
      'Sobre os dados de quem usa o sistema — o responsável e a equipe da oficina — nós somos os controladores.',
    ],
  },
  {
    titulo: 'O que guardamos',
    paragrafos: [
      'Da oficina: nome, CNPJ ou CPF, telefone, endereço, cidade, logo e cor da marca.',
      'De quem usa: nome, e-mail, telefone e perfil de acesso. A senha é guardada cifrada pelo serviço de autenticação; nós não a vemos e não conseguimos recuperá-la.',
      'Do uso: data do último acesso, quantidade de ordens e orçamentos por mês. Servem para suporte e para entender se a oficina está conseguindo usar o sistema.',
      'Da cobrança: os identificadores da assinatura no provedor de pagamento e o registro dos eventos de cobrança. Dados de cartão nunca passam por nós — quem os recebe e guarda é o provedor.',
      'Dos e-mails: o registro de cada mensagem enviada, com data, destinatário, assunto e resultado. É o que permite responder quando alguém diz que não recebeu.',
      'Das ordens de serviço: as fotos que a oficina tirar da moto e a vistoria de entrada. As fotos ficam numa área privada, que só a própria oficina enxerga, e podem mostrar a placa e o estado da moto.',
      'Do suporte: quando nossa equipe entra numa conta para dar suporte, guardamos quem entrou, quando e o motivo.',
      `Da devolução por arrependimento: quem pede a devolução nos sete dias da contratação envia para ${CONTATO} cópia de documento oficial com foto e comprovante de residência. Usamos esses documentos só para conferir a titularidade e prevenir fraude no estorno, e os guardamos pelo tempo necessário para comprovar a devolução.`,
    ],
  },
  {
    titulo: 'O que não fazemos',
    paragrafos: [
      'Não vendemos, alugamos nem cedemos dados para terceiros.',
      'Não usamos os dados da oficina para publicidade, nem para treinar sistemas, nem para qualquer finalidade fora do funcionamento do serviço.',
      'Não guardamos número de cartão de crédito.',
      'No dia a dia, a administração da plataforma enxerga só dados de conta e de uso — nome da oficina, plano, situação, quantidade de ordens, último acesso. Não enxerga a carteira de clientes, o financeiro nem o histórico de serviços de nenhuma oficina, e isso é garantido pelo próprio banco de dados, com teste automático que falha se deixar de ser verdade.',
      `A única exceção é o suporte: quando a oficina pede ajuda, pela tela de Ajuda ou pelo e-mail ${CONTATO}, nossa equipe pode entrar na conta dela para resolver o problema. Esse acesso tem o motivo registrado, dura no máximo 30 minutos, se encerra sozinho e fica registrado com quem entrou e quando.`,
    ],
  },
  {
    titulo: 'Com quem compartilhamos',
    paragrafos: [
      'Apenas com os serviços necessários para o sistema existir, e apenas no que cada um precisa: hospedagem do aplicativo, banco de dados e autenticação, armazenamento das fotos, provedor de pagamento e serviço de envio de e-mail.',
      'Quando a oficina pede para a inteligência artificial redigir o texto de um orçamento, enviamos ao serviço de IA (Google) apenas o nome da oficina e os itens com os valores daquele orçamento. Nome, telefone, placa ou qualquer outro dado do cliente nunca são enviados.',
      'Também compartilhamos quando a lei ou uma ordem judicial exigir.',
    ],
  },
  {
    titulo: 'Por quanto tempo',
    paragrafos: [
      'Enquanto a conta existir, os dados ficam guardados para a oficina usar.',
      'As fotos das ordens de serviço são a exceção: ficam enquanto durar a garantia do serviço, e no mínimo 30 dias depois da entrega da moto. Depois são apagadas automaticamente.',
      'Pedido o encerramento, os dados ficam por mais trinta dias — prazo para a oficina mudar de ideia ou baixar o que precisar. Depois disso podem ser apagados definitivamente.',
      'Registros que a lei mandar guardar por mais tempo, como os de cobrança, são mantidos pelo prazo legal.',
    ],
  },
  {
    titulo: 'Seus direitos',
    paragrafos: [
      'Quem usa o sistema pode pedir acesso, correção ou exclusão dos próprios dados, e saber com quem eles foram compartilhados.',
      'A oficina pode baixar todos os dados dela em planilha a qualquer momento, sem pedir nada a ninguém, em Configurações.',
      'O cliente da oficina que quiser exercer seus direitos deve procurar a própria oficina, que é quem decide sobre esses dados. Se ela nos pedir, ajudamos a atender.',
    ],
  },
  {
    titulo: 'Segurança',
    paragrafos: [
      'Cada oficina só enxerga os próprios dados, e essa separação é feita pelo banco de dados, não pela tela — o que significa que ela vale mesmo se o aplicativo tiver um defeito.',
      'Dentro da oficina, o acesso é por perfil: quem é mecânico não vê preço de custo nem financeiro.',
      'O tráfego é cifrado e as senhas são guardadas com algoritmo próprio para senha, pelo serviço de autenticação.',
      'Nenhum sistema é imune. Se acontecer um incidente que possa trazer risco relevante, avisamos os afetados e a autoridade competente, como a lei exige.',
    ],
  },
  {
    titulo: 'Falar com a gente',
    paragrafos: [
      `Para qualquer pedido sobre dados pessoais, escreva para ${CONTATO}. Respondemos no prazo que a lei estabelece.`,
    ],
  },
]

/**
 * O aviso que aparece a quem cancela dentro dos 7 dias da contratação.
 *
 * Texto do Ed (07/10/2026), mostrado na tela de assinatura ao confirmar o
 * cancelamento. O prazo é da CONTRATAÇÃO — sete dias do primeiro pagamento
 * da assinatura; as renovações não reabrem —, e quem decide se está no prazo
 * é o servidor, pelo aviso de pagamento que ele mesmo aplicou.
 */
export interface BlocoDoAviso {
  titulo?: string
  paragrafos: string[]
  itens?: string[]
}

export const AVISO_DE_ARREPENDIMENTO: { titulo: string; blocos: BlocoDoAviso[] } = {
  titulo: 'Notificação de Direito de Arrependimento – Código de Defesa do Consumidor',
  blocos: [
    {
      paragrafos: [
        'Prezado(a) Cliente,',
        'Comunicamos que Vossa Senhoria encontra-se atualmente resguardada pelo direito potestativo de arrependimento, conforme preceitua o artigo 49 da Lei n. 8.078/1990 (Código de Defesa do Consumidor), o qual assegura ao consumidor a faculdade de rescindir o contrato firmado fora do estabelecimento comercial, em especial por meio eletrônico, no prazo impreterível de 7 (sete) dias corridos, contados a partir da data de aquisição ou do ato de recebimento do produto/serviço, sem que isso acarrete qualquer ônus ou penalidade.',
        'Para a efetivação do respectivo estorno integral dos valores desembolsados, faz-se necessária a instrução do procedimento administrativo de reembolso mediante o envio da documentação comprobatória indispensável à validação cadastral e à segurança jurídica da transação.',
      ],
    },
    {
      titulo: 'Instruções para a Restituição de Valores',
      paragrafos: [
        `Para dar andamento ao pleito de rescisão e restituição, solicitamos o encaminhamento tempestivo dos seguintes documentos digitalizados para o canal oficial de atendimento eletrônico: ${CONTATO}:`,
      ],
      itens: [
        'Documento de Identificação Oficial com Foto: Cópia legível (frente e verso) do documento cadastrado no sistema (RG, CNH ou equivalente legal).',
        'Comprovante de Residência Atualizado: Fatura recente de concessionária de serviços públicos (água, luz, telefonia ou internet) ou documento equivalente emitido nos últimos 30 (noventa) dias, comprovando a titularidade e o endereço cadastrados.',
      ],
    },
    {
      titulo: 'Prazos e Condições',
      paragrafos: [
        'Uma vez recepcionados os documentos exigidos e constatada a regularidade das informações prestadas, a empresa procederá com a restituição integral da quantia paga, utilizando o mesmo meio de pagamento empregado na transação original, no prazo legal de até 30 (trinta) dias úteis.',
        'Ressaltamos que o procedimento restará condicionado à conferência estrita dos dados para fins de prevenção a fraudes e conformidade com as diretrizes de segurança da informação e proteção de dados (LGPD).',
        'Permanecemos à inteira disposição para eventuais esclarecimentos adicionais por meio de nossos canais oficiais de suporte.',
      ],
    },
  ],
}
