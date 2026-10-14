-- 담당 배정 요청(assign_requests) → 앱 푸시(FCM)
-- 기존 푸시 엔진을 그대로 재사용한다:
--   공용 트리거 함수 public.notify_push() (pg_net) → cloudflare-push-worker → FCM
--
-- notify_push() 는 TG_TABLE_NAME / TG_OP / NEW 를 그대로 워커로 POST하는 '공용' 함수라,
-- (reports·notices·profiles 등과 동일하게) assign_requests 에도 그대로 붙이면 된다.
-- 워커 주소/secret 은 notify_push() 안에 이미 설정돼 있으므로 여기서 건드릴 게 없다.
--
-- ※ 전제: 푸시 워커(cloudflare-push-worker/worker.js)에 assign_requests 케이스가
--   추가·배포돼 있어야 실제 발송된다. (없으면 워커가 '대상 없음'으로 조용히 끝남)

drop trigger if exists push_assign_requests on public.assign_requests;
create trigger push_assign_requests
  after insert on public.assign_requests
  for each row execute function public.notify_push();
