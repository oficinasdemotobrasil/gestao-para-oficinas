-- 0043 — As situações que a cobrança precisa
--
-- Hoje a oficina só pode estar ativa, suspensa ou cancelada. A cobrança traz
-- três estados que não existem:
--
--   teste      — os 14 primeiros dias, sem cartão
--   atrasada   — venceu e ainda escreve, durante a carência de 7 dias
--   bloqueada  — a carência acabou: continua lendo tudo, não registra nada
--
-- A ordem importa e não é decorativa: o Postgres ordena enum pela ordem de
-- declaração, e o painel da plataforma ordena a lista por situação. Do mais
-- tranquilo ao mais grave é a leitura que serve para quem opera.
--
-- Ordem final: teste, ativa, atrasada, bloqueada, suspensa, cancelada.
--
-- Sozinho neste arquivo por obrigação do Postgres: valor novo de enum não pode
-- ser usado na mesma transação em que foi criado. Mesma razão da 0016 e da 0027.

alter type public.status_oficina add value if not exists 'teste' before 'ativa';
alter type public.status_oficina add value if not exists 'atrasada' after 'ativa';
alter type public.status_oficina add value if not exists 'bloqueada' after 'atrasada';
