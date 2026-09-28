// Cloudflare Pages Function → /api/studio
// 이 폴더(video-studio)를 Cloudflare Pages 프로젝트로 올리면 화면과 API가 같은 주소에서 함께 동작한다.
import worker from '../../worker/worker.js'

export const onRequest = (context) => worker.fetch(context.request, context.env)
