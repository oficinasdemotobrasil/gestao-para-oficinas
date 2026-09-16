-- 0059 — O certificado digital da oficina: o que se sabe, não o que ele é
--
-- Um certificado A1 assina documento legal em nome da empresa. Com ele se
-- emite nota fiscal no CNPJ do dono e se baixa da Sefaz tudo o que foi
-- emitido contra ele.
--
-- Por isso o arquivo NÃO mora aqui. Ele é aberto no aparelho de quem sobe,
-- conferido lá mesmo, e repassado direto ao serviço fiscal — sem passar pelo
-- nosso banco em momento nenhum. Um vazamento do nosso banco não entrega
-- poder de assinatura de ninguém, porque não tem o que entregar.
--
-- O que fica registrado responde a três perguntas que a tela precisa fazer,
-- e nenhuma delas exige o arquivo:
--   - já configurou?              (certificado_configurado_em)
--   - é o CNPJ certo?             (certificado_cnpj)
--   - quando para de funcionar?   (certificado_valido_ate)
--
-- A terceira é a que evita o pior cenário: a oficina descobrir que o
-- certificado venceu porque as notas simplesmente pararam de chegar.

alter table public.oficinas
  add column if not exists certificado_cnpj text
    check (certificado_cnpj is null or certificado_cnpj ~ '^\d{14}$'),
  add column if not exists certificado_titular text,
  add column if not exists certificado_valido_ate date,
  add column if not exists certificado_configurado_em timestamptz;

comment on column public.oficinas.certificado_cnpj is
  'CNPJ lido de dentro do certificado. Serve para conferir se é o da própria oficina — o arquivo nunca é guardado.';
comment on column public.oficinas.certificado_valido_ate is
  'Data de validade lida do certificado, para avisar antes de vencer em vez de deixar quebrar em silêncio.';

/*
 * Dias que faltam para o certificado vencer.
 *
 * Calculado na leitura, nunca gravado — mesma escolha de "atrasada" nas
 * contas e de "expirado" no orçamento. Gravar exigiria alguém rodando uma
 * tarefa todo dia, e um dia sem rodar mostraria certificado vencido como
 * válido, que é justamente o erro que este campo existe para evitar.
 */
create or replace function public.dias_para_vencer_certificado(p_oficina uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when o.certificado_valido_ate is null then null
    else (o.certificado_valido_ate - current_date)
  end
  from public.oficinas o
  where o.id = p_oficina;
$$;

revoke execute on function public.dias_para_vencer_certificado(uuid) from public, anon;
grant execute on function public.dias_para_vencer_certificado(uuid) to authenticated;

select public.conferir_fechadura();
