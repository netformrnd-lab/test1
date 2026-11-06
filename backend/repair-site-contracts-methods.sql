-- ============================================================
-- 복구: 계약 건(site_contracts) 1차 건에 공법·공정이 비어 들어간 경우 원본(control_sites · apartments)에서 다시 채움
-- 증상: 공사관리 목록이 전부 '공법 미지정' / 공정 0% (2026-11-06 첫 배포 직후)
-- 원본 값은 그대로 남아 있으므로 이 SQL 로 되돌립니다. Supabase → SQL Editor → Run (재실행 안전)
-- ============================================================

-- 1) 미리보기: 비어 있는 1차 건과 원본 값
select a.name, sc.seq, sc.methods, sc.progress,
       a.method as apt_method, a.progress_current,
       cs.data->'methods' as cs_methods, cs.data->'progress' as cs_progress
from public.site_contracts sc
join public.apartments a on a.id = sc.apartment_id
left join public.control_sites cs on cs.slug = regexp_replace(a.name, '[/#.\[\]$]', '_', 'g')
where sc.seq = 1 and (sc.methods = '[]'::jsonb or sc.methods is null)
order by a.name;

-- 2) 복구 ① control_sites 의 공법 목록·공정 복사 (비어 있는 1차 건만)
update public.site_contracts sc
set methods  = coalesce(cs.data->'methods', '[]'::jsonb),
    progress = coalesce(cs.data->'progress', '{}'::jsonb),
    updated_at = now()
from public.apartments a
left join public.control_sites cs on cs.slug = regexp_replace(a.name, '[/#.\[\]$]', '_', 'g')
where sc.apartment_id = a.id and sc.seq = 1
  and (sc.methods = '[]'::jsonb or sc.methods is null)
  and jsonb_typeof(cs.data->'methods') = 'array';

-- 3) 복구 ② 대표 공법(apartments.method)이 목록에 없으면 맨 앞에 추가하고, 그 공정은 apartments.progress_current 로
update public.site_contracts sc
set methods  = case when a.method is not null and not (coalesce(sc.methods,'[]'::jsonb) ? a.method)
                    then jsonb_build_array(a.method) || coalesce(sc.methods,'[]'::jsonb) else coalesce(sc.methods,'[]'::jsonb) end,
    progress = case when a.method is not null and not (coalesce(sc.progress,'{}'::jsonb) ? a.method)
                    then coalesce(sc.progress,'{}'::jsonb) || jsonb_build_object(a.method, coalesce(a.progress_current, 0)) else coalesce(sc.progress,'{}'::jsonb) end,
    updated_at = now()
from public.apartments a
where sc.apartment_id = a.id and sc.seq = 1 and a.method is not null;

-- 4) 확인: 아직 비어 있는 1차 건 (원본에도 공법이 없던 현장만 남아야 정상)
select a.name, sc.methods, sc.progress, a.method, a.progress_current
from public.site_contracts sc join public.apartments a on a.id = sc.apartment_id
where sc.seq = 1 and sc.methods = '[]'::jsonb order by a.name;
