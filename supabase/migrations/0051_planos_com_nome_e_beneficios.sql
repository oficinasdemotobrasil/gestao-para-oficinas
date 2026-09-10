-- 0051 — Os planos ganham nome, benefícios e prazo de teste
--
-- Três mudanças, e duas delas não são texto:
--
-- 1. Os nomes viram o que o cliente entende: "Teste 7 Dias", "Operacional",
--    "Gestão Total" — em vez de gratuito/essencial/completo, que descrevem o
--    preço e não o uso. Os identificadores no banco continuam os mesmos: eles
--    são chave estrangeira em assinaturas e valor de enum em oficinas.
--
-- 2. Os limites de acesso mudam: Operacional passa de 5 para 2, e Gestão Total
--    ganha teto de 5 onde não tinha nenhum. É restrição, não acréscimo — quem
--    já estiver acima do novo teto continua funcionando (o gatilho só barra
--    quem passa a ocupar vaga nova), mas não cadastra mais ninguém.
--
-- 3. Os benefícios saem do código e entram na tabela. Texto de venda muda com
--    frequência, e mudar preço por SQL e frase por deploy seria ter dois
--    lugares para a mesma decisão.

alter table public.planos
  add column if not exists beneficios text[] not null default '{}',
  -- Quantos dias o plano dura sem cobrança. Só o de teste usa.
  add column if not exists dias_de_teste integer
    check (dias_de_teste is null or dias_de_teste > 0);

comment on column public.planos.beneficios is
  'O que a oficina lê no cartão do plano, na ordem. Some do código de propósito.';
comment on column public.planos.dias_de_teste is
  'Duração do teste, em dias. Nulo nos planos pagos.';

update public.planos set
  nome = 'Teste 7 Dias',
  descricao = 'Para conhecer o sistema sem compromisso.',
  limite_colaboradores = 2,
  dias_de_teste = 7,
  beneficios = array[
    'Liberado para até 2 pessoas testarem por 7 dias.',
    'Organize peças e serviços sem complicação.',
    'Foco total na bancada (sem módulo financeiro).'
  ],
  atualizado_em = now()
where id = 'gratuito';

update public.planos set
  nome = 'Operacional',
  descricao = 'A oficina organizada, do orçamento à entrega.',
  limite_colaboradores = 2,
  dias_de_teste = null,
  beneficios = array[
    'Até 2 acessos para organizar a operação diária.',
    'Envie propostas mais rápido direto no WhatsApp.',
    'Acompanhe o tempo de serviço de cada mecânico.',
    'Controle prático da oficina (sem módulo financeiro).'
  ],
  atualizado_em = now()
where id = 'essencial';

-- Duas frases aqui foram reescritas em relação ao texto original de venda, e o
-- motivo fica registrado: "envio automático de PIX" prometia automação que não
-- existe (a oficina gera e manda com um toque), e "lembretes para devedores"
-- prometia um recurso inexistente — há a lista de atrasadas e o botão de
-- cobrar, nada que avise sozinho. Em tela de pagamento, promessa é contrato.
update public.planos set
  nome = 'Gestão Total',
  descricao = 'Tudo, incluindo o dinheiro.',
  limite_colaboradores = 5,
  dias_de_teste = null,
  beneficios = array[
    'Até 5 acessos para integrar a equipe da oficina.',
    'Controle financeiro total (veja o fluxo de caixa real).',
    'Cobre por PIX e mande pelo WhatsApp num toque.',
    'Veja quem está devendo e cobre sem constrangimento.',
    'Peças, serviços e dinheiro 100% sob controle.'
  ],
  atualizado_em = now()
where id = 'completo';

select public.conferir_fechadura();
