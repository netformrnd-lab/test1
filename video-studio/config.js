// 영상 제작 작업실 설정
// STUDIO_API: 비워 두면 같은 사이트의 /api/studio (Cloudflare Pages 배포 시 functions/api/studio.js) 로 요청합니다.
//   worker/worker.js 를 별도 Worker 로 배포했다면 그 주소를 넣으세요 (예: https://aptsq-studio.xxx.workers.dev)
window.STUDIO_CONFIG = {
  STUDIO_API: '',
  SUPABASE_URL: 'https://gndktayoicegyqyllybk.supabase.co',
  SUPABASE_KEY: 'sb_publishable_J61d8JvrlkNVRyjmAhFwjQ_wExNoZbE',
}
