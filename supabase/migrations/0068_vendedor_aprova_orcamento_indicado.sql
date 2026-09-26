-- 0068 — O vendedor volta a aprovar orçamento com indicador
--
-- O que estava quebrado: `aprovar_orcamento` roda com as permissões de quem
-- chama, e a política de `comissoes` é só de admin. O vendedor do balcão —
-- justamente quem anota o código que o cliente falou — salvava o orçamento,
-- apertava "O cliente aprovou" e a transação inteira voltava atrás com
-- 42501. Nem a OS nascia. Confirmado em produção antes desta correção.
--
-- Havia dois caminhos, e o mais curto era o pior:
--
-- 1. Abrir `comissoes` para o atendimento inserir. Resolve em duas linhas e
--    cria um buraco de dinheiro: o vendedor passa a poder inserir comissão
--    direto pela API, com o valor que quiser, para um indicador qualquer — e o
--    admin vê "a pagar" na tela dele e paga. Comissão não é dado que o balcão
--    digita; é consequência de uma aprovação.
--
-- 2. Deixar a tabela fechada e abrir uma fresta que só a aprovação atravessa.
--    É o que a 0060 já faz com o serviço antigo: a função marca uma chave de
--    sessão, a política exige essa chave, e a chave morre no fim da transação.
--    Ninguém alcança `set_config` de fora — o PostgREST só expõe função do
--    schema público —, então a fresta não existe para o cliente da API.
--
-- Fica o 2. E ele só funciona com um detalhe que custou uma investigação: o
-- `on conflict` do insert original tinha de sair. Ver o comentário dentro da
-- função.
--
-- A revisão desta migração achou mais duas coisas, das duas vezes por olhar a
-- aprovação como caminho de dinheiro e não como função isolada. As duas entram
-- aqui porque é o mesmo caminho e o mesmo clique:
--
-- * Dois cliques ao mesmo tempo criavam DUAS ordens de serviço do mesmo
--   orçamento. A conferência de status lia a linha sem travá-la, então as duas
--   chamadas passavam juntas. Com indicador a unique de `comissoes` segurava a
--   segunda por acidente; sem indicador, nada segurava.
--
-- * A base da comissão vinha de `orcamentos.valor_total`, que o atendimento
--   pode gravar direto pela API — testado: o vendedor gravou 50.000 num
--   orçamento cujos itens somam 50, sem erro. A comissão saía sobre o número
--   inflado. Agora a base é a soma dos itens, que é o que o cliente assinou.
--
-- O buraco maior desse segundo ponto continua aberto e é trabalho próprio:
-- `valor_total` não deveria ser escrevível pelo cliente da API em nenhuma
-- hipótese, porque dele saem também a OS e a conta a receber do cliente.

-- Uma ordem por orçamento ------------------------------------------------------
-- O `for update` lá embaixo resolve a corrida; este índice é a trava que não
-- depende de ninguém lembrar do `for update` na próxima vez que a função for
-- reescrita. Parcial porque OS avulsa, sem orçamento, é caminho legítimo.
-- Conferido em produção antes de criar: nenhum orçamento tem duas OS hoje.
create unique index if not exists ordens_servico_uma_por_orcamento
  on public.ordens_servico (orcamento_id)
  where orcamento_id is not null;

-- A fresta ---------------------------------------------------------------------
-- Só insert, e só com a chave. Ler, alterar e apagar continuam sendo do admin:
-- o vendedor não vê quanto a oficina deve a quem.
drop policy if exists "atendimento registra comissao ao aprovar" on public.comissoes;
create policy "atendimento registra comissao ao aprovar"
  on public.comissoes for insert to authenticated
  with check (
    oficina_id = public.oficina_do_usuario()
    and public.eh_atendimento()
    and current_setting('app.comissao_da_aprovacao', true) = 'sim'
  );

/*
 * A aprovação, agora marcando a chave em volta do insert.
 *
 * Corpo igual ao da 0065 — a diferença são as duas linhas de `set_config` em
 * volta do bloco da comissão. O escopo é a transação (terceiro argumento
 * `true`), então a chave não sobrevive à requisição nem vaza para a próxima
 * que reaproveitar a conexão.
 */
create or replace function public.aprovar_orcamento(
  p_orcamento_id uuid,
  p_responsavel_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_orc record;
  v_os_id uuid;
  v_percentual numeric(5, 2);
  v_base numeric(12, 2);
begin
  -- `for update` trava a linha do orçamento até o fim da transação. Sem ele,
  -- dois cliques simultâneos passavam juntos pela conferência de status abaixo
  -- e nasciam duas OS. Agora o segundo espera, lê 'aprovado' e é recusado com a
  -- mensagem que a pessoa entende.
  select * into v_orc from public.orcamentos where id = p_orcamento_id for update;
  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'no_data_found';
  end if;

  if v_orc.status = 'aprovado' then
    raise exception 'Este orçamento já foi aprovado.' using errcode = 'check_violation';
  end if;
  if v_orc.status = 'recusado' then
    raise exception 'Este orçamento foi recusado e não pode ser aprovado.' using errcode = 'check_violation';
  end if;

  insert into public.ordens_servico
    (oficina_id, orcamento_id, cliente_id, moto_id, responsavel_id, status,
     km_entrada, garantia_ate, observacoes,
     desconto, desconto_tipo, valor_total)
  values
    (v_orc.oficina_id, v_orc.id, v_orc.cliente_id, v_orc.moto_id, p_responsavel_id,
     'aberta', v_orc.km_registrado, current_date + v_orc.garantia_dias, v_orc.observacoes,
     case when v_orc.desconto_percentual is not null
          then v_orc.desconto_percentual else coalesce(v_orc.desconto, 0) end,
     case when v_orc.desconto_percentual is not null then 'percentual' else 'valor' end,
     0)
  returning id into v_os_id;

  insert into public.os_itens
    (oficina_id, ordem_servico_id, tipo, produto_id, servico_id, descricao,
     quantidade, valor_unitario, valor_total)
  select oficina_id, v_os_id, tipo, produto_id, servico_id, descricao,
         quantidade, valor_unitario, valor_total
  from public.orcamento_itens
  where orcamento_id = p_orcamento_id;

  update public.ordens_servico
     set valor_total = v_orc.valor_total
   where id = v_os_id;

  update public.orcamentos set status = 'aprovado' where id = p_orcamento_id;

  -- A comissão do indicador ---------------------------------------------------
  if v_orc.indicador_id is not null then
    select coalesce(i.percentual, o.comissao_indicador_percentual)
      into v_percentual
    from public.indicadores i
    join public.oficinas o on o.id = i.oficina_id
    where i.id = v_orc.indicador_id;

    /*
     * A base é a soma dos itens, não `orcamentos.valor_total`.
     *
     * A política de orçamentos é `for all` para o atendimento, sem recorte de
     * coluna, então o vendedor grava `valor_total` direto pela API — testado em
     * produção: 50.000 num orçamento de 50 reais, sem erro. Usando aquele campo,
     * a comissão saía sobre o número inflado, e comissão é dinheiro que sai da
     * oficina para fora.
     *
     * A soma dos itens é o que o cliente viu e aprovou. Nos orçamentos honestos
     * os dois números são o mesmo, porque `salvar_orcamento_com_itens` calcula
     * `valor_total` exatamente assim.
     */
    select greatest(coalesce(sum(valor_total), 0) - coalesce(v_orc.desconto, 0), 0)
      into v_base
    from public.orcamento_itens
    where orcamento_id = v_orc.id;

    perform set_config('app.comissao_da_aprovacao', 'sim', true);

    /*
     * Sem `on conflict` — e isto é a segunda metade da correção.
     *
     * A 0065 tinha `on conflict (orcamento_id) do nothing` para evitar erro
     * feio se alguém aprovasse duas vezes. Com ele, a política de insert passava
     * e o `on conflict` recusava em seguida, com a mesma mensagem de RLS — foi
     * por isso que abrir a política, sozinho, não resolveu.
     *
     * A causa foi medida, não deduzida, porque a documentação só fala de
     * SELECT no `DO UPDATE`: o mesmo insert, com a mesma chave, na mesma
     * transação, foi testado nas quatro combinações. Ele só passa com
     * `on conflict` quando existe política de SELECT para quem insere — e o
     * vendedor não lê `comissoes`, de propósito.
     *
     * Aprovar duas vezes já está barrado lá em cima, pelo status do orçamento.
     * O que sobra é a unique de `orcamento_id`, que é a trava de verdade: numa
     * corrida de dois cliques simultâneos ela recusa o segundo e a transação
     * inteira volta atrás — que é exatamente o certo para dinheiro.
     */
    insert into public.comissoes
      (oficina_id, indicador_id, orcamento_id, ordem_servico_id, base, percentual, valor)
    values
      (v_orc.oficina_id, v_orc.indicador_id, v_orc.id, v_os_id,
       v_base, v_percentual,
       round(v_base * v_percentual / 100, 2));

    perform set_config('app.comissao_da_aprovacao', '', true);
  end if;

  return v_os_id;
end;
$$;

select public.conferir_fechadura();
