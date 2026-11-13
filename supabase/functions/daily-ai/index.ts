// 시공사 일일보고 → 규칙 검사 + AI 위험 탐지 (초안)
//
// 흐름: 시공사가 일일보고 제출 → 앱이 이 함수 호출({ report_id })
//   1) 규칙 검사(무료): 필수 사진 누락 · 옛 사진(촬영일≠보고일) · 같은 사진 재사용 · 공정 순서 건너뜀
//   2) AI 1차(Claude Haiku 5.5): 사진·메모·직전 공정을 보고 '검토 필요/이상 징후 없음/판단 불가'
//   3) AI 2차(Claude Sonnet 5.5): 1차에서 '검토 필요'가 나온 경우에만 다시 확인(오경보 줄이기)
//   4) ai_findings · daily_ai 저장 (daily_ai 웹훅이 '검토 필요'면 담당 감리원에게 푸시)
//      AI 결과(daily_ai)는 감리원·관리자만 볼 수 있음 — 시공사에게는 감리원이 통보한 항목만 보임
//
// 비용 관리: 보고 1건 최대 6장 · 현장당 하루 상한 · 월 예산 상한 · 고정 프롬프트 캐싱
// AI는 판정하지 않음(적합/부적합은 감리원). 단정 표현은 서버에서 한 번 더 걸러냄.
//
// 배포:  supabase functions deploy daily-ai
// 비밀키: ANTHROPIC_API_KEY (gamri-ai 와 같은 키 사용 가능)
// 선택:  DAILY_AI_MODEL(기본 claude-haiku-5-5) · DAILY_AI_MODEL_2ND(기본 claude-sonnet-5-5)
//        DAILY_AI_DAILY_CAP(현장당 하루 분석 장수, 기본 20) · DAILY_AI_MONTHLY_USD(월 예산 달러, 기본 10)

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

    const KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!KEY || !pick.length || monthCost >= MONTHLY_USD) {
      const why = !KEY ? "ANTHROPIC_API_KEY 미설정" : !P.length ? "사진 없음" : monthCost >= MONTHLY_USD ? "이번 달 AI 예산 상한 도달" : "오늘 이 현장 AI 분석 상한(" + DAILY_CAP + "장) 도달";
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
});
