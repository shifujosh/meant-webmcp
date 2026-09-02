const WORKSPACE_PATTERN = /^[a-zA-Z0-9-]{12,96}$/;
const ID_PATTERN = /^[a-zA-Z0-9._:-]{3,160}$/;
const SESSION_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{32,128}$/;
export const MEANT_SESSION_COOKIE = "meant_session";

export function validWorkspaceId(value: unknown): value is string {
  return typeof value === "string" && WORKSPACE_PATTERN.test(value);
}

export function validPublicId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

export async function readBoundedBody(request: Request, maximumBytes: number, label = "Request") {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    return { ok: false as const, response: Response.json({ error: `${label} exceeds the input limit` }, { status: 413 }) };
  }
  const reader = request.body?.getReader();
  if (!reader) return { ok: false as const, response: Response.json({ error: `${label} requires a JSON body` }, { status: 400 }) };
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false as const, response: Response.json({ error: `${label} exceeds the input limit` }, { status: 413 }) };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { ok: true as const, value: bytes };
  } catch {
    return { ok: false as const, response: Response.json({ error: `${label} could not be read` }, { status: 400 }) };
  }
}

export async function readBoundedJson<T>(request: Request, maximumBytes: number, label = "Request") {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return { ok: false as const, response: Response.json({ error: `${label} requires JSON` }, { status: 415 }) };
  }
  const body = await readBoundedBody(request, maximumBytes, label);
  if (!body.ok) return body;
  try {
    return { ok: true as const, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body.value)) as T };
  } catch {
    return { ok: false as const, response: Response.json({ error: `${label} requires valid JSON` }, { status: 400 }) };
  }
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function sameOriginRequest(request: Request, environment = process.env.NODE_ENV) {
  if (environment !== "production") return true;
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) return false;
    } catch {
      return false;
    }
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none";
}

export function browserSessionToken(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (name === MEANT_SESSION_COOKIE) {
      return SESSION_TOKEN_PATTERN.test(value) ? value : null;
    }
  }
  return null;
}

export function createBrowserSessionToken() {
  return `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

export async function requestPrincipal(request: Request, environment = process.env.NODE_ENV) {
  if (!sameOriginRequest(request, environment)) return null;
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (email && email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { id: `chatgpt-${await sha256(email)}`, source: "chatgpt" as const };
  }
  const sessionToken = browserSessionToken(request);
  if (sessionToken) {
    return { id: `session-${await sha256(sessionToken)}`, source: "session" as const };
  }
  if (environment !== "production") {
    return { id: "local-development", source: "development" as const };
  }
  return null;
}

export async function openAISafetyIdentifier(request: Request) {
  const principal = await requestPrincipal(request);
  if (!principal) return null;
  return openAISafetyIdentifierForPrincipal(principal.id);
}

export async function openAISafetyIdentifierForPrincipal(principalId: string) {
  return `meant-${await sha256(`openai-safety\0${principalId}`)}`;
}

export async function authenticateRequest(request: Request) {
  const principal = await requestPrincipal(request);
  if (!principal) {
    return {
      ok: false as const,
      response: Response.json({ error: "Sign in to use Meant" }, { status: 401 }),
    };
  }
  return { ok: true as const, principal };
}

/**
 * Performs only request-origin and principal authentication. It deliberately
 * does not touch D1 or consume a model budget; callers validate their bounded
 * input and deployment configuration before reserving an outbound request.
 */
export async function authenticateModelRequest(request: Request) {
  const identity = await authenticateRequest(request);
  if (!identity.ok) return identity;
  return {
    ok: true as const,
    principal: identity.principal,
    safetyIdentifier: await openAISafetyIdentifierForPrincipal(identity.principal.id),
  };
}

export async function workspaceScope(request: Request, workspaceId: unknown) {
  if (!validWorkspaceId(workspaceId)) {
    return { ok: false as const, response: Response.json({ error: "A valid workspaceId is required" }, { status: 400 }) };
  }
  const principal = await requestPrincipal(request);
  if (!principal) {
    return { ok: false as const, response: Response.json({ error: "Sign in to access this Meant workspace" }, { status: 401 }) };
  }
  return {
    ok: true as const,
    publicWorkspaceId: workspaceId,
    storageWorkspaceId: await workspaceStorageIdForPrincipal(principal.id, workspaceId),
    principal,
  };
}

export async function workspaceStorageIdForPrincipal(
  principalId: string,
  workspaceId: string,
  isolatePublicWorkspace = process.env.NODE_ENV !== "production",
) {
  if (!validWorkspaceId(workspaceId)) throw new Error("A valid workspaceId is required");
  const storageAuthority = isolatePublicWorkspace ? `${principalId}\0${workspaceId}` : principalId;
  return `workspace-${await sha256(storageAuthority)}`;
}

export const MODEL_LIMITS = {
  realtime: 1,
  transcribe: 8,
  intent: 12,
  verify: 6,
} as const;

const MODEL_DEPLOYMENT_MINUTE_LIMIT = 80;
const MODEL_PRINCIPAL_DAILY_LIMIT = 250;
const MODEL_DEPLOYMENT_DAILY_LIMIT = 5_000;
export const REALTIME_PRINCIPAL_DAILY_LIMIT = 10;
export const REALTIME_DEPLOYMENT_MINUTE_LIMIT = 10;
export const REALTIME_DEPLOYMENT_DAILY_LIMIT = 100;
export const MUTATION_PRINCIPAL_MINUTE_LIMIT = 30;
export const MUTATION_PRINCIPAL_DAILY_LIMIT = 120;
export const MUTATION_DEPLOYMENT_MINUTE_LIMIT = 200;
export const MUTATION_DEPLOYMENT_DAILY_LIMIT = 2_000;

export type ModelRequestRoute = keyof typeof MODEL_LIMITS;
export type ModelBudgetWindow = "minute" | "daily";

export const MODEL_REQUEST_WINDOW_TABLE_SQL = `CREATE TABLE IF NOT EXISTS model_request_windows (
  principal_id TEXT NOT NULL,
  route TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  PRIMARY KEY (principal_id, route, window_start)
)`;

export const MODEL_REQUEST_WINDOW_INDEX_SQL = "CREATE INDEX IF NOT EXISTS model_request_windows_cleanup_idx ON model_request_windows (window_start)";

export const MODEL_REQUEST_BUDGET_GUARD_TABLE_SQL = `CREATE TABLE IF NOT EXISTS model_request_budget_guard (
  attempt INTEGER NOT NULL
)`;

export const MODEL_REQUEST_BUDGET_GUARD_TRIGGER_SQL = `CREATE TRIGGER IF NOT EXISTS reject_model_request_budget_guard
  BEFORE INSERT ON model_request_budget_guard
  BEGIN
    SELECT RAISE(ABORT, 'MEANT_MODEL_BUDGET_EXCEEDED');
  END`;

export const MODEL_REQUEST_INCREMENT_SQL = `INSERT INTO model_request_windows (principal_id, route, window_start, request_count)
  VALUES (?, ?, ?, 1)
  ON CONFLICT(principal_id, route, window_start) DO UPDATE SET request_count = request_count + 1
  WHERE request_count < ?`;

export const MODEL_REQUEST_ASSERT_CHANGED_SQL = "INSERT INTO model_request_budget_guard (attempt) SELECT 1 WHERE changes() <> 1";

export const MODEL_REQUEST_DAILY_TABLE_SQL = `CREATE TABLE IF NOT EXISTS model_request_daily_budgets (
  principal_id TEXT NOT NULL,
  day_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  PRIMARY KEY (principal_id, day_start)
)`;

export const MODEL_REQUEST_DAILY_INDEX_SQL = "CREATE INDEX IF NOT EXISTS model_request_daily_budgets_cleanup_idx ON model_request_daily_budgets (day_start)";

export const MODEL_REQUEST_DAILY_GUARD_TABLE_SQL = `CREATE TABLE IF NOT EXISTS model_request_daily_budget_guard (
  attempt INTEGER NOT NULL
)`;

export const MODEL_REQUEST_DAILY_GUARD_TRIGGER_SQL = `CREATE TRIGGER IF NOT EXISTS reject_model_request_daily_budget_guard
  BEFORE INSERT ON model_request_daily_budget_guard
  BEGIN
    SELECT RAISE(ABORT, 'MEANT_MODEL_DAILY_BUDGET_EXCEEDED');
  END`;

export const MODEL_REQUEST_DAILY_INCREMENT_SQL = `INSERT INTO model_request_daily_budgets (principal_id, day_start, request_count)
  VALUES (?, ?, 1)
  ON CONFLICT(principal_id, day_start) DO UPDATE SET request_count = request_count + 1
  WHERE request_count < ?`;

export const MODEL_REQUEST_DAILY_ASSERT_CHANGED_SQL = "INSERT INTO model_request_daily_budget_guard (attempt) SELECT 1 WHERE changes() <> 1";

export function modelBudgetRetryAfter(window: ModelBudgetWindow, now = Date.now()) {
  const windowMilliseconds = window === "minute" ? 60_000 : 86_400_000;
  return Math.max(1, Math.ceil((windowMilliseconds - (now % windowMilliseconds)) / 1_000));
}

export async function admitModelRequest(principalId: string, route: ModelRequestRoute, now = Date.now()) {
  const windowStart = Math.floor(now / 60_000);
  const dayStart = Math.floor(now / 86_400_000);
  const { getRawDb } = await import("@/db");
  const raw = getRawDb();
  const incrementMinute = (budgetPrincipalId: string, routeName: string, limit: number) =>
    raw.prepare(MODEL_REQUEST_INCREMENT_SQL).bind(budgetPrincipalId, routeName, windowStart, limit);
  const incrementDaily = (budgetPrincipalId: string, limit: number) =>
    raw.prepare(MODEL_REQUEST_DAILY_INCREMENT_SQL).bind(budgetPrincipalId, dayStart, limit);
  try {
    // D1 batches are transactional. Each guard insert runs only when the
    // immediately preceding increment changed no row; its trigger aborts and
    // rolls back the full batch so a rejected caller cannot consume any other
    // minute or daily budget.
    await raw.batch([
      incrementDaily(principalId, MODEL_PRINCIPAL_DAILY_LIMIT),
      raw.prepare(MODEL_REQUEST_DAILY_ASSERT_CHANGED_SQL),
      incrementDaily("deployment", MODEL_DEPLOYMENT_DAILY_LIMIT),
      raw.prepare(MODEL_REQUEST_DAILY_ASSERT_CHANGED_SQL),
      ...(route === "realtime" ? [
        incrementDaily(`realtime:${principalId}`, REALTIME_PRINCIPAL_DAILY_LIMIT),
        raw.prepare(MODEL_REQUEST_DAILY_ASSERT_CHANGED_SQL),
        incrementDaily("realtime:deployment", REALTIME_DEPLOYMENT_DAILY_LIMIT),
        raw.prepare(MODEL_REQUEST_DAILY_ASSERT_CHANGED_SQL),
      ] : []),
      incrementMinute(principalId, route, MODEL_LIMITS[route]),
      raw.prepare(MODEL_REQUEST_ASSERT_CHANGED_SQL),
      incrementMinute("deployment", "all-model-routes", MODEL_DEPLOYMENT_MINUTE_LIMIT),
      raw.prepare(MODEL_REQUEST_ASSERT_CHANGED_SQL),
      ...(route === "realtime" ? [
        incrementMinute("realtime:deployment", "realtime", REALTIME_DEPLOYMENT_MINUTE_LIMIT),
        raw.prepare(MODEL_REQUEST_ASSERT_CHANGED_SQL),
      ] : []),
      raw.prepare("DELETE FROM model_request_windows WHERE window_start < ?").bind(windowStart - 120),
      raw.prepare("DELETE FROM model_request_daily_budgets WHERE day_start < ?").bind(dayStart - 14),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("MEANT_MODEL_DAILY_BUDGET_EXCEEDED")) {
      return Response.json(
        { error: "Meant's daily model request budget is full. Please try again after the UTC reset." },
        { status: 429, headers: { "retry-after": String(modelBudgetRetryAfter("daily", now)) } },
      );
    }
    if (error instanceof Error && error.message.includes("MEANT_MODEL_BUDGET_EXCEEDED")) {
      return Response.json(
        { error: "Meant's model request budget is temporarily full. Please try again shortly." },
        { status: 429, headers: { "retry-after": String(modelBudgetRetryAfter("minute", now)) } },
      );
    }
    throw error;
  }
  return null;
}

export async function reserveModelRequestBudget(principalId: string, route: ModelRequestRoute) {
  if (process.env.NODE_ENV !== "production" && process.env.MEANT_TEST_MODEL_ADMISSION === "allow") return null;
  try {
    return await admitModelRequest(principalId, route);
  } catch {
    return Response.json({ error: "Meant's model admission service is temporarily unavailable." }, { status: 503 });
  }
}

export async function admitMutationRequest(principalId: string, now = Date.now()) {
  const windowStart = Math.floor(now / 60_000);
  const dayStart = Math.floor(now / 86_400_000);
  const { getRawDb } = await import("@/db");
  const raw = getRawDb();
  const mutationPrincipal = `mutation:${principalId}`;
  const deploymentPrincipal = "mutation:deployment";
  try {
    await raw.batch([
      raw.prepare(MODEL_REQUEST_DAILY_INCREMENT_SQL).bind(mutationPrincipal, dayStart, MUTATION_PRINCIPAL_DAILY_LIMIT),
      raw.prepare(MODEL_REQUEST_DAILY_ASSERT_CHANGED_SQL),
      raw.prepare(MODEL_REQUEST_DAILY_INCREMENT_SQL).bind(deploymentPrincipal, dayStart, MUTATION_DEPLOYMENT_DAILY_LIMIT),
      raw.prepare(MODEL_REQUEST_DAILY_ASSERT_CHANGED_SQL),
      raw.prepare(MODEL_REQUEST_INCREMENT_SQL).bind(mutationPrincipal, "all-mutations", windowStart, MUTATION_PRINCIPAL_MINUTE_LIMIT),
      raw.prepare(MODEL_REQUEST_ASSERT_CHANGED_SQL),
      raw.prepare(MODEL_REQUEST_INCREMENT_SQL).bind(deploymentPrincipal, "all-mutations", windowStart, MUTATION_DEPLOYMENT_MINUTE_LIMIT),
      raw.prepare(MODEL_REQUEST_ASSERT_CHANGED_SQL),
      raw.prepare("DELETE FROM model_request_windows WHERE window_start < ?").bind(windowStart - 120),
      raw.prepare("DELETE FROM model_request_daily_budgets WHERE day_start < ?").bind(dayStart - 14),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("MEANT_MODEL_DAILY_BUDGET_EXCEEDED")) {
      return Response.json(
        { error: "Meant's daily edit budget is full. Please try again after the UTC reset." },
        { status: 429, headers: { "retry-after": String(modelBudgetRetryAfter("daily", now)) } },
      );
    }
    if (error instanceof Error && error.message.includes("MEANT_MODEL_BUDGET_EXCEEDED")) {
      return Response.json(
        { error: "Meant is receiving too many edit requests. Please try again shortly." },
        { status: 429, headers: { "retry-after": String(modelBudgetRetryAfter("minute", now)) } },
      );
    }
    throw error;
  }
  return null;
}

export async function reserveMutationRequestBudget(principalId: string) {
  if (process.env.NODE_ENV !== "production" && process.env.MEANT_TEST_MUTATION_ADMISSION === "allow") return null;
  try {
    return await admitMutationRequest(principalId);
  } catch {
    return Response.json({ error: "Meant's edit admission service is temporarily unavailable." }, { status: 503 });
  }
}
