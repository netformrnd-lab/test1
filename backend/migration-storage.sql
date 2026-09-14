-- 감리보고서 사진 저장용 Storage 버킷 + 정책
insert into storage.buckets (id, name, public)
values ('report-photos', 'report-photos', true)
on conflict (id) do nothing;

drop policy if exists "report_photos_upload" on storage.objects;
create policy "report_photos_upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'report-photos');

drop policy if exists "report_photos_read" on storage.objects;
create policy "report_photos_read" on storage.objects
  for select using (bucket_id = 'report-photos');
