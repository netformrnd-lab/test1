-- 보안: 계약서를 '비공개 버킷'으로 두고, 감리사·관리자만 접근.
-- 앱은 열람 시 짧게 만료되는 '서명 URL(임시 링크)'을 만들어 보여줌.
-- (기존엔 공개 버킷 field-photos 에 있어 URL만 알면 열렸음)

-- 1) 비공개 버킷 생성 (없으면 만들고, 있으면 비공개로 강제)
insert into storage.buckets (id, name, public)
values ('contracts','contracts', false)
on conflict (id) do update set public = false;

-- 2) 이 버킷 파일은 '스태프(감리사·관리자)'만 읽기/쓰기/삭제
drop policy if exists "contracts_obj_read_staff" on storage.objects;
create policy "contracts_obj_read_staff" on storage.objects for select to authenticated
using (
  bucket_id = 'contracts' and (
    public.is_admin()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('auditor','admin'))
  )
);

drop policy if exists "contracts_obj_write_staff" on storage.objects;
create policy "contracts_obj_write_staff" on storage.objects for insert to authenticated
with check (
  bucket_id = 'contracts' and (
    public.is_admin()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('auditor','admin'))
  )
);

drop policy if exists "contracts_obj_del_staff" on storage.objects;
create policy "contracts_obj_del_staff" on storage.objects for delete to authenticated
using (
  bucket_id = 'contracts' and (
    public.is_admin()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('auditor','admin'))
  )
);
