// Same-origin path; next.config.ts rewrites /api/* server-side to the backend.
const API_BASE = "";

// Exports (ExportButton.tsx) call the backend directly instead of through the
// same-origin rewrite above: Next.js's own dev-server proxy silently times
// out around 30s, well under how long a full/bulk CSV export (hundreds of
// thousands of rows) can take, and no per-route config was found to raise
// that proxy's own timeout. The backend's CORS is already open to this
// origin, so hitting it directly just sidesteps the proxy's limit entirely.
export const BACKEND_ORIGIN = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8123";

export function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = sessionStorage.getItem("waip_session_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** On a 401 (session expired or token invalid - see app/core/security.py),
 * every page was showing a confusing generic "Failed to load data... is the
 * backend running?" banner, which is actively misleading since the backend
 * is fine - the session just expired (12h TTL, see session_store.py). Clear
 * the stale session and bounce to /login instead, where the reason is
 * actually explained. */
function handleUnauthorized(): never {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem("waip_session");
    sessionStorage.removeItem("waip_session_email");
    sessionStorage.removeItem("waip_session_role");
    sessionStorage.removeItem("waip_session_token");
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login?reason=expired";
    }
  }
  throw new Error("Session expired - redirecting to sign in.");
}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store", headers: authHeaders() });
  if (res.status === 401) return handleUnauthorized();
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status} on ${path}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export interface ExecutiveKpis {
  TOTAL_DEVICES: number;
  FRESH_GRN: number;
  SSOT_CSP: number;
  OTHER_SOURCE: number;
  NEVER_DISPATCHED: number;
  DISPATCHED: number;
  CUSTOMER_DEVICES: number;
  PARTNER_DEVICES: number;
  RETURNED_DEVICES: number;
  WAREHOUSE_DEVICES: number;
  UNKNOWN_HOLDER: number;
  UNKNOWN_HOLDER_FRESH_GRN: number;
  UNKNOWN_HOLDER_OTHER_SOURCE: number;
  UNKNOWN_HOLDER_SSOT_CSP: number;
  INSTALLED: number;
  DEPLOYED: number;
  STATUS_RETURNED: number;
  LOST: number;
  WRITTEN_OFF: number;
  IDLE: number;
  CUSTODIED: number;
  OTHER_STATUS: number;
  STATUS_UNKNOWN: number;
  CUSTOMER_RECOVERY_PENDING: number;
  RETRIEVAL_PENDING: number;
  PENDING_CSP_RECEIPT: number;
  RTO_INITIATED: number;
  STATUS_IN_WAREHOUSE: number;
  RECHARGE_ACTIVE: number;
  RECHARGE_EXPIRED: number;
  NO_RECHARGE_HISTORY: number;
  AGED_180_PLUS: number;
  AGED_365_PLUS: number;
}

export interface InventoryBreakdown {
  by_source: Record<string, number>;
  detail: Array<{
    GRN_SOURCE_BUCKET: string;
    DISPATCH_BUCKET: string;
    HOLDER_BUCKET: string;
    STATUS_NORMALIZED: string;
    DEVICE_COUNT: number;
  }>;
}

export interface AgeingMatrix {
  bucket_order: string[];
  totals_by_bucket: Record<string, number>;
  detail: Array<{
    AGING_BUCKET: string;
    STATUS_NORMALIZED: string;
    HOLDER_BUCKET: string;
    DEVICE_COUNT: number;
  }>;
}

export interface AgeingSegmentMatrix {
  segments: string[];
  statuses: string[];
  buckets: string[];
  detail: Array<{
    SEGMENT: string;
    STATUS_NORMALIZED: string;
    AGING_BUCKET: string;
    DEVICE_COUNT: number;
  }>;
}

export interface DeviceSearchResult {
  DEVICE_ID: string;
  MAC_ID: string | null;
  SERIAL: string | null;
  MODEL: string | null;
  DEVICE_TYPE: string | null;
  CURRENT_LOCATION_RESOLVED: string | null;
  HOLDER_BUCKET: string;
  STATUS_NORMALIZED: string;
  PARTNER_ACCOUNT_ID: string | null;
  CUSTOMER_ACCOUNT_ID: string | null;
  AGING_BUCKET: string;
}

export type DeviceProfile = Record<string, string | number | null>;

export interface DeviceHistoryEvent {
  EVENT_AT: string | null;
  SOURCE: "custody" | "inventory";
  EVENT_TYPE: string | null;
  FROM_STATE: string | null;
  TO_STATE: string | null;
  REASON: string | null;
  TRIGGERED_BY: string | null;
  NOTE: string | null;
  CSP_ID: string | null;
  CUSTOMER_ID: string | null;
  EPISODE_ID: string | null;
}

export interface DeviceHistory {
  device_id: string;
  events: DeviceHistoryEvent[];
}

export interface AssetRegisterCoverage {
  data_starts: string;
  note: string;
}

export interface PurchaseWriteoffResponse {
  coverage: AssetRegisterCoverage;
  device_types: string[];
  rows: Array<{ KIND: "purchase" | "write_off"; DEVICE_TYPE_NORMALIZED: string; FY: string; DEVICE_COUNT: number }>;
}

export interface CumulativeFyRow {
  fy: string;
  purchased_this_year: number;
  written_off_this_year: number;
  cumulative_purchased: number;
  cumulative_written_off: number;
  pct_of_cumulative: number;
  pct_of_cumulative_vs_prior_year: number;
}

export interface CumulativeResponse {
  coverage: AssetRegisterCoverage;
  fiscal_years: string[];
  by_device_type: Record<string, CumulativeFyRow[]>;
}

export interface CohortRow {
  cohort_fy: string;
  total_purchased: number;
  cumulative_written_off_by_closure: Record<string, number>;
  active: number;
  written_off_pct_to_date: number;
}

export interface CohortResponse {
  coverage: AssetRegisterCoverage;
  closures: string[];
  by_device_type: Record<string, CohortRow[]>;
}

export interface LocationWriteoffResponse {
  coverage: AssetRegisterCoverage;
  cutoff_date: string;
  rows: Array<{ WRITEOFF_FY: string; LOCATION: string; RECENCY: string; DEVICE_COUNT: number }>;
}

export interface VintageRow {
  INVOICE_YEAR: number;
  DEVICE_TYPE_NORMALIZED: string;
  TOTAL_PURCHASED: number;
  WRITTEN_OFF: number;
  LOST: number;
  WRITTEN_OFF_OR_LOST: number;
  STILL_DEPLOYED: number;
  STILL_INSTALLED: number;
  AGED_365_PLUS: number;
  written_off_or_lost_rate_pct: number;
}

export interface VintageMatrix {
  coverage: { total_devices: number; with_invoice_date: number; coverage_pct: number };
  rows: VintageRow[];
}

export interface PartnerRow {
  PARTNER_ACCOUNT_ID: string;
  TOTAL_DEVICES: number;
  DEPLOYED_AT_CUSTOMER: number;
  CURRENTLY_WITH_PARTNER: number;
  DEPLOYED: number;
  CUSTOMER_RECOVERY_PENDING: number;
  LOST: number;
  WRITTEN_OFF: number;
  IDLE: number;
  CUSTODIED: number;
  RETRIEVAL_PENDING: number;
  AGED_365_PLUS: number;
  LOST_OR_WRITTEN_OFF: number;
  lost_or_written_off_rate_pct: number;
  PARTNER_NAME: string | null;
  PARTNER_MOBILE: string | null;
  PARTNER_STATUS: string | null;
  ZONE: string | null;
  CITY: string | null;
  ACCOUNT_MANAGER: string | null;
  /** "CSP" = has a live row in the CSP gateway's account table.
   * "EX_CSP" = has devices attributed but churned/never onboarded. */
  CSP_STATUS: "CSP" | "EX_CSP";
}

export interface WarehouseRow {
  WAREHOUSE: string;
  TOTAL_DEVICES: number;
  IN_WAREHOUSE: number;
  IDLE: number;
  LOST: number;
  WRITTEN_OFF: number;
  AGED_365_PLUS: number;
  CURRENTLY_IN_WIOM_CUSTODY: number;
}

export interface LostDevicesSummary {
  total_lost: number;
  total_written_off: number;
  total_lost_or_wo: number;
  by_device_type: Array<{ DEVICE_TYPE_NORMALIZED: string; LOST: number; WRITTEN_OFF: number; TOTAL: number }>;
  by_holder: Array<{ HOLDER_BUCKET: string; LOST: number; WRITTEN_OFF: number; TOTAL: number }>;
  by_invoice_year: Array<{ INVOICE_YEAR: number; LOST: number; WRITTEN_OFF: number; TOTAL: number }>;
}

export interface LostDeviceRow {
  DEVICE_ID: string;
  MAC_ID: string | null;
  DEVICE_TYPE_NORMALIZED: string;
  STATUS_NORMALIZED: string;
  HOLDER_BUCKET: string;
  CURRENT_LOCATION_RESOLVED: string | null;
  PARTNER_ACCOUNT_ID: string | null;
  CUSTOMER_ACCOUNT_ID: string | null;
  INVOICE_YEAR: number | null;
  AGING_BUCKET: string;
}

export interface LostDevicesListResponse {
  rows: LostDeviceRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface CustomerKpis {
  total_customer_devices: number;
  deployed: number;
  installed: number;
  lost: number;
  written_off: number;
  financial_wo: number;
  non_financial_wo: number;
  idle: number;
  recharge_active: number;
  recharge_expired: number;
}

export interface CustomerRow {
  CUSTOMER_ACCOUNT_ID: string;
  TOTAL_DEVICES: number;
  DEPLOYED: number;
  INSTALLED: number;
  LOST: number;
  WRITTEN_OFF: number;
  FINANCIAL_WO: number;
  NON_FINANCIAL_WO: number;
  IDLE: number;
  RECHARGE_ACTIVE: number;
  RECHARGE_EXPIRED: number;
}

export interface SchemaQueryEntry {
  sql: string;
  kind: "statement" | "expression";
  label: string;
  is_default: boolean;
}

export type SchemaConfig = Record<string, SchemaQueryEntry>;

/** Merged Partners + CSP Devices view - one endpoint (/api/partners/summary)
 * returns overall KPIs, a device-type breakdown, and the partner leaderboard,
 * all under the same filter set. These two tabs used to show overlapping
 * partner populations from two angles; CSP Devices' "top 50 partners" was
 * just a capped subset of this same leaderboard. */
export interface PartnerSummaryResponse {
  kpis: {
    total_devices: number;
    deployed: number;
    installed: number;
    lost: number;
    written_off: number;
    idle: number;
    custodied: number;
    recharge_active: number;
    recharge_expired: number;
    no_recharge_history: number;
    at_customer: number;
    with_partner: number;
    returned_to_wiom: number;
    in_warehouse: number;
  };
  by_device_type: Array<{
    DEVICE_TYPE_NORMALIZED: string;
    DEVICE_COUNT: number;
    DEPLOYED: number;
    LOST: number;
    WRITTEN_OFF: number;
  }>;
  leaderboard: { rows: PartnerRow[]; total_partners: number };
}

export interface UserRecord {
  email: string;
  role: "admin" | "viewer";
}

export interface AuditLogEntry {
  timestamp: string;
  actor: string;
  action: string;
  details: string;
}

async function postJson<T>(path: string, body?: unknown, method: "POST" | "PUT" | "DELETE" = "POST"): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", ...authHeaders() },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 401) return handleUnauthorized();
  const parsed = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parsed.detail ?? `HTTP ${res.status}`);
  return parsed as T;
}

export const api = {
  executiveKpis: (queryString = "") => request<ExecutiveKpis>(`/api/executive/kpis${queryString}`),
  inventoryBreakdown: (queryString = "") => request<InventoryBreakdown>(`/api/inventory/breakdown${queryString}`),
  newGrn: (limit = 100, offset = 0) =>
    request<{ rows: Array<Record<string, unknown>> }>(
      `/api/inventory/new-grn?limit=${limit}&offset=${offset}`
    ),
  ageingMatrix: (queryString = "") => request<AgeingMatrix>(`/api/ageing/matrix${queryString}`),
  ageingSegmentMatrix: (queryString = "") =>
    request<AgeingSegmentMatrix>(`/api/ageing/segment-matrix${queryString}`),
  searchDevices: (q: string) =>
    request<{ query: string; results: DeviceSearchResult[] }>(
      `/api/devices/search?q=${encodeURIComponent(q)}`
    ),
  deviceProfile: (deviceId: string) =>
    request<DeviceProfile>(`/api/devices/${encodeURIComponent(deviceId)}`),
  deviceHistory: (deviceId: string) =>
    request<DeviceHistory>(`/api/devices/${encodeURIComponent(deviceId)}/history`),
  vintageMatrix: (queryString = "") => request<VintageMatrix>(`/api/vintage/writeoff-matrix${queryString}`),
  assetRegisterPurchaseWriteoff: () => request<PurchaseWriteoffResponse>("/api/asset-register/purchase-writeoff"),
  assetRegisterCumulative: () => request<CumulativeResponse>("/api/asset-register/cumulative"),
  assetRegisterCohort: () => request<CohortResponse>("/api/asset-register/cohort-writeoff"),
  assetRegisterLocationWriteoff: () => request<LocationWriteoffResponse>("/api/asset-register/location-writeoff"),
  dataQuality: () =>
    request<{
      total_rows_before_id_filter: number;
      blank_device_id_rows_excluded: number;
      note: string;
    }>("/api/executive/data-quality"),
  partnerLeaderboard: (limit = 100, queryString = "", cspStatus = "") =>
    request<{ rows: PartnerRow[]; total_partners: number }>(
      `/api/partners/leaderboard?limit=${limit}${queryString ? "&" + queryString.slice(1) : ""}${
        cspStatus ? `&csp_status=${cspStatus}` : ""
      }`
    ),
  partnerSummary: (limit = 5000, queryString = "", cspStatus = "", grnSourceBucket = "") =>
    request<PartnerSummaryResponse>(
      `/api/partners/summary?limit=${limit}${queryString ? "&" + queryString.slice(1) : ""}${
        cspStatus ? `&csp_status=${cspStatus}` : ""
      }${grnSourceBucket ? `&grn_source_bucket=${grnSourceBucket}` : ""}`
    ),
  warehouseBreakdown: (limit = 100, queryString = "") =>
    request<{ rows: WarehouseRow[]; total_warehouses: number }>(
      `/api/warehouses/breakdown?limit=${limit}${queryString ? "&" + queryString.slice(1) : ""}`
    ),
  lostDevicesSummary: (queryString = "") => request<LostDevicesSummary>(`/api/lost-devices/summary${queryString}`),
  lostDevicesList: (limit = 100, offset = 0, queryString = "", search = "") =>
    request<LostDevicesListResponse>(
      `/api/lost-devices/list?limit=${limit}&offset=${offset}${
        queryString ? "&" + queryString.slice(1) : ""
      }${search ? `&search=${encodeURIComponent(search)}` : ""}`
    ),
  customerSummary: (limit = 200, queryString = "") =>
    request<{ kpis: CustomerKpis; leaderboard: { rows: CustomerRow[]; total_customers: number } }>(
      `/api/customers/summary?limit=${limit}${queryString ? "&" + queryString.slice(1) : ""}`
    ),
  schemaConfig: () => request<SchemaConfig>("/api/schema-config"),
  updateSchemaQuery: (name: string, sql: string) =>
    postJson<SchemaQueryEntry>(`/api/schema-config/${encodeURIComponent(name)}`, { sql }, "PUT"),
  resetSchemaQuery: (name: string) =>
    postJson<SchemaQueryEntry>(`/api/schema-config/${encodeURIComponent(name)}/reset`),
  testSchemaQuery: (name: string, sql: string) =>
    postJson<{ row_count: number }>(`/api/schema-config/${encodeURIComponent(name)}/test`, { sql }),
  login: async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail ?? "Incorrect email or password");
    return body as { email: string; role: "admin" | "viewer"; token: string };
  },
  logout: () => postJson<{ ok: boolean }>("/api/auth/logout"),
  listUsers: () => request<{ users: UserRecord[] }>("/api/auth/users"),
  addUser: (email: string, password: string, role: "admin" | "viewer") =>
    postJson<{ users: UserRecord[] }>("/api/auth/users", { email, password, role }),
  deleteUser: (email: string) =>
    postJson<{ users: UserRecord[] }>(`/api/auth/users/${encodeURIComponent(email)}`, undefined, "DELETE"),
  auditLog: (limit = 200) => request<{ entries: AuditLogEntry[] }>(`/api/audit-log?limit=${limit}`),
  cacheStatus: () =>
    request<{ last_synced_at: string | null; last_synced_reason: string | null; daily_sync_hour_ist: number }>(
      "/api/cache/status"
    ),
  refreshCache: () => postJson<{ refreshed_at: string }>("/api/cache/refresh"),
};
