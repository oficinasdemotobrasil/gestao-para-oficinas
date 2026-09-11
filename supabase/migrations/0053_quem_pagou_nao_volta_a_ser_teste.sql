-- 0053 — Quem pagou não volta a ser "teste"
--
-- A definição anterior era "está em teste quem não tem assinatura ativa". Ela
-- quebra no caso mais comum do mundo: a oficina paga, cancela a renovação, e
-- passa a aparecer como se nunca tivesse pago — com a faixa "seu teste termina
-- em 33 dias" no topo da tela, depois de ter pago trinta reais.
--
-- A definição certa olha para o ACESSO, não para o contrato: é teste enquanto
-- o acesso vier do teste. No instante em que um pagamento empurra a data para
-- além do prazo de teste, acabou — e cancelar depois não desfaz o que foi pago,
-- porque o acesso comprado continua valendo até o fim.
--
--   acesso_ate = teste_ate  → o que sustenta o acesso é o teste
--   acesso_ate > teste_ate  → o que sustenta o acesso é dinheiro

create or replace function public.situacao_da_oficina(p_oficina uuid)
returns public.status_oficina
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- Decisão de gente manda sobre qualquer cálculo.
    when o.status in ('suspensa', 'cancelada') then o.status
    -- Sem prazo: nada vence. É o estado de quem ainda não entrou na cobrança.
    when o.acesso_ate is null then 'ativa'::public.status_oficina
    when current_date <= o.acesso_ate then
      case
        -- Nunca houve teste, ou o acesso já passou do que o teste dava.
        when o.teste_ate is null or o.acesso_ate > o.teste_ate
          then 'ativa'::public.status_oficina
        else 'teste'::public.status_oficina
      end
    -- Sete dias de carência: continua registrando, com aviso no topo.
    when current_date <= o.acesso_ate + 7 then 'atrasada'::public.status_oficina
    else 'bloqueada'::public.status_oficina
  end
  from public.oficinas o
  where o.id = p_oficina;
$$;

comment on function public.situacao_da_oficina is
  'A situação de hoje, calculada das datas. É teste só enquanto o acesso vier do teste.';

select public.conferir_fechadura();
