-- 0052 — O aceite dos termos, com data e versão
--
-- Guardar "aceitou em 12/09" sem saber O QUÊ foi aceito não prova nada no dia
-- de uma discussão: o texto muda, e a data sozinha aponta para o documento de
-- hoje, não para o que a pessoa leu. Por isso a versão vai junto.
--
-- Não guardamos endereço de IP. Ele seria mais uma prova, e é o tipo de dado
-- pessoal que se coleta "por precaução" e depois se justifica para sempre. A
-- data, a versão e a identidade de quem aceitou bastam — e coletar o mínimo é
-- a postura que a própria política de privacidade promete.

alter table public.oficinas
  add column if not exists termos_aceitos_em timestamptz,
  add column if not exists termos_versao text;

comment on column public.oficinas.termos_aceitos_em is
  'Quando a oficina aceitou os termos. Nulo nas contas criadas antes do cadastro público.';
comment on column public.oficinas.termos_versao is
  'Qual versão do documento foi aceita. Sem ela, a data não prova nada.';

-- A oficina não muda isso pela tela ---------------------------------------------
-- A política de update deixa o admin editar a própria linha; sem esta trava ele
-- apagaria ou adiantaria o próprio aceite com um PATCH. Quem escreve é o
-- cadastro, com a service_role, no momento em que a caixa é marcada.
create or replace function public.proteger_aceite_dos_termos()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.termos_aceitos_em is distinct from old.termos_aceitos_em
     or new.termos_versao is distinct from old.termos_versao then
    raise exception 'O aceite dos termos não se edita.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists oficinas_proteger_aceite on public.oficinas;
create trigger oficinas_proteger_aceite
  before update on public.oficinas
  for each row execute function public.proteger_aceite_dos_termos();

select public.conferir_fechadura();
