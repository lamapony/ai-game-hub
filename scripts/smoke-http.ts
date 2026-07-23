type SmokeCheck = {
  name: string;
  path: string;
  method?: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
  expectedStatus: number;
  expectedContentType?: string;
};

const checks: SmokeCheck[] = [
  {
    name: "home",
    path: "/",
    expectedStatus: 200,
    expectedContentType: "text/html",
  },
  {
    name: "player route",
    path: "/play/TEST",
    expectedStatus: 200,
    expectedContentType: "text/html",
  },
  {
    name: "host route",
    path: "/host/TEST",
    expectedStatus: 200,
    expectedContentType: "text/html",
  },
  {
    name: "speaker route",
    path: "/speaker/TEST?slot=2",
    expectedStatus: 200,
    expectedContentType: "text/html",
  },
  {
    name: "cleanup requires auth",
    path: "/api/cleanup",
    method: "POST",
    expectedStatus: 401,
    expectedContentType: "text/plain",
  },
  {
    name: "live host command requires auth",
    path: "/api/host-command",
    method: "POST",
    body: JSON.stringify({
      roomId: "smoke-missing-room",
      commandId: "cmd_smoke_pause",
      command: { type: "pause" },
    }),
    headers: { "content-type": "application/json" },
    expectedStatus: 401,
    expectedContentType: "text/plain",
  },
  {
    name: "speech requires room scope",
    path: "/api/speak?text=test",
    expectedStatus: 400,
    expectedContentType: "text/plain",
  },
  {
    name: "transcription requires player context",
    path: "/api/transcribe",
    method: "POST",
    expectedStatus: 400,
    expectedContentType: "text/plain",
  },
  {
    name: "AI prewarm requires host auth",
    path: "/api/ai-prewarm",
    method: "POST",
    body: JSON.stringify({
      roomId: "smoke-missing-room",
      gameId: "smokescreen",
      targetActId: "grill",
    }),
    headers: { "content-type": "application/json" },
    expectedStatus: 401,
    expectedContentType: "text/plain",
  },
  {
    name: "tongs rejects invalid request",
    path: "/api/tongsoftruth",
    method: "POST",
    body: "{}",
    headers: { "content-type": "application/json" },
    expectedStatus: 400,
    expectedContentType: "text/plain",
  },
  {
    name: "tongs host action requires auth",
    path: "/api/tongsoftruth",
    method: "POST",
    body: JSON.stringify({
      action: "prepare",
      roomId: "smoke-missing-room",
      runId: "smoke-run",
    }),
    headers: { "content-type": "application/json" },
    expectedStatus: 401,
    expectedContentType: "text/plain",
  },
  {
    name: "cross rejects invalid request",
    path: "/api/crossexamination",
    method: "POST",
    body: "{}",
    headers: { "content-type": "application/json" },
    expectedStatus: 400,
    expectedContentType: "text/plain",
  },
  {
    name: "cross host case requires auth",
    path: "/api/crossexamination",
    method: "POST",
    body: JSON.stringify({
      action: "case",
      roomId: "smoke-missing-room",
      runId: "smoke-run",
    }),
    headers: { "content-type": "application/json" },
    expectedStatus: 401,
    expectedContentType: "text/plain",
  },
];

function argValue(name: string) {
  return process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

function baseUrl() {
  const value =
    argValue("--base-url") ||
    process.env.SMOKE_BASE_URL ||
    process.env.CLEANUP_URL ||
    "http://localhost:8080";
  return value.replace(/\/+$/, "");
}

function assertStatus(check: SmokeCheck, response: Response) {
  if (response.status !== check.expectedStatus) {
    throw new Error(`${check.name} expected HTTP ${check.expectedStatus}, got ${response.status}`);
  }
}

function assertContentType(check: SmokeCheck, response: Response) {
  if (!check.expectedContentType) return;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes(check.expectedContentType)) {
    throw new Error(
      `${check.name} expected content-type containing ${check.expectedContentType}, got ${contentType || "empty"}`,
    );
  }
}

const base = baseUrl();
const failures: string[] = [];

for (const check of checks) {
  const url = `${base}${check.path}`;
  try {
    const response = await fetch(url, {
      method: check.method || "GET",
      body: check.body,
      headers: check.headers,
      signal: AbortSignal.timeout(10_000),
    });
    assertStatus(check, response);
    assertContentType(check, response);
    await response.arrayBuffer();
    console.log(`ok ${check.name}: ${response.status} ${check.path}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${check.name}: ${message}`);
    console.error(`fail ${check.name}: ${message}`);
  }
}

if (failures.length > 0) {
  console.error(`HTTP smoke failed for ${base}`);
  process.exit(1);
}

console.log(`HTTP smoke passed for ${base}`);
