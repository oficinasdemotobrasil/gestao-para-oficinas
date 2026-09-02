-- 0022 — Anexo da nota fiscal no Storage
--
-- Bucket privado: sem URL pública. O arquivo só é lido por quem apresenta uma
-- sessão da oficina dona dele.
--
-- O isolamento vem do caminho do arquivo, que é sempre
--   <oficina_id>/<nota_id>/<nome do arquivo>
-- e a política compara a primeira pasta com a oficina de quem pede. Um arquivo
-- gravado fora desse formato simplesmente não passa pelo 'with check'.
--
-- Nota fiscal é preço de custo do começo ao fim, então só o admin alcança.

insert into storage.buckets (id, name, public)
values ('notas-fiscais', 'notas-fiscais', false)
on conflict (id) do nothing;

create policy "admin le anexo de nota da propria oficina"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'notas-fiscais'
    and (storage.foldername(name))[1] = public.oficina_do_usuario()::text
    and public.eh_admin()
  );

create policy "admin envia anexo de nota da propria oficina"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'notas-fiscais'
    and (storage.foldername(name))[1] = public.oficina_do_usuario()::text
    and public.eh_admin()
  );

create policy "admin apaga anexo de nota da propria oficina"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'notas-fiscais'
    and (storage.foldername(name))[1] = public.oficina_do_usuario()::text
    and public.eh_admin()
  );
