-- 0035 — A cidade da oficina, que o PIX exige
--
-- O BR Code do Banco Central tem campo obrigatório para a cidade do recebedor
-- (campo 60). Não é enfeite: alguns bancos recusam o código sem ela, e outros
-- mostram a cobrança sem dizer de onde é.
--
-- Fica coluna própria em vez de sair do endereço: "Av. Recife, 1200 — Areias,
-- Recife/PE" é texto livre, e adivinhar a cidade dali erraria um dia, num
-- código que o cliente já tentou pagar.

alter table public.oficinas
  add column if not exists cidade text;

comment on column public.oficinas.cidade is
  'Cidade do recebedor no BR Code do PIX (campo 60). Máximo 15 caracteres no padrão.';
