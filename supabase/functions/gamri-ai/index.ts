// 공사감리일지 AI 보강 — 감리원 점검 원문을 공식 양식(작업/특기/지적) 문장으로 다듬는다.
// 비상주 감리 대행 업무기준(쓰는 동사·금지 동사·완료부위만 판정·사실 날조 금지)을 시스템 프롬프트로 강제.
// 서버에서 Claude API(ANTHROPIC_API_KEY)를 호출하므로 키가 클라이언트에 노출되지 않는다.
//
// 배포:  supabase functions deploy gamri-ai
// 비밀키: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//        (또는 Supabase 대시보드 → Edge Functions → gamri-ai → Secrets)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 모델: 기본 claude-opus-5-5. 비용을 줄이려면 claude-sonnet-5-5 / claude-haiku-5-5 로 바꾸세요.
const MODEL = Deno.env.get("GAMRI_AI_MODEL") || "claude-opus-5-5";

const SYSTEM = `당신은 '아파트스퀘어'(비상주 감리 대행)의 공사감리일지 작성 보조입니다.
감리원이 현장에서 체크·관찰한 '점검 원문'을 받아, 공식 공사감리일지(건축법 시행규칙 별지 제21호서식)의
세 칸 — 작업사항 / 특기사항 / 지적사항 및 처리결과 — 에 들어갈 문장으로 다듬습니다.

[최우선 원칙 — 사실을 지어내지 않는다]
- 점검 원문에 없는 작업·점검·수치·부위·일시·인원을 새로 만들지 마십시오. 체크·관찰된 것만 반영합니다.
- '풍부하게'란 없는 사실을 보태는 것이 아니라, 있는 사실을 감리 표준 문형으로 정확하고 충실하게 서술하는 것입니다.
- 원문이 빈약하면 빈약한 대로 쓰고, 칸을 억지로 채우지 마십시오.

[쓰는 동사 — 이것만 사용]
관찰함 · 확인함 · 수령함 · 보관함 · 통보함 · 요청함 · (서면으로) 지시함 · 판정함(적합/부적합/판정 보류) · 보고함

[금지 동사 — 절대 쓰지 말 것]
조치함 · 시정함 · 처리함 · 진행시킴 · 중단시킴 · 투입시킴 · 적발함 · 지적함 · 판단됨 · 예상됨 · 이상 없음 · 양호함
('하자' '불량' '재시공 필요'처럼 법적 책임을 단정하는 표현도 금지)

[작업사항]
- 시공자의 작업내용은 감리가 창작·요약하지 않습니다. "시공자 제출 작업보고 원문 수령·보관함" 형태로 씁니다.
- 감리가 직접 한 일은 '[감리 확인]' 소제목으로 분리합니다: 완료 부위 적합 여부 관찰·확인, 제출서류 수령, 보호구 비치·착용 상태 관찰 등.
- 가능하면 작업사항 배열에 '[시공사 보고]' 와 '[감리 확인]' 두 소제목 줄을 넣고 그 아래 해당 불릿을 둡니다.

[특기사항]
- 방문 시점의 관찰 사실, 제출서류 수령 내역, 공정률 보고 등. 가능하면 3단 문형([관찰]/[요구]/[증빙])을 지향합니다.

[지적사항 및 처리결과]
- 완료 부위에 한해 '적합 / 부적합 / 판정 보류'로만 판정합니다. 시공 중인 부위는 "판정 대상 아님".
- 기준 미충족 시: "설계도서 및 제품 시방 기준을 충족하지 못하여 부적합으로 판정함. 시공자에게 기준 충족 후 재확인 요청을 통보함." (조치 방법은 지정하지 않음)
- 지적할 사항이 없으면 빈 배열([])로 둡니다. 없는 지적을 만들지 마십시오.

[법 조문]
- 조문 번호를 지어내지 마십시오. 근거가 필요하면 "관계 법령에 따라"로 씁니다.

[출력 형식 — 반드시 아래 JSON만. 설명·코드펜스 금지]
{"work":["..."],"teukgi":["..."],"jijeok":["..."]}
- 각 배열 항목은 불릿 한 줄입니다(앞에 ·, - 같은 기호를 붙이지 마십시오).
- work 배열에는 '[시공사 보고]' '[감리 확인]' 같은 소제목 줄을 포함할 수 있습니다.`;

function buildUserText(body: any): string {
  const m = body?.meta || {};
  const lines: string[] = [];
  lines.push("아래는 감리원이 작성한 점검 원문과 현장 정보입니다. 이를 공식 양식 문장으로 다듬어 JSON으로 출력하세요.");
  lines.push("");
  lines.push("[현장 정보]");
  if (m.site) lines.push("현장명: " + m.site);
  if (m.builder) lines.push("시공사: " + m.builder);
  if (m.worktype) lines.push("공종: " + m.worktype);
  if (m.date) lines.push("감리일자: " + m.date);
  if (m.weather) lines.push("날씨: " + m.weather);
  if (m.round) lines.push("회차: " + m.round);
  if (m.dongs) lines.push("점검위치(동): " + m.dongs);
  if (m.insp) lines.push("감리원: " + m.insp);
  if (typeof body?.photoCount === "number") lines.push("첨부 현장사진: " + body.photoCount + "장");
  lines.push("");
  lines.push("[감리원 점검 원문]");
  lines.push(String(body?.content || "").trim() || "(원문 없음)");
  return lines.join("\n");
}

function extractJson(text: string): any {
  // 코드펜스/앞뒤 설명이 섞여도 첫 { ~ 마지막 } 를 뽑아 파싱
  let t = String(text || "").trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const i = t.indexOf("{"), j = t.lastIndexOf("}");
  if (i >= 0 && j > i) t = t.slice(i, j + 1);
  return JSON.parse(t);
}

function asLines(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") return v.split("\n").map((s) => s.trim()).filter(Boolean);
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const J = (o: any, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

  if (req.method !== "POST") return J({ ok: false, error: "POST만 허용됩니다." }, 405);

  const KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!KEY) return J({ ok: false, error: "ANTHROPIC_API_KEY 가 설정되지 않았습니다. (supabase secrets set ANTHROPIC_API_KEY=...)" });

  let body: any;
  try { body = await req.json(); } catch { return J({ ok: false, error: "요청 본문(JSON)을 읽지 못했습니다." }); }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system: SYSTEM,
        messages: [{ role: "user", content: buildUserText(body) }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return J({ ok: false, error: "Claude API 오류 (" + res.status + "): " + errText.slice(0, 500) });
    }

    const data = await res.json();
    const text = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
    let parsed: any;
    try { parsed = extractJson(text); }
    catch { return J({ ok: false, error: "AI 응답을 JSON으로 해석하지 못했습니다.", raw: text.slice(0, 800) }); }

    return J({
      ok: true,
      work: asLines(parsed.work),
      teukgi: asLines(parsed.teukgi),
      jijeok: asLines(parsed.jijeok),
      model: MODEL,
    });
  } catch (e) {
    return J({ ok: false, error: "함수 실행 오류: " + (e && (e as any).message || String(e)) });
  }
});
