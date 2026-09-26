-- 0072 — O histórico escreve o dinheiro em português
--
-- `to_char` com os símbolos G e D segue o idioma do servidor, e o Supabase roda
-- em inglês (`lc_numeric = en_US.UTF-8`). O texto que a 0071 grava no histórico
-- de correções saía "R$ 1,234.50" — vírgula de milhar e ponto de decimal — e é
-- esse texto que o dono da oficina lê na tela quando vai conferir quem mexeu no
-- recebimento.
--
-- Com os separadores escritos à mão no formato e um `translate` trocando os
-- dois, a conta deixa de depender de como o servidor está configurado. É a
-- mesma técnica que se usa para não depender de fuso: não pergunte ao ambiente
-- o que você já sabe.
--
-- A função também deixa de ser `immutable`. `to_char` é `stable` justamente por
-- olhar a configuração do servidor, e uma função que mente sobre isso pode ser
-- congelada num índice e devolver o valor errado depois. Aqui ela nunca foi
-- indexada, mas a etiqueta estava errada e etiqueta errada é dívida que vence
-- quando alguém confia nela.

create or replace function public.descrever_recebimento(
  p_forma text, p_valor numeric, p_data date
)
returns text
language sql
stable
as $$
  select concat_ws(
    ', ',
    coalesce(nullif(p_forma, ''), 'sem forma informada'),
    -- Formata no padrão americano, de propósito, e troca os dois separadores.
    'R$ ' || translate(to_char(p_valor, 'FM999,999,990.00'), ',.', '.,'),
    case when p_data is null then null else 'em ' || to_char(p_data, 'DD/MM/YYYY') end
  );
$$;

select public.conferir_fechadura();
