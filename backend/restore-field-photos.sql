-- 현장현황 사진 복원 (한 번만 실행!)
-- cleanup 으로 지워진 현장사진을, 공개된 감리일지의 사진에서 현장현황(field_updates)으로 다시 채웁니다.
-- 동은 감리일지의 '작업한 동' 첫 번째 값으로 분류돼요.
insert into field_updates (apartment_id, title, content, photos, dong)
select r.apartment_id,
       coalesce(r.pub_title, r.title),
       null,
       r.photos,
       nullif(trim(split_part(coalesce(r.dongs, ''), ',', 1)), '')
from reports r
where coalesce(r.published, false) = true
  and r.photos is not null
  and jsonb_array_length(r.photos) > 0;
-- ※ 딱 한 번만 실행하세요. 두 번 실행하면 사진이 두 번 들어가요.
