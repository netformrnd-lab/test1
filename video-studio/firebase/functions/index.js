// Firebase(test-168a4) HTTP 함수 'studio' → 영상 제작 작업실 화면 + API
// 주소: https://asia-southeast1-test-168a4.cloudfunctions.net/studio/
// worker.js 는 배포 워크플로가 video-studio/build.mjs 결과(deploy/worker.js)를 복사해 넣는다.
import * as functions from 'firebase-functions/v1'
import ffmpegPath from 'ffmpeg-static'
import worker from './worker.js'

// 사진 → 천천히 확대·이동하는 클립(자동 줌·이동)을 만들 때 쓰는 ffmpeg
globalThis.__FFMPEG = ffmpegPath

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL || 'https://gndktayoicegyqyllybk.supabase.co',
  SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
}

export const studio = functions
  .region('asia-southeast1')
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onRequest(async (req, res) => {
    // /studio (끝 슬래시 없음) → /studio/ 로 보내야 화면의 상대 경로(studio.css 등)가 맞는다
    if (req.method === 'GET' && (req.url === '' || req.url === '/') && !req.originalUrl.split('?')[0].endsWith('/')) {
      res.redirect(301, req.originalUrl.split('?')[0] + '/')
      return
    }
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
    const init = { method: req.method, headers }
    if (!['GET', 'HEAD'].includes(req.method) && req.rawBody) init.body = req.rawBody
    const r = await worker.fetch(new Request('https://studio.local' + (req.url || '/'), init), env)
    res.status(r.status)
    r.headers.forEach((v, k) => res.set(k, v))
    res.send(Buffer.from(await r.arrayBuffer()))
  })
