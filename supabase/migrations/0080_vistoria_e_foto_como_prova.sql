-- 0080 — A vistoria e a foto valem como prova
--
-- Dois buracos que a revisão da 0079 achou, os dois no mesmo ponto: o registro
-- só vale como prova se não puder ser desfeito ou falsificado depois.
--
-- 1. A vistoria travava para editar depois da entrega, mas não para APAGAR. O
--    atendimento tem política "for all" nela, então podia sumir com a vistoria
--    de uma moto já entregue — exatamente a que o cliente estaria contestando.
--    O gatilho passa a valer também no delete.
--
-- 2. Quem criou a foto podia marcá-la como enviada sem ter enviado o arquivo.
--    Não abria acesso a nada, mas deixava uma foto "registrada" que não existe
--    — e prendia a vaga dela no limite para sempre. Agora a marca só passa se o
--    arquivo estiver no bucket.

-- 1. A vistoria ------------------------------------------------------------------
-- A função da 0079 já devolve coalesce(new, old), que serve ao delete: só o
-- gatilho muda.
drop trigger if exists os_vistorias_so_com_moto_na_oficina on public.os_vistorias;
create trigger os_vistorias_so_com_moto_na_oficina
  before insert or update or delete on public.os_vistorias
  for each row execute function public.vistoria_so_com_moto_na_oficina();

-- 2. A foto ----------------------------------------------------------------------
/*
 * Mesma função da 0079, com a conferência do arquivo na passagem para
 * "enviada". Passa a rodar como dona do banco para enxergar storage.objects
 * sem depender das políticas do Storage — a pergunta é só "o arquivo existe?".
 */
create or replace function public.foto_so_marca_envio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id is distinct from old.id
     or new.oficina_id is distinct from old.oficina_id
     or new.ordem_servico_id is distinct from old.ordem_servico_id
     or new.momento is distinct from old.momento
     or new.caminho is distinct from old.caminho
     or new.criado_por is distinct from old.criado_por
     or new.criado_em is distinct from old.criado_em then
    raise exception 'A foto não pode ser alterada depois de registrada.'
      using errcode = 'check_violation';
  end if;
  if old.enviada and not new.enviada then
    raise exception 'A foto não pode ser alterada depois de registrada.'
      using errcode = 'check_violation';
  end if;
  if new.enviada and not old.enviada and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'fotos-os' and o.name = new.caminho
  ) then
    raise exception 'O arquivo da foto não chegou. Tente enviar de novo.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.foto_so_marca_envio() from public, anon, authenticated;

select public.conferir_fechadura();
