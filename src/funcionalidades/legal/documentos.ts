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

export const VERSAO_DOS_DOCUMENTOS = '2026-09-10'
export const ATUALIZADO_EM = '10 de setembro de 2026'

export interface Secao {
  titulo: string
  paragrafos: string[]
}

export const TERMOS: Secao[] = [
  {
    titulo: 'Do que se trata',
    paragrafos: [
      'O Gestão para Oficinas é um sistema pela internet para oficinas de moto organizarem clientes, motos, orçamentos, ordens de serviço, estoque e financeiro.',
      'Estes termos valem entre quem fornece o sistema e a oficina que o contrata. Ao criar uma conta, a oficina concorda com eles.',
    ],
  },
  {
    titulo: 'A conta e quem responde por ela',
    paragrafos: [
      'A oficina indica um responsável, que é quem administra a conta: cadastra as outras pessoas, define o que cada uma pode fazer e cuida da assinatura.',
      'A senha é pessoal e intransferível. A oficina responde pelo que for feito com os acessos dela, então desative o acesso de quem sair da equipe.',
      'Cada plano permite uma quantidade de pessoas com acesso. Ela está descrita na tela de planos e é conferida pelo sistema.',
    ],
  },
  {
    titulo: 'Teste, pagamento e o que acontece se atrasar',
    paragrafos: [
      'A conta nova começa com um período de teste gratuito, cuja duração está na tela de planos. Não pedimos cartão para testar.',
      'Terminado o teste, o uso depende de assinatura mensal. O valor de cada plano está na tela de planos e pode mudar mediante aviso prévio; a mudança nunca vale para um período já pago.',
      'Se o pagamento atrasar, a oficina continua trabalhando normalmente durante sete dias de carência, com aviso na tela.',
      'Passada a carência, o acesso é bloqueado para registro: a oficina continua consultando tudo o que já cadastrou e continua podendo exportar seus dados, mas não registra nada novo até regularizar.',
      'Nenhum dado é apagado por falta de pagamento. Bloquear é impedir de escrever, não sumir com a informação.',
    ],
  },
  {
    titulo: 'Cancelar',
    paragrafos: [
      'A oficina pode cancelar quando quiser, pela própria tela de assinatura, sem multa e sem precisar falar com ninguém.',
      'O acesso continua até o fim do período já pago. Não devolvemos valor proporcional de um mês em andamento, e também não cortamos antes do prazo que a oficina comprou.',
      'Ao encerrar a conta, os dados ficam guardados por mais trinta dias, e nesse prazo dá para voltar atrás. Depois disso podem ser apagados definitivamente.',
    ],
  },
  {
    titulo: 'Os dados são da oficina',
    paragrafos: [
      'Tudo o que a oficina cadastra — clientes, motos, serviços, valores, histórico — é dela. Nós hospedamos e processamos, não somos donos.',
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
    ],
  },
  {
    titulo: 'O que não fazemos',
    paragrafos: [
      'Não vendemos, alugamos nem cedemos dados para terceiros.',
      'Não usamos os dados da oficina para publicidade, nem para treinar sistemas, nem para qualquer finalidade fora do funcionamento do serviço.',
      'Não guardamos número de cartão de crédito.',
      'A administração da plataforma enxerga dados de conta e de uso — nome da oficina, plano, situação, quantidade de ordens, último acesso. Não enxerga a carteira de clientes, o financeiro nem o histórico de serviços de nenhuma oficina. Isso não é promessa de conduta: é como o sistema foi construído, e há teste automático que falha se deixar de ser verdade.',
    ],
  },
  {
    titulo: 'Com quem compartilhamos',
    paragrafos: [
      'Apenas com os serviços necessários para o sistema existir, e apenas no que cada um precisa: hospedagem do aplicativo, banco de dados e autenticação, provedor de pagamento e serviço de envio de e-mail.',
      'Também compartilhamos quando a lei ou uma ordem judicial exigir.',
    ],
  },
  {
    titulo: 'Por quanto tempo',
    paragrafos: [
      'Enquanto a conta existir, os dados ficam guardados para a oficina usar.',
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
      'Para qualquer pedido sobre dados pessoais, escreva para o endereço de contato informado no site. Respondemos no prazo que a lei estabelece.',
    ],
  },
]
