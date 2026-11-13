// 아파트스퀘어 AI — 하나의 함수로 모든 AI 기능 (Supabase Edge Function 'aptsq-ai')
//   task 'daily'  : 시공사 일일보고 사진 → 규칙 검사 + AI 위험 탐지 (Haiku 1차 / Sonnet 2차)
//   task 'report' : 감리원 앱 감리일지 작성 3단계 '✨ AI 돌리기' → 감리 현장 보고일지 5개 섹션 (part:'opinion' = 종합의견)
//   task 'enrich' : 관리자 콘솔 감리일지 '✨ AI 보강' → 작업/특기/지적 문장
//   task 'ping'   : 콘솔 'AI 연결 테스트'
//
// API 키: 관리자 콘솔 「일일보고·AI」 탭 → AI 설정에 붙여넣으면 끝 (app_integrations 표에 저장, 브라우저엔 안 보임)
//         또는 Supabase secret ANTHROPIC_API_KEY (있으면 이게 우선)
// 배포(최초 1번): Supabase → Edge Functions → Deploy a new function → 이름 aptsq-ai → 이 파일 붙여넣기
//
// AI는 판정하지 않음(적합/부적합은 감리원). 단정 표현은 서버에서 한 번 더 걸러냄.
// Sonnet/Opus 호출에는 서버 측 대체 모델(fallbacks: "default")을 켜 둠 — 안전 분류기가 거절하면 다른 모델로 자동 재시도.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import Anthropic from "npm:@anthropic-ai/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL_1 = Deno.env.get("DAILY_AI_MODEL") || "claude-haiku-5-5";
const MODEL_2 = Deno.env.get("DAILY_AI_MODEL_2ND") || "claude-sonnet-5-5";
const DAILY_CAP = Number(Deno.env.get("DAILY_AI_DAILY_CAP") || 20);
const MONTHLY_USD = Number(Deno.env.get("DAILY_AI_MONTHLY_USD") || 10);
const PER_REPORT = 6;

// 100만 토큰당 달러 (입력, 출력) — 비용 '추정' 표시용. 가격이 바뀌면 여기만 수정.
const PRICE: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.10, 0.50],
  "claude-sonnet-5-5": [2.0, 10.0],
  "claude-opus-5-5": [4.0, 20.0],
};

// 공법별 시공 순서 (app/js/stages.js 의 STAGE_SETS 와 같게 유지)
const STAGE_SETS: Record<string, string[]> = {
  repaint: ["외벽 고압세척", "균열보수", "바인더 작업", "페인트 도장", "그래픽 작업", "공사 마무리"],
  metalroof: ["지붕 끝단 마감재 보강", "이음부 보강시트 방수", "바탕면 강화 도포", "방수 보강시트 부착", "방수액 도포(중도1차)", "방수 중도 도포(2차)", "방수 상도 도포", "시공 완료"],
  shingle: ["지붕 끝단 마감재 보강", "이음부 보강시트 방수", "바탕정리·방수 하도 도포", "방수 보강시트 부착", "방수층 함침(1차)", "방수 중도 도포(1차)", "방수 중도 도포(2차)", "방수 상도 도포"],
  epoxy: ["바탕면 처리·하도", "에폭시 중도 1차", "균열보수", "에폭시 중도 2차", "논슬립·상도 마감", "시공 완료"],
  composite: ["옥상 바탕정리·균열보수", "바탕 강화 함침(하도)", "복합 방수시트 부착", "이음부·곡각지점 보강", "방수 중도 도포", "방수 상도 도포", "시공 완료"],
  block: ["기존 블록 철거", "노상 정리·다짐", "기층 포설·다짐", "경계석·측구 설치", "바닥 모래 포설", "블록 부설", "줄눈 모래·진동 다짐", "시공 완료"],
  ascon: ["기존 아스콘 절삭·철거", "노상 정리·다짐", "기층 포설·다짐", "경계석·측구·맨홀 조정", "택코트 살포", "아스콘 포설·다짐", "차선·구획선", "시공 완료"],
};

// 고정 시스템 프롬프트 (바뀌지 않음 → 프롬프트 캐싱 대상)
const SYSTEM = `당신은 '아파트스퀘어'(아파트 보수공사 비상주 감리 대행)의 시공사 일일보고 1차 검토 보조입니다.
감리원은 현장에 주 1회 정도만 방문합니다. 방문하지 않는 날 시공사(현장소장)가 올린 사진·메모를 보고,
감리원이 '확인해 볼 만한 것'을 골라 알려 주는 것이 당신의 역할입니다. 당신은 판정하지 않습니다.

[보는 것 — 사진에 실제로 보이는 것만]
1) 안전
 - 작업자 안전모 미착용, 고소작업 시 안전대(안전벨트) 미착용 또는 미체결
 - 개구부 덮개·안전난간·추락방지망 미설치 또는 훼손
 - 달비계(곤돌라·로프) 작업: 주로프·보조로프(구명줄) 2줄 여부, 로프 고정점·보호대, 작업 구간 하부 통제(출입금지 표시·바리케이드)
 - 사다리·비계 위 불안정 작업, 자재 낙하 위험, 보행자 동선과 작업구간 미분리
2) 공정·품질
 - 사진 속 작업이 보고된 공종과 맞지 않아 보임
 - 직전 공정이 끝나지 않은 상태에서 다음 공정이 진행되는 것으로 보임 (예: 바탕처리·균열보수 흔적 없이 도장)
 - 젖은 바탕면·물고임 위에 도장·방수 작업으로 보임
 - 도막 들뜸·흘러내림·미도포 부위가 넓게 보임

[출력 규칙 — 반드시 지킴]
- 각 항목의 status 는 '검토 필요' 또는 '판단 불가' 둘 중 하나입니다. 문제가 안 보이면 항목을 만들지 마십시오.
- overall: 검토 필요 항목이 하나라도 있으면 '검토 필요', 사진이 흐리거나 너무 멀어 볼 수 없으면 '판단 불가', 그 외 '이상 징후 없음'.
- 사진에서 직접 보이지 않는 것은 쓰지 마십시오. 추측으로 항목을 만들지 마십시오. 애매하면 '판단 불가'로 둡니다.
- photos 에는 근거가 된 사진 번호(1부터)를 넣습니다. 근거 사진이 없는 항목은 만들지 마십시오.
- title 은 20자 안팎의 짧은 요약, reason 은 사진에서 무엇이 보였는지 1~2문장.
- 표현: "~로 보임", "~인지 확인이 필요해 보임", 끝은 "감리원 확인 필요".
- 금지 표현: 위반, 적발, 하자, 부적합, 불량, 재시공, 시정, 조치하라, 반드시 ~해야 함 (법적 책임을 단정하는 말 전부)
- 사람 얼굴·신원은 언급하지 마십시오. 작업자는 "작업자 1명"처럼만 씁니다.
- 날씨 정보가 주어지지 않으면 날씨를 추측하지 마십시오.
- note 에는 전체 사진에 대한 한 줄 요약(관찰 사실만)을 씁니다.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overall", "items", "note"],
  properties: {
    overall: { type: "string", enum: ["검토 필요", "이상 징후 없음", "판단 불가"] },
    note: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "status", "title", "reason", "photos"],
        properties: {
          category: { type: "string", enum: ["안전", "공정·품질"] },
          status: { type: "string", enum: ["검토 필요", "판단 불가"] },
          title: { type: "string" },
          reason: { type: "string" },
          photos: { type: "array", items: { type: "integer" } },
        },
      },
    },
  },
};

type AiItem = { category: string; status: string; title: string; reason: string; photos: number[] };
type AiOut = { overall: string; note: string; items: AiItem[] };

// 단정 표현 한 번 더 거르기
const BANNED: [RegExp, string][] = [
  [/부적합/g, "기준 충족 여부 확인 필요"],
  [/위반/g, "기준과 다른 것으로 보임"],
  [/적발/g, "관찰"],
  [/하자/g, "이상 징후"],
  [/불량/g, "상태 확인 필요"],
  [/재시공/g, "보완 여부 확인"],
  [/시정/g, "보완"],
];
function soften(s: string): string {
  let t = String(s || "").trim();
  for (const [re, rep] of BANNED) t = t.replace(re, rep);
  return t;
}
function withCheckTail(s: string): string {
  const t = soften(s);
  return /감리원 확인 필요\.?$/.test(t) ? t : (t.replace(/[.\s]+$/, "") + " — 감리원 확인 필요");
}

function J(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });
}

function costOf(model: string, u: any): number {
  const [pin, pout] = PRICE[model] || PRICE["claude-sonnet-5-5"];
  const inTok = (u?.input_tokens || 0) + (u?.cache_creation_input_tokens || 0) * 1.25 + (u?.cache_read_input_tokens || 0) * 0.1;
  return (inTok * pin + (u?.output_tokens || 0) * pout) / 1_000_000;
}

function textOf(msg: any): string {
  return (msg?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
}
function parseOut(msg: any): AiOut | null {
  if (!msg || msg.stop_reason === "refusal") return null;
  try {
    const o = JSON.parse(textOf(msg));
    if (!o || !Array.isArray(o.items)) return null;
    return o as AiOut;
  } catch { return null; }
}

async function handleDaily(body: any, auth: string, URL_: string, ANON: string, SERVICE: string, KEYV: string | null): Promise<Response> {
  const reportId = String(body?.report_id || "");
  const force = !!body?.force;
  if (!reportId) return J({ ok: false, error: "report_id 가 필요해요." }, 400);

  const asUser = createClient(URL_, ANON, { global: { headers: { Authorization: auth } } });
  const svc = createClient(URL_, SERVICE);

  const { data: rep } = await svc.from("daily_reports").select("*").eq("id", reportId).single();
  if (!rep) return J({ ok: false, error: "일일보고를 찾을 수 없어요." }, 404);

  // 호출자 권한: 그 현장 시공사(본인 보고) 또는 감리원·관리자
  const [{ data: isC }, { data: isS }] = await Promise.all([
    asUser.rpc("is_contractor_of", { p_apt: rep.apartment_id }),
    asUser.rpc("is_staff_of", { p_apt: rep.apartment_id }),
  ]);
  if (!isC && !isS) return J({ ok: false, error: "이 현장 보고를 분석할 권한이 없어요." }, 403);

  if (rep.ai_status === "done" || rep.ai_status === "running") {
    if (!(force && isS)) return J({ ok: true, status: rep.ai_status });
  }
  await svc.from("daily_reports").update({ ai_status: "running" }).eq("id", reportId);
  // AI 결과는 daily_ai 표(감리원·관리자만)에 저장 → 이 표의 변경이 웹훅으로 감리원 푸시를 보냄
  const saveAi = (status: string, summary: string | null, result: unknown, error: string | null = null) =>
    Promise.all([
      svc.from("daily_ai").upsert({ report_id: reportId, apartment_id: rep.apartment_id, summary, result, error, updated_at: new Date().toISOString() }),
      svc.from("daily_reports").update({ ai_status: status }).eq("id", reportId),
    ]);

  try {
    const [{ data: apt }, { data: photos }, { data: prev }] = await Promise.all([
      svc.from("apartments").select("id,name,method,builder").eq("id", rep.apartment_id).single(),
      svc.from("daily_photos").select("*").eq("report_id", reportId).order("created_at"),
      svc.from("daily_reports").select("id,work_date,worktype,location,created_at").eq("apartment_id", rep.apartment_id)
        .neq("id", reportId).order("work_date", { ascending: false }).limit(20),
    ]);
    const P = photos || [];
    const prevReps = (prev || []).filter((r: any) => r.work_date <= rep.work_date);

    // ---------- 1) 규칙 검사 (AI 없이, 무료) ----------
    const ruleFindings: any[] = [];
    const missing: string[] = Array.isArray(rep.required_missing) ? rep.required_missing : [];
    if (!P.length) {
      ruleFindings.push({ category: "기록", title: "사진 없이 제출됨", reason: "일일보고에 사진이 없습니다. 작업 확인이 어려워 보임 — 감리원 확인 필요", photo_ids: [] });
    } else if (missing.length) {
      ruleFindings.push({ category: "기록", title: "필수 사진 누락 " + missing.length + "건", reason: "빠진 촬영 항목: " + missing.join(", ") + " — 감리원 확인 필요", photo_ids: [] });
    }
    // 옛 사진: EXIF 촬영일이 보고일과 1일 넘게 차이
    const workMs = new Date(rep.work_date + "T12:00:00+09:00").getTime();
    const stale = P.filter((p: any) => p.exif_taken_at && Math.abs(new Date(p.exif_taken_at).getTime() - workMs) > 36 * 3600 * 1000);
    if (stale.length) {
      await svc.from("daily_photos").update({ stale_flag: true }).in("id", stale.map((p: any) => p.id));
      ruleFindings.push({ category: "기록", title: "촬영일이 다른 사진 " + stale.length + "장", reason: "사진 촬영일(" + stale.map((p: any) => String(p.exif_taken_at).slice(0, 10)).join(", ") + ")이 보고일(" + rep.work_date + ")과 다릅니다. 이전 사진 재사용인지 확인이 필요해 보임 — 감리원 확인 필요", photo_ids: stale.map((p: any) => p.id) });
    }
    // 같은 사진 재사용: 이 현장 다른 보고에 같은 해시
    const hashes = P.map((p: any) => p.sha256).filter(Boolean);
    if (hashes.length) {
      const { data: dup } = await svc.from("daily_photos").select("id,sha256,report_id").eq("apartment_id", rep.apartment_id)
        .in("sha256", hashes).neq("report_id", reportId).limit(50);
      const dupHashes = new Set((dup || []).map((d: any) => d.sha256));
      const dupPhotos = P.filter((p: any) => p.sha256 && dupHashes.has(p.sha256));
      if (dupPhotos.length) ruleFindings.push({ category: "기록", title: "이전 보고와 같은 사진 " + dupPhotos.length + "장", reason: "이전 일일보고에 올라온 사진과 같은 파일입니다. 재사용 여부 확인이 필요해 보임 — 감리원 확인 필요", photo_ids: dupPhotos.map((p: any) => p.id) });
    }
    // 공정 순서: 이 현장에 이전 보고가 있는데, 바로 앞 공정 보고가 한 번도 없음
    const stages = (apt?.method && STAGE_SETS[apt.method]) || null;
    if (stages && rep.worktype && prevReps.length) {
      const i = stages.indexOf(rep.worktype);
      if (i > 0) {
        const done = new Set(prevReps.map((r: any) => r.worktype));
        const before = stages[i - 1];
        if (!done.has(before) && !stages.slice(i).some((s) => done.has(s))) {
          ruleFindings.push({ category: "공정·품질", title: "앞 공정 보고 없이 진행", reason: "'" + before + "' 보고 없이 '" + rep.worktype + "'(으)로 보고됐습니다. 앞 공정 완료 여부 확인이 필요해 보임 — 감리원 확인 필요", photo_ids: [] });
        }
      }
    }
    // 재실행 시 규칙 항목 중복 방지
    const { count: ruleCnt } = await svc.from("ai_findings").select("id", { count: "exact", head: true }).eq("report_id", reportId).eq("source", "rule");
    if (!ruleCnt && ruleFindings.length) {
      await svc.from("ai_findings").insert(ruleFindings.map((f) => ({ ...f, source: "rule", report_id: reportId, apartment_id: rep.apartment_id })));
    }

    // ---------- 2) AI 사용 상한 확인 ----------
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST
    const monthStart = today.slice(0, 8) + "01";
    const [{ data: todayRow }, { data: monthRows }] = await Promise.all([
      svc.from("ai_usage_daily").select("*").eq("day", today).eq("apartment_id", rep.apartment_id).maybeSingle(),
      svc.from("ai_usage_daily").select("cost_usd").gte("day", monthStart),
    ]);
    const usedToday = todayRow?.photos || 0;
    const monthCost = (monthRows || []).reduce((s: number, r: any) => s + Number(r.cost_usd || 0), 0);
    // 필수 칸 사진 우선, 최대 6장
    const ordered = [...P].sort((a: any, b: any) => (a.shot_slot ? 0 : 1) - (b.shot_slot ? 0 : 1));
    const room = Math.max(0, Math.min(PER_REPORT, DAILY_CAP - usedToday));
    const pick = ordered.slice(0, room);
    const ruleSummary = ruleFindings.length ? "검토 필요" : null;

    const KEY = KEYV;
    if (!KEY || !pick.length || monthCost >= MONTHLY_USD) {
      const why = !KEY ? "AI 키 미설정(콘솔 AI 설정)" : !P.length ? "사진 없음" : monthCost >= MONTHLY_USD ? "이번 달 AI 예산 상한 도달" : "오늘 이 현장 AI 분석 상한(" + DAILY_CAP + "장) 도달";
      await saveAi(P.length ? "skipped" : "done", ruleSummary || (P.length ? "판단 불가" : "검토 필요"),
        { skipped: why, rules: ruleFindings.length });
      return J({ ok: true, status: "skipped", reason: why, rules: ruleFindings.length });
    }

    // ---------- 3) AI 입력 만들기 ----------
    const imgs: any[] = [];
    for (const p of pick) {
      const { data: blob, error } = await svc.storage.from("daily-photos").download(p.path);
      if (error || !blob) continue;
      imgs.push({ p, b64: encodeBase64(new Uint8Array(await blob.arrayBuffer())) });
    }
    if (!imgs.length) throw new Error("사진 파일을 읽지 못했어요");

    const ctx: string[] = [];
    ctx.push("[현장] " + (apt?.name || "") + (apt?.builder ? " / 시공사 " + apt.builder : ""));
    ctx.push("[보고일] " + rep.work_date + "  [공종] " + (rep.worktype || "미기재") + "  [위치] " + (rep.location || "미기재"));
    ctx.push("[시공사 메모] " + (rep.memo || "(없음)"));
    if (stages) ctx.push("[이 현장 공정 순서] " + stages.join(" → "));
    if (prevReps.length) ctx.push("[최근 보고] " + prevReps.slice(0, 7).map((r: any) => r.work_date + " " + (r.worktype || "")).join(" / "));
    if (missing.length) ctx.push("[빠진 필수 사진] " + missing.join(", "));
    ctx.push("[날씨] 정보 없음");

    const userContent: any[] = [{ type: "text", text: ctx.join("\n") }];
    imgs.forEach((x, i) => {
      userContent.push({ type: "text", text: "사진 " + (i + 1) + " — " + (x.p.shot_label || "추가 사진") + (x.p.exif_taken_at ? " (촬영 " + String(x.p.exif_taken_at).slice(0, 16).replace("T", " ") + ")" : "") });
      userContent.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: x.b64 } });
    });
    userContent.push({ type: "text", text: "위 사진들을 규칙대로 검토해 JSON으로 답하세요." });

    const client = new Anthropic({ apiKey: KEY });
    const system = [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }];
    let tokIn = 0, tokOut = 0, cost = 0, calls = 0;
    const track = (model: string, m: any) => {
      const u = m?.usage || {};
      tokIn += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
      tokOut += u.output_tokens || 0; cost += costOf(model, u); calls++;
    };

    // 1차: Haiku (가장 저렴) — 전체 훑기
    const m1 = await client.messages.create({
      model: MODEL_1,
      max_tokens: 4000,
      system: system as any,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } } as any,
      messages: [{ role: "user", content: userContent }],
    } as any);
    track(MODEL_1, m1);
    let out = parseOut(m1);
    let usedModel = MODEL_1;

    // 2차: '검토 필요'가 있을 때만 Sonnet 으로 다시 확인 (오경보 줄이기)
    if (out && out.items.some((it) => it.status === "검토 필요") && MODEL_2 && MODEL_2 !== MODEL_1) {
      const verify = [...userContent, { type: "text", text: "1차 검토 결과(다른 모델):\n" + JSON.stringify(out.items) + "\n각 항목이 사진에서 실제로 보이는지 다시 확인하고, 보이지 않으면 빼세요. 새로 보이는 것이 있으면 추가해도 됩니다. 최종 결과만 JSON으로 답하세요." }];
      try {
        const m2 = await client.beta.messages.create({
          model: MODEL_2,
          max_tokens: 4000,
          system: system as any,
          output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } } as any,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          messages: [{ role: "user", content: verify }],
        } as any);
        track(MODEL_2, m2);
        const o2 = parseOut(m2);
        if (o2) { out = o2; usedModel = MODEL_2; }
      } catch (e) {
        console.log("[daily-ai] 2차 확인 실패, 1차 결과 사용:", String((e as any)?.message || e));
      }
    }

    // ---------- 4) 저장 ----------
    const aiItems = (out?.items || []).map((it) => ({
      ...it,
      title: soften(it.title).slice(0, 60),
      reason: withCheckTail(it.reason),
      photos: (it.photos || []).filter((n) => n >= 1 && n <= imgs.length),
    }));
    const flagged = aiItems.filter((it) => it.status === "검토 필요" && it.photos.length);
    if (flagged.length) {
      // 재분석이면 이전 AI 항목 중 아직 손대지 않은 것만 교체
      await svc.from("ai_findings").delete().eq("report_id", reportId).eq("source", "ai").eq("state", "open");
      await svc.from("ai_findings").insert(flagged.map((it) => ({
        report_id: reportId, apartment_id: rep.apartment_id, source: "ai",
        category: it.category, title: it.title, reason: it.reason,
        photo_ids: it.photos.map((n) => imgs[n - 1].p.id),
      })));
    }
    const overall = !out ? "판단 불가" : (flagged.length || ruleSummary) ? "검토 필요" : (out.overall === "판단 불가" ? "판단 불가" : "이상 징후 없음");

    await svc.from("ai_usage_daily").upsert({
      day: today, apartment_id: rep.apartment_id,
      photos: usedToday + imgs.length,
      calls: (todayRow?.calls || 0) + calls,
      input_tokens: Number(todayRow?.input_tokens || 0) + tokIn,
      output_tokens: Number(todayRow?.output_tokens || 0) + tokOut,
      cost_usd: Number(todayRow?.cost_usd || 0) + cost,
    });

    await saveAi("done", overall, {
      model: usedModel, overall: out?.overall || null, note: soften(out?.note || ""),
      items: aiItems, analyzed: imgs.length, total_photos: P.length, rules: ruleFindings.length,
      cost_usd: Number(cost.toFixed(5)), refused: !out,
    });

    return J({ ok: true, status: "done", summary: overall, findings: flagged.length + ruleFindings.length });
  } catch (e) {
    const msg = String((e as any)?.message || e).slice(0, 500);
    await saveAi("failed", null, null, msg);
    return J({ ok: false, error: "분석 실패: " + msg }, 500);
  }
}

// ============================================================
// 공용: API 키 — Supabase secret(ANTHROPIC_API_KEY) 또는 관리자 콘솔 'AI 설정'에 저장한 키
// ============================================================
let KEY_CACHE: { v: string | null; t: number } = { v: null, t: 0 };
async function getKey(svc: any): Promise<string | null> {
  const env = Deno.env.get("ANTHROPIC_API_KEY");
  if (env) return env;
  if (Date.now() - KEY_CACHE.t < 60_000) return KEY_CACHE.v;
  try {
    const { data } = await svc.from("app_integrations").select("value").eq("key", "anthropic_api_key").maybeSingle();
    KEY_CACHE = { v: (data && data.value) || null, t: Date.now() };
  } catch { KEY_CACHE = { v: null, t: Date.now() }; }
  return KEY_CACHE.v;
}
async function callerRole(asUser: any): Promise<string | null> {
  try {
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return null;
    const { data: prof } = await asUser.from("profiles").select("role,approved").eq("id", user.id).single();
    return prof && prof.approved ? prof.role : null;
  } catch { return null; }
}
const MODEL_WRITE = Deno.env.get("AI_MODEL_WRITE") || Deno.env.get("GAMRI_AI_MODEL") || "claude-opus-5-5";

// 공통 문장 규칙 (감리 업무기준)
const RULES = `[최우선 원칙 — 사실을 지어내지 않는다]
- 주어진 자료(체크 항목·지적사항·메모·시공사 보고)에 없는 작업·점검·수치·부위·일시·인원을 새로 만들지 마십시오.
- 자료가 빈약하면 빈약한 대로 쓰고, 칸을 억지로 채우지 마십시오. 자료가 없는 항목은 "해당 없음" 또는 "특이사항 없음(자료 없음)"으로 씁니다.

[쓰는 동사 — 이것만 사용]
관찰함 · 확인함 · 수령함 · 보관함 · 통보함 · 요청함 · (서면으로) 지시함 · 판정함(적합/부적합/판정 보류) · 보고함

[금지 표현]
조치함 · 시정함 · 처리함 · 진행시킴 · 중단시킴 · 투입시킴 · 적발함 · 지적함 · 판단됨 · 예상됨 · 이상 없음 · 양호함
('하자' '불량' '재시공 필요'처럼 법적 책임을 단정하는 표현 금지). 법 조문 번호를 지어내지 말고 "관계 법령에 따라"로 씁니다.

[시공사 작업내용]
- 시공자의 작업내용은 감리가 창작·요약하지 않습니다. "시공자 제출 작업보고 원문 수령·보관함" 형태로 쓰고, 제출 내역(날짜·공종·부위·사진 수)만 사실대로 적습니다.`;

// ---------- 감리원 앱: 감리 현장 보고일지(5개 섹션) 작성 ----------
const SYSTEM_REPORT = `당신은 '아파트스퀘어'(아파트 보수공사 비상주 감리 대행)의 감리 현장 보고일지 작성 보조입니다.
감리원이 앱에서 체크한 항목·지적사항·메모와, 지난 방문 이후 시공사가 앱으로 제출한 일일보고 목록을 받아
아래 5개 섹션의 보고일지를 작성합니다. 감리원이 검토·수정한 뒤 감리일지에 들어갑니다.

${RULES}

[출력 형식 — 이 제목과 순서 그대로, 일반 텍스트만 (마크다운 기호 #, **, 표 금지)]
1. 금일 공정 및 시공사보고
2. 감리 점검내용
   - 서류 확인
   - 안전관리
   - 자재관리
3. 향후 점검계획
4. 지적사항 및 조치내용
5. 감리 종합의견

- 각 섹션 아래는 "· "로 시작하는 짧은 문장 줄로 씁니다. 문장 끝은 위 '쓰는 동사'로 끝냅니다.
- 3번은 주어진 공정 순서에서 다음 단계와, 미처리 지적사항 재확인 계획만 씁니다.
- 4번은 주어진 지적사항·처리결과만 씁니다. 없으면 "· 금일 지적사항 없음"으로 씁니다.
- 5번은 2~3문장. 관찰 사실 요약과 다음 확인 사항만, 단정 평가 없이.`;

const SYSTEM_OPINION = `당신은 '아파트스퀘어' 비상주 감리의 감리 종합의견 작성 보조입니다.
감리원이 체크한 항목·지적사항·보고일지를 바탕으로 '감리 종합의견'을 3~5문장으로 씁니다.

${RULES}

[출력] 일반 텍스트 문단 하나. 마크다운·제목·번호 없이.`;

function textOf2(msg: any): string {
  return (msg?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
}
async function writeCall(KEY: string, system: string, user: string, maxTokens = 6000) {
  const client = new Anthropic({ apiKey: KEY });
  const msg = await client.beta.messages.create({
    model: MODEL_WRITE,
    max_tokens: maxTokens,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] as any,
    output_config: { effort: "medium" } as any,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: user }],
  } as any);
  if ((msg as any).stop_reason === "refusal") throw new Error("AI가 이 요청을 처리하지 못했어요. 내용을 조금 바꿔 다시 시도해 주세요.");
  return msg;
}

async function handleReport(body: any, KEY: string): Promise<Response> {
  const c = body?.ctx || {};
  const L: string[] = [];
  const add = (k: string, v: any) => { if (v != null && String(v).trim()) L.push(k + ": " + String(v).trim()); };
  add("현장", c.site); add("시공사", c.builder); add("공종", c.worktype); add("단계", c.stage);
  add("날짜", c.date); add("날씨", c.weather); add("회차", c.round); add("감리원", c.insp); add("점검 위치", c.zone);
  if (Array.isArray(c.stages) && c.stages.length) add("공정 순서", c.stages.join(" → "));
  const list = (title: string, arr: any) => {
    const a = (Array.isArray(arr) ? arr : []).map((x: any) => String(x).trim()).filter(Boolean);
    L.push("", "[" + title + "]", a.length ? a.map((x: string) => "· " + x).join("\n") : "(없음)");
  };
  list("감리원 체크 항목(시공사 보고)", c.rep);
  list("감리원 체크 항목(점검·확인)", c.chk);
  list("금일 지적사항", c.iss);
  list("이전 회차 지적사항 처리결과", c.res);
  list("감리원 메모", c.memo ? [c.memo] : []);
  list("지난 방문 이후 시공사 일일보고(앱 제출)", c.daily);
  list("시공사 확인 요청 현황", c.requests);
  if (typeof c.photoCount === "number") L.push("", "첨부 현장사진: " + c.photoCount + "장");
  if (c.current) L.push("", "[현재 작성된 보고일지(있으면 참고)]", String(c.current).slice(0, 6000));
  const user = L.join("\n").slice(0, 30000);
  const isOpinion = body?.part === "opinion";
  const msg = await writeCall(KEY, isOpinion ? SYSTEM_OPINION : SYSTEM_REPORT,
    "아래 자료로 " + (isOpinion ? "감리 종합의견을" : "감리 현장 보고일지를") + " 작성하세요.\n\n" + user, isOpinion ? 2000 : 6000);
  let text = textOf2(msg).replace(/\*\*/g, "").replace(/^#+\s*/gm, "");
  for (const [re, rep] of BANNED) text = text.replace(re, rep);
  return J({ ok: true, text, model: MODEL_WRITE });
}

// ---------- 관리자 콘솔: 감리일지 AI 보강 (작업/특기/지적) ----------
const SYSTEM_ENRICH = `당신은 '아파트스퀘어'(비상주 감리 대행)의 공사감리일지 작성 보조입니다.
감리원이 작성한 '점검 원문'을 공식 공사감리일지(건축법 시행규칙 별지 제21호서식)의
세 칸 — 작업사항 / 특기사항 / 지적사항 및 처리결과 — 에 들어갈 문장으로 다듬습니다.

${RULES}

[작업사항] '[시공사 보고]' 와 '[감리 확인]' 두 소제목 줄을 넣고 그 아래 해당 불릿을 둡니다.
[특기사항] 방문 시점의 관찰 사실, 제출서류 수령 내역, 공정률 보고 등.
[지적사항 및 처리결과] 완료 부위에 한해 '적합 / 부적합 / 판정 보류'로만 판정. 시공 중 부위는 "판정 대상 아님". 없으면 빈 배열.
각 배열 항목은 불릿 한 줄(앞에 기호 없이).`;
const ENRICH_SCHEMA = {
  type: "object", additionalProperties: false, required: ["work", "teukgi", "jijeok"],
  properties: { work: { type: "array", items: { type: "string" } }, teukgi: { type: "array", items: { type: "string" } }, jijeok: { type: "array", items: { type: "string" } } },
};
async function handleEnrich(body: any, KEY: string): Promise<Response> {
  const m = body?.meta || {};
  const lines = ["아래는 감리원이 작성한 점검 원문과 현장 정보입니다. 공식 양식 문장으로 다듬어 주세요.", "", "[현장 정보]"];
  for (const [k, v] of [["현장명", m.site], ["시공사", m.builder], ["공종", m.worktype], ["감리일자", m.date], ["날씨", m.weather], ["회차", m.round], ["점검위치(동)", m.dongs], ["감리원", m.insp]]) if (v) lines.push(k + ": " + v);
  if (typeof body?.photoCount === "number") lines.push("첨부 현장사진: " + body.photoCount + "장");
  lines.push("", "[감리원 점검 원문]", String(body?.content || "").trim().slice(0, 20000) || "(원문 없음)");
  const client = new Anthropic({ apiKey: KEY });
  const msg = await client.beta.messages.create({
    model: MODEL_WRITE, max_tokens: 6000,
    system: [{ type: "text", text: SYSTEM_ENRICH, cache_control: { type: "ephemeral" } }] as any,
    output_config: { effort: "medium", format: { type: "json_schema", schema: ENRICH_SCHEMA } } as any,
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    messages: [{ role: "user", content: lines.join("\n") }],
  } as any);
  if ((msg as any).stop_reason === "refusal") return J({ ok: false, error: "AI가 이 요청을 처리하지 못했어요." });
  let o: any; try { o = JSON.parse(textOf2(msg)); } catch { return J({ ok: false, error: "AI 응답을 해석하지 못했어요." }); }
  const clean = (a: any) => (Array.isArray(a) ? a : []).map((x: any) => soften(String(x))).filter(Boolean);
  return J({ ok: true, work: clean(o.work), teukgi: clean(o.teukgi), jijeok: clean(o.jijeok), model: MODEL_WRITE });
}

// ============================================================
// 진입점 — { task: 'daily' | 'report' | 'enrich' | 'ping', ... }
// ============================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return J({ ok: false, error: "POST만 허용됩니다." }, 405);
  const URL_ = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") || "";
  if (!auth) return J({ ok: false, error: "로그인이 필요해요." }, 401);
  let body: any;
  try { body = await req.json(); } catch { return J({ ok: false, error: "요청 본문(JSON)을 읽지 못했습니다." }, 400); }
  const task = String(body?.task || (body?.report_id ? "daily" : "enrich"));
  const svc = createClient(URL_, SERVICE);
  const KEY = await getKey(svc);

  if (task === "daily") return handleDaily(body, auth, URL_, ANON, SERVICE, KEY);

  const asUser = createClient(URL_, ANON, { global: { headers: { Authorization: auth } } });
  const role = await callerRole(asUser);
  if (role !== "auditor" && role !== "admin") return J({ ok: false, error: "감리원·관리자만 사용할 수 있어요." }, 403);
  if (!KEY) return J({ ok: false, error: "AI 키가 아직 없어요 — 관리자 콘솔 「일일보고·AI」 탭의 AI 설정에 API 키를 넣어 주세요." });
  try {
    if (task === "ping") {
      const client = new Anthropic({ apiKey: KEY });
      const m = await client.messages.create({ model: MODEL_1, max_tokens: 50, messages: [{ role: "user", content: "'연결됨' 한 단어로만 답하세요." }] } as any);
      return J({ ok: true, reply: textOf2(m), model: MODEL_1, write_model: MODEL_WRITE });
    }
    if (task === "report") return await handleReport(body, KEY);
    if (task === "enrich") return await handleEnrich(body, KEY);
    return J({ ok: false, error: "알 수 없는 작업: " + task }, 400);
  } catch (e) {
    const msg = String((e as any)?.message || e);
    if (/401|authentication|invalid x-api-key/i.test(msg)) return J({ ok: false, error: "API 키가 올바르지 않아요 — 콘솔 AI 설정에서 키를 다시 넣어 주세요." });
    if (/credit|billing|balance/i.test(msg)) return J({ ok: false, error: "Anthropic 계정 결제(크레딧)를 확인해 주세요." });
    return J({ ok: false, error: "AI 실행 오류: " + msg.slice(0, 300) });
  }
});
