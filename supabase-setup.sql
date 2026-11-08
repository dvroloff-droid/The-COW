insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'coach-thoughts',
  'coach-thoughts',
  true,
  20971520,
  array['application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can list Coach's Thoughts PDFs" on storage.objects;
create policy "Public can list Coach's Thoughts PDFs"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'coach-thoughts');

drop policy if exists "Authorized users can upload Coach's Thoughts PDFs" on storage.objects;
create policy "Authorized users can upload Coach's Thoughts PDFs"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'coach-thoughts');
