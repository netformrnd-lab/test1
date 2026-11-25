// biz-sync 순수 로직 — Firestore 값 변환 · 이름 매칭 · 요청/계약 문서 만들기 · 발행·입금 반영 규칙
// 의존성 없음. Deno(index.ts)와 Node 테스트(lib.test.mjs)가 같이 씁니다.

export type Json = any;

// ───────── Firestore REST 값 ↔ JS 값 ─────────
export function toFs(v: Json): Json {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === "object") {
    const fields: Record<string, Json> = {};
    for (const k of Object.keys(v)) if (v[k] !== undefined) fields[k] = toFs(v[k]);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}
export function fromFs(v: Json): Json {
  if (!v || typeof v !== "object") return v;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFs);
  if ("mapValue" in v) return fieldsToObj(v.mapValue.fields || {});
  if ("referenceValue" in v) return v.referenceValue;
  if ("geoPointValue" in v) return v.geoPointValue;
  return v;
}
export function fieldsToObj(fields: Record<string, Json>): Record<string, Json> {
  const o: Record<string, Json> = {};
  for (const k of Object.keys(fields || {})) o[k] = fromFs(fields[k]);
  return o;
}
export function objToFields(o: Record<string, Json>): Record<string, Json> {
  const f: Record<string, Json> = {};
  for (const k of Object.keys(o)) if (o[k] !== undefined) f[k] = toFs(o[k]);
  return f;
}
/** Firestore 문서(name + fields) → {id, ...값} */
export function docToObj(doc: Json): Record<string, Json> {
  const id = String(doc.name || "").split("/").pop() || "";
  return { id, ...fieldsToObj(doc.fields || {}) };
}

// ───────── 이름 정규화 · 계약 매칭 ─────────
export function normName(s: Json): string {
  return String(s || "")
    .replace(/^\[[^\]]*\]\s*/, "")
    .replace(/\(주\)|주식회사|\(유\)|유한회사|아파트|APT|apt/g, "")
    .replace(/[\s\-_·.,()]/g, "")
    .toLowerCase();
}
/** 우리 계약 건(현장명) ↔ 그쪽 계약(단지명) — 정규화 이름이 정확히 하나만 맞을 때만 자동 연결 */
export function matchContracts(
  ours: { id: string; aptName: string }[],
  theirs: { id: string; complex_name: string }[],
): { ourId: string; bizId: string }[] {
  const out: { ourId: string; bizId: string }[] = [];
  for (const o of ours) {
    const n = normName(o.aptName);
    if (!n) continue;
    const exact = theirs.filter((t) => normName(t.complex_name) === n);
    if (exact.length === 1) out.push({ ourId: o.id, bizId: exact[0].id });
  }
  return out;
}

// ───────── 청구 구분 ─────────
export const PHASE_OF_KIND: Record<string, string> = { down: "downPayment", mid: "interimPayment", final: "finalPayment", downAndFinal: "downAndFinal" };
export const KIND_OF_PHASE: Record<string, string[]> = { downPayment: ["down"], interimPayment: ["mid"], finalPayment: ["final"], downAndFinal: ["down", "final"] };
export const KIND_LBL: Record<string, string> = { down: "계약금", mid: "중도금", final: "잔금", downAndFinal: "계약금+잔금" };

/** VAT 포함 합계 → 공급가/세액 (그쪽 폼의 'VAT 포함' 입력 방식과 동일: 공급가 = 합계/1.1 반올림) */
export function splitVat(total: number): { amount: number; taxAmount: number; totalAmount: number } {
  const t = Math.max(0, Math.round(Number(total) || 0));
  const amount = Math.round(t / 1.1);
  return { amount, taxAmount: t - amount, totalAmount: t };
}
/** 지급 비율로 항목 금액 (콘솔 paySplit 과 같은 규칙: 계약금·중도금은 내림 반올림, 잔금 = 나머지) */
export function itemAmounts(contractAmount: number, ratio: { down: number; mid: number; final: number }): Record<string, number> {
  const ca = Math.max(0, Math.round(Number(contractAmount) || 0));
  const down = Math.round(ca * (Number(ratio.down) || 0) / 100);
  const mid = Math.round(ca * (Number(ratio.mid) || 0) / 100);
  return { down, mid, final: Math.max(0, ca - down - mid) };
}
/** 입금 합계를 항목 순서대로 채움 (계약금 → 중도금 → 잔금) */
export function allocate(total: number, amounts: number[]): number[] {
  let left = Math.max(0, Math.round(Number(total) || 0));
  return amounts.map((a, i) => {
    const take = i === amounts.length - 1 ? left : Math.min(left, Math.max(0, a));
    left -= take;
    return take;
  });
}
export function nextRequestNumber(existing: string[], now = new Date()): string {
  const yy = String(now.getFullYear()).slice(2);
  const nums = existing
    .filter((n) => typeof n === "string" && n.startsWith(`TIR-${yy}-`))
    .map((n) => parseInt(n.split("-")[2], 10))
    .filter((n) => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `TIR-${yy}-${String(next).padStart(4, "0")}`;
}

// ───────── 그쪽 문서 만들기 ─────────
export interface PushInput {
  items: { id: string; kind: string; amount: number; request_memo?: string | null; request_by?: string | null; request_at?: string | null }[];
  requestKind: string; // down / mid / final / downAndFinal
  contract: { id: string; title?: string | null; seq?: number | null; contract_date?: string | null; contract_amount?: number | null; biz_contract_id?: string | null };
  apt: { id: string; name: string; address?: string | null; region?: string | null };
  partner: { id: string; name: string; reg_no?: string | null; rep_name?: string | null; email?: string | null; address?: string | null; biz_type?: string | null; biz_item?: string | null };
  amounts: Record<string, number>; // 계약금·중도금·잔금 (항목 금액)
  prefix: string; // '[시범] '
  requestNumber: string;
  requesterName: string;
  attachments: Json[];
  now: string; // ISO
}
export function buildRequestDoc(p: PushInput): Record<string, Json> {
  const total = p.items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const v = splitVat(total);
  const lbl = KIND_LBL[p.requestKind] || p.requestKind;
  const work = p.contract.title ? ` ${p.contract.title}` : "";
  const seq = (p.contract.seq || 1) > 1 ? ` ${p.contract.seq}차` : "";
  const memo = p.items.map((i) => i.request_memo).filter(Boolean).join(" / ");
  const by = p.items.map((i) => i.request_by).filter(Boolean)[0] || "";
  return {
    requestNumber: p.requestNumber,
    requesterId: "aptsquare-sync",
    requesterName: by ? `${p.requesterName}(${by})` : p.requesterName,
    status: "요청",
    reason: `${p.prefix}${p.apt.name}${work}${seq} 감리 ${lbl} 세금계산서 발행 요청${memo ? " · " + memo : ""}`,
    amount: v.amount,
    taxAmount: v.taxAmount,
    totalAmount: v.totalAmount,
    partnerCompanyName: p.partner.name,
    partnerRegNumber: p.partner.reg_no || "",
    partnerRepName: p.partner.rep_name || "",
    partnerEmail: p.partner.email || "",
    partnerAddress: p.partner.address || "",
    partnerBusinessType: p.partner.biz_type || "",
    partnerBusinessItem: p.partner.biz_item || "",
    attachments: p.attachments,
    requestChannel: "시스템",
    verbalRequester: "",
    verbalRequestDate: "",
    projectName: `${p.prefix}${p.apt.name}${work}${seq}`,
    memo: `아파트스퀘어 대시보드 자동 요청 · ${lbl} · 청구일 ${p.items[0]?.request_at || ""} · 항목 ${p.items.map((i) => i.id).join(",")}`,
    linkedContractId: p.contract.biz_contract_id || null,
    linkedContractPhase: p.contract.biz_contract_id ? PHASE_OF_KIND[p.requestKind] : null,
    reviewerId: null,
    reviewerName: null,
    reviewedAt: null,
    issueDate: null,
    rejectReason: null,
    matchedDepositId: null,
    source: "aptsquare",
    aptsquareContractId: p.contract.id,
    aptsquareItemIds: p.items.map((i) => i.id),
    createdAt: p.now,
    updatedAt: p.now,
  };
}
export function buildContractDoc(p: PushInput, requestId: string): Record<string, Json> {
  const phases: Record<string, Json> = {
    downPayment: { amount: p.amounts.down || 0, invoiceId: null },
    interimPayment: { amount: p.amounts.mid || 0, invoiceId: null },
    finalPayment: { amount: p.amounts.final || 0, invoiceId: null },
  };
  for (const k of KIND_OF_PHASE[PHASE_OF_KIND[p.requestKind]] || []) phases[PHASE_OF_KIND[k]].invoiceId = requestId;
  const work = p.contract.title || "감리 용역";
  const seq = (p.contract.seq || 1) > 1 ? ` ${p.contract.seq}차` : "";
  return {
    complexName: p.apt.name,
    contractName: `${p.prefix}${work}${seq} 감리`,
    siteAddress: p.apt.address || "",
    clientName: p.partner.name,
    contractDate: (p.contract.contract_date || p.now).slice(0, 10),
    totalAmount: Math.round(Number(p.contract.contract_amount) || 0) || (p.amounts.down + p.amounts.mid + p.amounts.final),
    ...phases,
    status: "진행중",
    memo: `아파트스퀘어 대시보드에서 자동 등록 (${p.requestNumber})`,
    createdAt: p.now,
    updatedAt: p.now,
    createdBy: "aptsquare-sync",
    updatedBy: "aptsquare-sync",
    updatedByName: p.requesterName,
    importedFrom: "aptsquare",
    aptsquareContractId: p.contract.id,
  };
}
/** 기존 그쪽 계약에 이번 요청을 연결할 때 바꿀 phase 필드들 */
export function phasePatch(existing: Record<string, Json>, requestKind: string, requestId: string, amounts: Record<string, number>): Record<string, Json> {
  const patch: Record<string, Json> = {};
  for (const k of KIND_OF_PHASE[PHASE_OF_KIND[requestKind]] || []) {
    const ph = PHASE_OF_KIND[k];
    const cur = (existing && existing[ph] && typeof existing[ph] === "object") ? existing[ph] : { amount: 0, invoiceId: null };
    patch[ph] = { amount: Number(cur.amount) || amounts[k] || 0, invoiceId: requestId };
  }
  return patch;
}

// ───────── 그쪽 발행 요청 · 입금 → 우리 청구 항목 반영 ─────────
export const SYNC_BY = "경영지원 연동";
export interface OurItem {
  id: string; kind: string; amount: number;
  request_at?: string | null; request_by?: string | null;
  invoice_at?: string | null; invoice_amount?: number | null; invoice_by?: string | null;
  paid_at?: string | null; paid_amount?: number | null; paid_by?: string | null; status?: string | null;
  biz_request_id?: string | null; biz_request_no?: string | null; biz_request_status?: string | null; biz_reject_reason?: string | null; biz_deposit_ids?: Json;
}
export interface TheirRequest { id: string; requestNumber?: string; status?: string; createdAt?: string | null; issueDate?: string | null; totalAmount?: number; rejectReason?: string | null; cancelReason?: string | null; matchedDepositId?: string | null; matchedDepositIds?: string[] | null; linkedContractPhase?: string | null }
export interface TheirDeposit { id: string; depositDate?: string; amount?: number }

export function depositIdsOf(r: TheirRequest): string[] {
  const ids: string[] = [];
  if (Array.isArray(r.matchedDepositIds)) r.matchedDepositIds.forEach((x) => x != null && ids.push(String(x)));
  if (r.matchedDepositId != null && r.matchedDepositId !== "" && !ids.includes(String(r.matchedDepositId))) ids.push(String(r.matchedDepositId));
  return ids;
}
/** 요청 1건(여러 항목일 수 있음: 계약금+잔금) → 항목별 patch. 수기 입력(by가 연동이 아닌 것)은 덮어쓰지 않음 */
export function applyRequestToItems(items: OurItem[], r: TheirRequest, deposits: TheirDeposit[], now: string): { id: string; patch: Record<string, Json> }[] {
  const out: { id: string; patch: Record<string, Json> }[] = [];
  const st = r.status || "요청";
  const issued = st === "발행완료" && !!r.issueDate;
  const depSum = deposits.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const depDate = deposits.map((d) => String(d.depositDate || "").slice(0, 10)).filter(Boolean).sort().pop() || null;
  const depIds = deposits.map((d) => d.id);
  const ordered = [...items].sort((a, b) => ["down", "mid", "final"].indexOf(a.kind) - ["down", "mid", "final"].indexOf(b.kind));
  const invShare = allocate(Number(r.totalAmount) || ordered.reduce((s, i) => s + i.amount, 0), ordered.map((i) => i.amount));
  const paidShare = allocate(depSum, ordered.map((i) => i.amount));
  ordered.forEach((i, idx) => {
    const patch: Record<string, Json> = {};
    const set = (k: string, v: Json) => { if ((i as Json)[k] !== v && !(v == null && (i as Json)[k] == null)) patch[k] = v; };
    set("biz_request_id", r.id);
    set("biz_request_no", r.requestNumber || null);
    set("biz_request_status", st);
    set("biz_reject_reason", st === "반려" ? (r.rejectReason || null) : (st === "취소" ? (r.cancelReason || "취소") : null));
    // 그쪽에서 먼저 요청·발행된 건(우리 청구 요청일이 비어 있음) → 그쪽 요청일을 기준일로 채워 '청구 필요'에서 빠지고 회수 알림이 이어지게
    if (!i.request_at && st !== "취소" && (r.createdAt || r.issueDate)) { set("request_at", String(r.createdAt || r.issueDate).slice(0, 10)); set("request_by", SYNC_BY); set("request_kind", r.linkedContractPhase === "downAndFinal" ? "downAndFinal" : i.kind); }
    const invOurs = !i.invoice_by || i.invoice_by === SYNC_BY;
    if (invOurs) {
      if (issued) { set("invoice_at", String(r.issueDate).slice(0, 10)); set("invoice_amount", invShare[idx]); set("invoice_by", SYNC_BY); }
      else if (i.invoice_by === SYNC_BY) { set("invoice_at", null); set("invoice_amount", null); set("invoice_by", null); }
    }
    const paidOurs = !i.paid_by || i.paid_by === SYNC_BY;
    if (paidOurs && st !== "취소") {
      if (depSum > 0) {
        const amt = paidShare[idx];
        set("paid_amount", amt > 0 ? amt : null); set("paid_at", amt > 0 ? depDate : null); set("paid_by", amt > 0 ? SYNC_BY : null);
        set("status", amt > 0 && amt >= i.amount ? "paid" : "open");
        set("biz_deposit_ids", depIds);
      } else if (i.paid_by === SYNC_BY) { set("paid_amount", null); set("paid_at", null); set("paid_by", null); set("status", "open"); set("biz_deposit_ids", null); }
    }
    if (Object.keys(patch).length) { patch.biz_synced_at = now; out.push({ id: i.id, patch }); }
  });
  return out;
}

// ───────── base64 · 청크 ─────────
export const BLOB_CHUNK_CHARS = 700 * 1024; // 그쪽 firebase-db.js 와 동일
export function chunkString(s: string, size = BLOB_CHUNK_CHARS): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH)) as Json);
  // deno-lint-ignore no-explicit-any
  return (globalThis as any).btoa(bin);
}
