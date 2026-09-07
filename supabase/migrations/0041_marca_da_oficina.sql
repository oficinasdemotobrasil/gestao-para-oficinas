-- 0041 — A marca da oficina: logo e cor
--
-- As colunas logo_url e cor_primaria existem desde a 0002 e nunca foram usadas.
-- Esta migration não cria colunas concorrentes: ela aproveita as que já estão
-- lá, acrescenta só a miniatura e cria o balde do Storage.
--
-- Por que o balde é PÚBLICO para leitura, sendo o primeiro do projeto:
-- o logo precisa aparecer na tela de entrar, e ali ainda não existe sessão
-- para uma política conferir. Logo é material de divulgação, não segredo. A
-- escrita continua trancada pelo mesmo padrão do balde de notas fiscais: o
-- caminho começa pelo oficina_id, e a política compara a primeira pasta.

-- Miniatura -------------------------------------------------------------------
-- Duas versões porque os usos são diferentes: o PDF precisa de resolução, o
-- menu não — e carregar o arquivo do PDF em toda tela seria peso à toa numa
-- oficina com internet ruim.
alter table public.oficinas
  add column if not exists logo_miniatura_url text;

comment on column public.oficinas.logo_url is
  'Logo em ~512px de largura. Usado no cabeçalho dos PDFs.';
comment on column public.oficinas.logo_miniatura_url is
  'Logo em ~128px. Usado no menu lateral e na tela de entrar.';
comment on column public.oficinas.cor_primaria is
  'Cor da marca. Substitui o amarelo apenas nos destaques.';

-- A cor ----------------------------------------------------------------------
-- O padrão nasceu em maiúsculo e o resto do projeto escreve hexadecimal em
-- minúsculo. Uniformiza antes de travar o formato, senão a própria linha da
-- oficina piloto reprovaria na restrição.
update public.oficinas
  set cor_primaria = lower(cor_primaria)
  where cor_primaria <> lower(cor_primaria);

alter table public.oficinas
  alter column cor_primaria set default '#f5c518';

alter table public.oficinas
  drop constraint if exists oficinas_cor_primaria_hexadecimal;
alter table public.oficinas
  add constraint oficinas_cor_primaria_hexadecimal
  check (cor_primaria ~ '^#[0-9a-f]{6}$');

-- Balde -----------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do update set public = true;

drop policy if exists "admin envia logo da propria oficina" on storage.objects;
create policy "admin envia logo da propria oficina"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.oficina_do_usuario()::text
    and public.eh_admin()
  );

drop policy if exists "admin troca logo da propria oficina" on storage.objects;
create policy "admin troca logo da propria oficina"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.oficina_do_usuario()::text
    and public.eh_admin()
  )
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.oficina_do_usuario()::text
    and public.eh_admin()
  );

drop policy if exists "admin apaga logo da propria oficina" on storage.objects;
create policy "admin apaga logo da propria oficina"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.oficina_do_usuario()::text
    and public.eh_admin()
  );

select public.conferir_fechadura();
