// Cloudflare Pages Function → 경로 /content
// 유튜브 채널 최신 영상 + 네이버 블로그 최신 글을 읽어 JSON으로 반환한다.
// 앱(콘텐츠 탭)이 이 결과를 받아 자동으로 목록을 그린다.
// 새 영상·글이 올라오면 별도 작업 없이 앱에 자동 반영된다.

const NAVER_ID = 'aptsquare_'
// 채널 ID를 알면 아래에 UC... 를 넣으면 자동 해결을 건너뛴다. (비워두면 영상에서 자동 추출)
const YT_CHANNEL_ID = ''
// 채널 추출용 씨앗 영상 (아무 영상 ID나 몇 개)
const SEED_VIDEOS = ['yQUeooyXpPA', 'i7061vU2BXE', 'Hz6Z2T1v5nY']

export async function onRequest() {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'public, max-age=1800',
    'access-control-allow-origin': '*'
  }
  try {
    const [youtube, blog] = await Promise.all([getYouTube(), getNaver()])
    return new Response(JSON.stringify({ youtube, blog }), { headers })
  } catch (e) {
    return new Response(JSON.stringify({ youtube: [], blog: [], error: String((e && e.message) || e) }), { headers })
  }
}

async function resolveChannelId() {
  if (YT_CHANNEL_ID) return YT_CHANNEL_ID
  for (const v of SEED_VIDEOS) {
    try {
      const r = await fetch('https://www.youtube.com/watch?v=' + v, { headers: { 'user-agent': 'Mozilla/5.0', 'accept-language': 'ko' } })
      const t = await r.text()
      const m = t.match(/"channelId":"(UC[0-9A-Za-z_-]{20,})"/) || t.match(/channel\/(UC[0-9A-Za-z_-]{20,})/)
      if (m) return m[1]
    } catch (e) { /* 다음 씨앗 영상 시도 */ }
  }
  return null
}

async function getYouTube() {
  const cid = await resolveChannelId()
  if (!cid) return []
  const r = await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + cid)
  const xml = await r.text()
  const items = []
  const entries = xml.split('<entry>').slice(1)
  for (const e of entries.slice(0, 15)) {
    const id = (e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1]
    const title = decode(clean((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ''))
    if (id) items.push({ id, title })
  }
  return items
}

async function getNaver() {
  const r = await fetch('https://rss.blog.naver.com/' + NAVER_ID + '.xml')
  const xml = await r.text()
  const items = []
  const parts = xml.split('<item>').slice(1)
  for (const p of parts.slice(0, 15)) {
    const title = decode(clean((p.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ''))
    const link = decode(clean((p.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || ''))
    if (title && link) items.push({ title, url: link })
  }
  return items
}

function clean(s) { return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() }
function decode(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
}
