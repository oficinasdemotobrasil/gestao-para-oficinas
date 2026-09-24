-- 0067 — O cartão do teste passa a dizer o que o teste entrega
--
-- A 0066 abriu o sistema inteiro durante os 7 dias, mas o texto do plano
-- continuou o de antes: "Foco total na bancada (sem módulo financeiro)" e
-- "até 2 pessoas". Ou seja, a tela de planos prometia MENOS do que o produto
-- entrega.
--
-- Prometer a menos parece inofensivo e não é: quem lê isso escolhe o plano
-- pago errado, ou desiste de testar justamente a parte que faria ele assinar.
-- Em tela de venda, o texto é contrato nos dois sentidos.
--
-- O limite de pessoas acompanha o mesmo raciocínio: durante o teste vale o
-- maior de todos (0066), então o cartão passa a dizer 5, que é o número que a
-- oficina vai conseguir usar de verdade.
--
-- `tem_financeiro` também passa a TRUE, por decisão do dono do produto: o
-- plano de teste É a versão completa enquanto dura. A consequência fica
-- registrada: o financeiro deixa de depender do prazo do teste, então uma
-- oficina parada neste plano continuaria com ele aberto. Na prática o acesso
-- fecha por outro caminho — vencido o teste ela vira atrasada e depois
-- bloqueada —, mas quem mexer nisso depois precisa saber que a trava do
-- dinheiro aqui é a do ACESSO, não a do plano.

update public.planos set
  descricao = 'Sete dias com o sistema inteiro, sem cartão.',
  limite_colaboradores = 5,
  tem_financeiro = true,
  beneficios = array[
    'Tudo liberado por 7 dias, inclusive o financeiro.',
    'Até 5 acessos para a equipe toda testar junto.',
    'Sem cartão: só paga se decidir ficar.',
    'No fim do teste, você escolhe o plano que serve.'
  ],
  atualizado_em = now()
where id = 'gratuito';

select public.conferir_fechadura();
