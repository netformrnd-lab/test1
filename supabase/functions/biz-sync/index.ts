// biz-sync — 아파트스퀘어 콘솔(Supabase) ↔ 경영지원팀 업무관리(sq-biz · Firestore) 세금계산서 연동
//
// 10분마다(pg_cron) 또는 콘솔 "지금 동기화" 버튼으로 실행됩니다.
//   PULL ① 그쪽 계약(contracts) 목록 → public.biz_contracts 캐시
//        ② 연동 계약 건(site_contracts.biz_sync) 중 그쪽 계약 미연결 → 단지명이 정확히 하나만 맞으면 자동 연결
//        ③ 우리 청구 항목에 연결된 발행 요청(taxInvoiceRequests) 상태·발행일·입금 매칭(deposits) → receivable_items 반영
//   PUSH ④ receivable_items.biz_push='pending' → 그쪽 발행 요청 생성 (+ 그쪽 계약 없으면 생성, 첫 요청만 사업자등록증 첨부)
//
// 쓰기는 "요청 생성 · 계약 생성 · 계약 phase 에 요청 id 연결 · 첨부/문서/감사로그 추가" 뿐. 기존 요청의 수정·삭제·상태 변경은 하지 않습니다.
//
// 배포:   supabase functions deploy biz-sync      (또는 대시보드 → Edge Functions → Deploy new function → 이름 biz-sync)
// 비밀값: BIZ_SA_JSON      = 경영지원팀이 준 서비스 계정 키 JSON 파일 내용 전체 (한 줄로 붙여넣기)
//         BIZ_SYNC_SECRET  = pg_cron 이 x-sync-secret 헤더로 보내는 긴 임의 문자열 (migration-biz-sync.sql 8) 참고)
//         BIZ_PROJECT_ID   = (선택) 기본값은 키 JSON 의 project_id (sq-biz)
//         BIZ_PILOT_PREFIX = (선택) 요청 제목 앞에 붙는 표시, 기본 "[시범] " · 정식 전환 때 빈 값으로
//         BIZ_DRY_RUN      = (선택) "1" 이면 그쪽에 아무것도 쓰지 않고 로그만 남김 (첫 점검용)

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  applyRequestToItems, buildContractDoc, buildRequestDoc, bytesToBase64, chunkString, depositIdsOf, docToObj,
  itemAmounts, KIND_LBL, KIND_OF_PHASE, matchContracts, nextRequestNumber, objToFields, PHASE_OF_KIND, phasePatch,
  type OurItem, type PushInput, type TheirDeposit, type TheirRequest,
} from "./lib.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PREFIX = Deno.env.get("BIZ_PILOT_PREFIX") ?? "[시범] ";
const DRY = (Deno.env.get("BIZ_DRY_RUN") || "") === "1";
const REQUESTER = "아파트스퀘어 대시보드";

// ───────── 호출자 확인: cron 비밀값 또는 콘솔 관리자 JWT ─────────
async function callerAllowed(req: Request): Promise<string | null> {
  const secret = Deno.env.get("BIZ_SYNC_SECRET");
  const given = req.headers.get("x-sync-secret");
  if (secret && given && given === secret) return "cron";
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth) return null;
    const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const { data: prof } = await sb.from("profiles").select("role").eq("id", user.id).single();
    return prof && prof.role === "admin" ? "console" : null;
  } catch { return null; }
}

// ───────── Google 서비스 계정 → 액세스 토큰 (RS256 JWT) ─────────
function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
const b64url = (s: string | Uint8Array) => {
  const str = typeof s === "string" ? btoa(unescape(encodeURIComponent(s))) : bytesToBase64(s);
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
async function googleToken(sa: { client_email: string; private_key: string; token_uri?: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: sa.token_uri || "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`)));
  const jwt = `${header}.${claims}.${b64url(sig)}`;
  const r = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!r.ok) throw new Error(`Google 토큰 발급 실패 ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).access_token;
}

// ───────── Firestore REST ─────────
class Fs {
  base: string; token: string;
  constructor(projectId: string, token: string) { this.base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`; this.token = token; }
  async call(method: string, path: string, body?: unknown, query?: Record<string, string | string[]>): Promise<Json> {
    const u = new URL(`${this.base}/${path}`.replace(/\/+$/, ""));
    if (query) for (const [k, v] of Object.entries(query)) (Array.isArray(v) ? v : [v]).forEach((x) => u.searchParams.append(k, x));
    const r = await fetch(u, { method, headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 404 && method === "GET") return null;
    if (!r.ok) throw new Error(`Firestore ${method} ${path} ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return r.status === 204 ? null : await r.json();
  }
  async list(col: string, mask?: string[]): Promise<Record<string, Json>[]> {
    const out: Record<string, Json>[] = []; let token: string | undefined;
    do {
      const q: Record<string, string | string[]> = { pageSize: "300" }; if (token) q.pageToken = token; if (mask) q["mask.fieldPaths"] = mask;
      const res = await this.call("GET", col, undefined, q);
      (res?.documents || []).forEach((d: Json) => out.push(docToObj(d)));
      token = res?.nextPageToken;
    } while (token);
    return out;
  }
  async get(col: string, id: string): Promise<Record<string, Json> | null> { const d = await this.call("GET", `${col}/${encodeURIComponent(id)}`); return d ? docToObj(d) : null; }
  async create(col: string, obj: Record<string, Json>): Promise<string> { const d = await this.call("POST", col, { fields: objToFields(obj) }); return String(d.name).split("/").pop()!; }
  /** 문서 id 지정 생성/부분 수정. mask 를 주면 그 필드만 바꾸고 나머지는 유지(merge) */
  async set(path: string, obj: Record<string, Json>, mask?: string[]): Promise<void> {
    const q: Record<string, string | string[]> = {}; if (mask) q["updateMask.fieldPaths"] = mask;
    await this.call("PATCH", path, { fields: objToFields(obj) }, q);
  }
  /** 그쪽 firebase-db.js uploadBlob 과 같은 저장 구조 (_blobs 단일 문서 또는 chunks 서브컬렉션) */
  async uploadBlob(dataUrl: string, type: string, size: number): Promise<string> {
    const chunks = chunkString(dataUrl);
    if (chunks.length === 1) return await this.create("_blobs", { data: dataUrl, type, size, createdAt: new Date() });
    const id = await this.create("_blobs", { chunked: true, chunkCount: chunks.length, type, size, createdAt: new Date() });
    for (let i = 0; i < chunks.length; i++) await this.set(`_blobs/${id}/chunks/${i}`, { data: chunks[i] });
    return id;
  }
}
type Json = any;

// ───────── 메인 ─────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const source = await callerAllowed(req);
  if (!source) return json({ ok: false, error: "권한 없음 (관리자 로그인 또는 동기화 비밀값 필요)" }, 403);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const logs: Record<string, Json>[] = [];
  const log = (direction: string, action: string, detail: string, extra: Partial<{ ref: string; site: string; ok: boolean }> = {}) =>
    logs.push({ source, direction, action, detail: detail.slice(0, 900), ok: extra.ok !== false, ref: extra.ref || null, site: extra.site || null });
  const flush = async () => { if (logs.length) { await db.from("biz_sync_log").insert(logs.splice(0)); } };
  const now = new Date().toISOString();
  const sum = { contracts: 0, linked: 0, pulled: 0, pushed: 0, errors: 0 };

  try {
    const saRaw = Deno.env.get("BIZ_SA_JSON");
    if (!saRaw) { log("info", "run", "BIZ_SA_JSON 비밀값이 없어 동기화를 건너뜀 (키 등록 전)", { ok: false }); await flush(); return json({ ok: false, error: "BIZ_SA_JSON(서비스 계정 키)이 아직 등록되지 않았어요" }); }
    const sa = JSON.parse(saRaw);
    const projectId = Deno.env.get("BIZ_PROJECT_ID") || sa.project_id || "sq-biz";
    const fs = new Fs(projectId, await googleToken(sa));

    // ① 그쪽 계약 → 캐시
    const theirContracts = await fs.list("contracts");
    sum.contracts = theirContracts.length;
    if (theirContracts.length) {
      const rows = theirContracts.map((c) => ({
        id: c.id, complex_name: c.complexName || c.ctComplexName || null, contract_name: c.contractName || null, client_name: c.clientName || null,
        site_address: c.siteAddress || null, contract_date: c.contractDate || null, total_amount: Math.round(Number(c.totalAmount) || 0),
        phases: { downPayment: c.downPayment || null, interimPayment: c.interimPayment || null, finalPayment: c.finalPayment || null },
        status: c.status || null, updated_at: c.updatedAt || null, fetched_at: now,
      }));
      const { error } = await db.from("biz_contracts").upsert(rows, { onConflict: "id" });
      if (error) log("pull", "contracts-cache", "캐시 저장 실패: " + error.message, { ok: false });
      const ids = new Set(rows.map((r) => r.id));
      const { data: old } = await db.from("biz_contracts").select("id");
      const gone = (old || []).map((x: Json) => x.id).filter((id: string) => !ids.has(id));
      if (gone.length) await db.from("biz_contracts").delete().in("id", gone);
    }
    log("pull", "contracts-cache", `그쪽 계약 ${theirContracts.length}건 읽음`);

    // 우리 데이터
    const { data: ours } = await db.from("site_contracts").select("*").eq("biz_sync", true);
    const contracts: Json[] = ours || [];
    const aptIds = [...new Set(contracts.map((c) => c.apartment_id))];
    const { data: apts } = aptIds.length ? await db.from("apartments").select("id,name,address,region").in("id", aptIds) : { data: [] };
    const aptOf = (id: string) => (apts || []).find((a: Json) => a.id === id) || { id, name: "(현장 없음)" };
    const { data: partners } = await db.from("partners").select("*");
    const partnerOf = (id: string | null) => (partners || []).find((p: Json) => p.id === id) || null;
    const cids = contracts.map((c) => c.id);
    const { data: itemsRaw } = cids.length ? await db.from("receivable_items").select("*").in("site_contract_id", cids) : { data: [] };
    const items: Json[] = itemsRaw || [];
    const csOf = (cid: string) => contracts.find((c) => c.id === cid);
    const ratioOf = (c: Json) => { const r = c.pay_ratio || {}; const d = Number(r.down), m = Number(r.mid) || 0; return d >= 0 && d <= 100 && !isNaN(d) ? { down: d, mid: m, final: Math.max(0, 100 - d - m) } : { down: 50, mid: 0, final: 50 }; };
    const amountOf = (c: Json, i: Json) => i.amount_override != null ? Math.round(Number(i.amount_override) || 0) : (itemAmounts(c.contract_amount, ratioOf(c))[i.kind] || 0);

    // ② 자동 연결 (단지명 정확히 하나만 일치)
    const unlinked = contracts.filter((c) => !c.biz_contract_id).map((c) => ({ id: c.id, aptName: aptOf(c.apartment_id).name }));
    for (const m of matchContracts(unlinked, theirContracts.map((t) => ({ id: t.id, complex_name: t.complexName || t.ctComplexName || "" })))) {
      const t = theirContracts.find((x) => x.id === m.bizId)!; const c = csOf(m.ourId)!;
      const name = [t.complexName || t.ctComplexName, t.contractName].filter(Boolean).join(" · ");
      await db.from("site_contracts").update({ biz_contract_id: m.bizId, biz_contract_name: name, biz_synced_at: now }).eq("id", m.ourId);
      c.biz_contract_id = m.bizId; sum.linked++;
      log("pull", "link", `그쪽 계약과 자동 연결: ${name}`, { ref: m.ourId, site: aptOf(c.apartment_id).name });
    }

    // ③-a 그쪽 계약 phase 에 이미 걸린 요청(운영본부가 그쪽 화면에서 직접 올린 과거 건 포함) → 우리 항목에 연결. PUSH 보다 먼저 해서 중복 요청을 막는다
    const attachFromPhases = () => {
      for (const c of contracts) {
        if (!c.biz_contract_id) continue;
        const t = theirContracts.find((x) => x.id === c.biz_contract_id); if (!t) continue;
        for (const ph of ["downPayment", "interimPayment", "finalPayment"]) {
          const invId = t[ph] && t[ph].invoiceId; if (!invId) continue;
          for (const kind of KIND_OF_PHASE[ph]) {
            const it = items.find((i) => i.site_contract_id === c.id && i.kind === kind);
            if (it && !it.biz_request_id) { it.biz_request_id = String(invId); it._attached = true; }
          }
        }
      }
    };
    attachFromPhases();

    // ④ PUSH — 전송 대기 청구 (묶음은 biz_group 으로 한 번에)
    const pending = items.filter((i) => i.biz_push === "pending");
    const groups = new Map<string, Json[]>();
    for (const i of pending) { const k = i.biz_group ? "g:" + i.biz_group : "i:" + i.id; (groups.get(k) || groups.set(k, []).get(k)!).push(i); }
    let requestNumbers: string[] | null = null;
    for (const [, grp] of groups) {
      const c = csOf(grp[0].site_contract_id)!; const apt = aptOf(c.apartment_id); const partner = partnerOf(c.partner_id);
      const fail = async (msg: string) => {
        sum.errors++; log("push", "create-request", msg, { ok: false, ref: grp[0].id, site: apt.name });
        await db.from("receivable_items").update({ biz_push: "error", biz_error: msg.slice(0, 300), biz_push_at: now }).in("id", grp.map((g) => g.id));
      };
      try {
        if (!partner) { await fail("거래처가 지정되지 않아 전송하지 못함 (계약 건 수정에서 거래처 선택)"); continue; }
        if (!partner.name) { await fail("거래처 정식 상호가 비어 있음"); continue; }
        const requestKind = grp.length > 1 ? "downAndFinal" : (grp[0].request_kind && grp[0].request_kind !== "downAndFinal" ? grp[0].request_kind : grp[0].kind);
        // 중복 방지: 그쪽에 이미 같은 단계의 요청이 있으면(과거에 수기로 올린 건) 새로 만들지 않고 그 요청에 연결만 한다
        const already = grp.map((g) => g.biz_request_id).find(Boolean);
        if (already) {
          await db.from("receivable_items").update({ biz_push: "sent", biz_push_at: now, biz_error: null, biz_request_id: String(already), biz_synced_at: now }).in("id", grp.map((g) => g.id));
          grp.forEach((g) => { g.biz_push = "sent"; g.biz_request_id = String(already); });
          log("push", "attach-existing", `그쪽에 이미 ${KIND_LBL[requestKind]} 요청이 있어 새로 만들지 않고 연결함`, { ref: String(already), site: apt.name });
          continue;
        }
        const amounts = itemAmounts(c.contract_amount, ratioOf(c));
        const pItems = grp.map((i) => ({ id: i.id, kind: i.kind, amount: amountOf(c, i), request_memo: i.request_memo, request_by: i.request_by, request_at: i.request_at }));
        if (pItems.reduce((s, i) => s + i.amount, 0) <= 0) { await fail("청구 금액이 0원 (계약금액·지급 비율 확인)"); continue; }
        if (requestNumbers === null) requestNumbers = (await fs.list("taxInvoiceRequests", ["requestNumber"])).map((r) => r.requestNumber).filter(Boolean);
        const requestNumber = nextRequestNumber(requestNumbers!); requestNumbers!.push(requestNumber);

        // 사업자등록증: 첫 요청에만 (이미 전달했으면 생략 — 경영지원팀 합의)
        const attachments: Json[] = []; let certSent = false;
        if (partner.biz_cert_path && !partner.biz_cert_sent_at) {
          const { data: blob, error: de } = await db.storage.from("partner-docs").download(partner.biz_cert_path);
          if (de || !blob) log("push", "attach", "사업자등록증 파일을 읽지 못해 첨부 없이 진행: " + (de?.message || ""), { ok: false, ref: partner.id, site: apt.name });
          else if (blob.size > 10 * 1024 * 1024) log("push", "attach", "사업자등록증이 10MB 를 넘어 첨부 생략", { ok: false, ref: partner.id, site: apt.name });
          else {
            const type = partner.biz_cert_type || blob.type || "application/octet-stream";
            const dataUrl = `data:${type};base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`;
            const blobId = DRY ? "dry-run" : await fs.uploadBlob(dataUrl, type, blob.size);
            attachments.push({ fileName: partner.biz_cert_name || "사업자등록증", fileType: type, fileData: { __blobRef: blobId }, fileSize: blob.size, category: "bizCert", uploadedAt: now });
            certSent = true;
          }
        }
        const input: PushInput = { items: pItems, requestKind, contract: c, apt, partner, amounts, prefix: PREFIX, requestNumber, requesterName: REQUESTER, attachments, now };
        const reqDoc = buildRequestDoc(input);
        if (DRY) { log("push", "create-request", `[DRY] ${requestNumber} ${KIND_LBL[requestKind]} ${reqDoc.totalAmount}원 → ${partner.name} (쓰지 않음)`, { ref: grp[0].id, site: apt.name }); continue; }

        const reqId = await fs.create("taxInvoiceRequests", reqDoc);
        let bizContractId: string = c.biz_contract_id || "";
        if (!bizContractId) {
          bizContractId = await fs.create("contracts", buildContractDoc(input, reqId));
          await db.from("site_contracts").update({ biz_contract_id: bizContractId, biz_contract_name: `${apt.name} · ${PREFIX}${c.title || "감리 용역"} 감리`, biz_synced_at: now }).eq("id", c.id);
          c.biz_contract_id = bizContractId;
          log("push", "create-contract", `그쪽 계약 생성 (${requestNumber})`, { ref: bizContractId, site: apt.name });
        } else {
          const existing = await fs.get("contracts", bizContractId);
          const patch = phasePatch(existing || {}, requestKind, reqId, amounts);
          await fs.set(`contracts/${bizContractId}`, { ...patch, updatedAt: now, updatedBy: "aptsquare-sync", updatedByName: REQUESTER }, [...Object.keys(patch), "updatedAt", "updatedBy", "updatedByName"]);
        }
        await fs.set(`taxInvoiceRequests/${reqId}`, { linkedContractId: bizContractId, linkedContractPhase: PHASE_OF_KIND[requestKind], updatedAt: now }, ["linkedContractId", "linkedContractPhase", "updatedAt"]);
        for (const att of attachments) {
          await fs.create("documents", { companyName: partner.name, regNumber: partner.reg_no || "", fileName: att.fileName, fileType: att.fileType, fileData: att.fileData, fileSize: att.fileSize, category: "사업자등록증", relatedInvoiceId: reqId, relatedRequestNumber: requestNumber, registeredBy: "aptsquare-sync", registeredByName: REQUESTER, createdAt: now });
        }
        await fs.create("auditLog", { action: "CREATE", entityType: "taxInvoice", entityId: reqId, userId: "aptsquare-sync", userName: REQUESTER, details: `세금계산서 발행 요청(아파트스퀘어 대시보드 자동): ${requestNumber}`, timestamp: now });
        await db.from("receivable_items").update({ biz_push: "sent", biz_push_at: now, biz_error: null, biz_request_id: reqId, biz_request_no: requestNumber, biz_request_status: "요청", biz_synced_at: now }).in("id", grp.map((g) => g.id));
        if (certSent) await db.from("partners").update({ biz_cert_sent_at: now }).eq("id", partner.id);
        grp.forEach((g) => { g.biz_push = "sent"; g.biz_request_id = reqId; g.biz_request_no = requestNumber; g.biz_request_status = "요청"; });
        sum.pushed++;
        log("push", "create-request", `${requestNumber} ${KIND_LBL[requestKind]} ${Number(reqDoc.totalAmount).toLocaleString()}원 → ${partner.name}${certSent ? " · 사업자등록증 첨부" : ""}`, { ref: reqId, site: apt.name });
      } catch (e) { await fail("전송 실패: " + ((e as Error).message || String(e))); }
    }

    // ③-b 연결된 요청의 상태·발행일·입금 → 우리 항목
    const byReq = new Map<string, Json[]>();
    for (const i of items) if (i.biz_request_id) (byReq.get(i.biz_request_id) || byReq.set(i.biz_request_id, []).get(i.biz_request_id)!).push(i);
    const depCache = new Map<string, TheirDeposit | null>();
    for (const [reqId, grp] of byReq) {
      try {
        const r = await fs.get("taxInvoiceRequests", reqId) as TheirRequest | null;
        if (!r) { log("pull", "invoice", "그쪽 요청 문서가 없음(삭제됨?)", { ok: false, ref: reqId, site: aptOf(csOf(grp[0].site_contract_id)!.apartment_id).name }); continue; }
        const deps: TheirDeposit[] = [];
        for (const did of depositIdsOf(r)) {
          if (!depCache.has(did)) depCache.set(did, await fs.get("deposits", did) as TheirDeposit | null);
          const d = depCache.get(did); if (d) deps.push(d);
        }
        const c = csOf(grp[0].site_contract_id)!;
        const ourItems: OurItem[] = grp.map((i) => ({ ...i, amount: amountOf(c, i) }));
        const patches = applyRequestToItems(ourItems, r, deps, now);
        for (const p of patches) {
          const { error } = await db.from("receivable_items").update(p.patch).eq("id", p.id);
          if (error) { log("pull", "invoice", "항목 저장 실패: " + error.message, { ok: false, ref: p.id }); continue; }
          const it = items.find((i) => i.id === p.id); Object.assign(it, p.patch); it._touched = true; sum.pulled++;
          const what = [p.patch.invoice_at !== undefined ? `발행 ${p.patch.invoice_at || "취소"}` : "", p.patch.paid_amount !== undefined ? `입금 ${p.patch.paid_amount || 0}` : "", p.patch.biz_request_status ? `상태 ${p.patch.biz_request_status}` : ""].filter(Boolean).join(" · ");
          log("pull", p.patch.paid_amount !== undefined ? "deposit" : "invoice", `${KIND_LBL[it.kind]} ${what}${r.requestNumber ? " (" + r.requestNumber + ")" : ""}`, { ref: p.id, site: aptOf(c.apartment_id).name });
        }
      } catch (e) { sum.errors++; log("pull", "invoice", "읽기 실패: " + ((e as Error).message || String(e)), { ok: false, ref: reqId }); }
    }

    // 입금 합계 → 계약 건 수금액 → 현장 수금액 (콘솔 arSyncContract/syncAptFromContracts 와 같은 규칙)
    const touchedC = [...new Set(items.filter((i) => i._touched).map((i) => i.site_contract_id))];
    for (const cid of touchedC) {
      const c = csOf(cid)!; const paid = items.filter((i) => i.site_contract_id === cid).reduce((s, i) => s + (Number(i.paid_amount) || 0), 0);
      if (Math.round(Number(c.received_amount) || 0) !== paid) {
        await db.from("site_contracts").update({ received_amount: paid, updated_at: now }).eq("id", cid); c.received_amount = paid;
        const { data: sib } = await db.from("site_contracts").select("received_amount").eq("apartment_id", c.apartment_id);
        const total = (sib || []).reduce((s: number, x: Json) => s + (Number(x.received_amount) || 0), 0);
        await db.from("apartments").update({ received_amount: total }).eq("id", c.apartment_id);
      }
    }

    const summary = `그쪽 계약 ${sum.contracts}건 · 자동 연결 ${sum.linked} · 발행/입금 반영 ${sum.pulled} · 요청 전송 ${sum.pushed} · 오류 ${sum.errors}${DRY ? " · DRY RUN" : ""}`;
    log("info", "run", summary, { ok: sum.errors === 0 });
    await flush();
    return json({ ok: true, summary, ...sum });
  } catch (e) {
    const msg = (e as Error).message || String(e);
    log("info", "run", "동기화 중단: " + msg, { ok: false });
    await flush();
    return json({ ok: false, error: msg }, 500);
  }
});
