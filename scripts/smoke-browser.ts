import { existsSync } from "node:fs";
import { Buffer } from "node:buffer";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { cleanupRoomById } from "../src/lib/cleanup.server";
import { fetchRoomByCode } from "../src/lib/room";
import {
  browserSmokeScenarioLabel,
  parseBrowserSmokeOptions,
  parseBrowserSmokeScenarios,
  type BrowserSmokeScenario,
} from "./smoke-browser-config";

const DEFAULT_BASE_URL = "http://127.0.0.1:4321";
const DEFAULT_TIMEOUT_MS = 60_000;
const PLAYER_JOIN_BATCH_SIZE = 4;
const READINESS_TIMEOUT_MS = 120_000;

type CreatedRoom = {
  id: string;
  code: string;
};

type ExpectedBackendStatus = "ready" | "degraded";

type NetworkFaultState = {
  active: boolean;
  mode?: "offline" | "navigation";
};

type BrowserPlayer = {
  context: BrowserContext;
  fault: NetworkFaultState;
  index: number;
  name: string;
  page: Page;
};

function argValue(name: string) {
  return process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

function browserSmokeBaseUrl() {
  return new URL(argValue("--base-url") || process.env.BROWSER_SMOKE_BASE_URL || DEFAULT_BASE_URL);
}

function expectedBackendStatus(): ExpectedBackendStatus {
  const value = argValue("--backend") || process.env.BROWSER_SMOKE_EXPECT_BACKEND || "ready";
  if (value !== "ready" && value !== "degraded") {
    throw new Error(`backend must be ready or degraded, got ${value}`);
  }
  return value;
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function assertMutationSafety(baseUrl: URL) {
  if (process.env.BROWSER_SMOKE_ALLOW_MUTATION !== "YES") {
    throw new Error(
      "Browser smoke creates and deletes a room. Set BROWSER_SMOKE_ALLOW_MUTATION=YES to confirm.",
    );
  }
  if (!isLoopbackHost(baseUrl.hostname) && process.env.BROWSER_SMOKE_ALLOW_REMOTE !== "YES") {
    throw new Error(
      `Refusing to mutate non-local target ${baseUrl.origin}. Set BROWSER_SMOKE_ALLOW_REMOTE=YES to opt in.`,
    );
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required so the test room can be removed.",
    );
  }
}

function chromeExecutablePath() {
  let managedChromium: string | undefined;
  try {
    managedChromium = chromium.executablePath();
  } catch {
    managedChromium = undefined;
  }
  const candidates = [
    process.env.BROWSER_SMOKE_CHROME_PATH,
    managedChromium,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((candidate): candidate is string => !!candidate);
  const executablePath = candidates.find(existsSync);
  if (!executablePath) {
    throw new Error(
      "No system Chrome/Chromium found. Set BROWSER_SMOKE_CHROME_PATH to its executable.",
    );
  }
  return executablePath;
}

function observePage(
  page: Page,
  label: string,
  errors: string[],
  expectedNetworkFault: NetworkFaultState = { active: false },
) {
  page.on("pageerror", (error) => {
    if (expectedNetworkFault.active && expectedNetworkFault.mode !== "navigation") return;
    errors.push(`${label}: ${error.message}`);
  });
  page.on("console", (message) => {
    if (
      expectedNetworkFault.active &&
      (expectedNetworkFault.mode !== "navigation" ||
        message.text().startsWith("TypeError: Failed to fetch"))
    ) {
      return;
    }
    if (
      message.type() === "error" &&
      !message.text().startsWith("Failed to load resource: the server responded with a status of")
    ) {
      errors.push(`${label} console: ${message.text()}`);
    }
  });
  page.on("response", (response) => {
    if (expectedNetworkFault.active && expectedNetworkFault.mode !== "navigation") return;
    if (
      response.status() >= 400 &&
      ["document", "fetch", "xhr"].includes(response.request().resourceType())
    ) {
      errors.push(`${label} response: HTTP ${response.status()} ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    if (expectedNetworkFault.active) {
      if (expectedNetworkFault.mode !== "navigation") return;
      if (/ERR_(?:ABORTED|FAILED)/.test(request.failure()?.errorText ?? "")) return;
    }
    if (["document", "fetch", "xhr"].includes(request.resourceType())) {
      errors.push(
        `${label} request: ${request.method()} ${request.url()} (${request.failure()?.errorText ?? "failed"})`,
      );
    }
  });
}

async function runWithCommittedHostCommand(page: Page, action: () => Promise<unknown>) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/host-command",
    { timeout: DEFAULT_TIMEOUT_MS },
  );
  await action();
  const response = await responsePromise;
  if (!response.ok()) {
    throw new Error(`Host command failed with HTTP ${response.status()}`);
  }
  const payload = (await response.json()) as { updatedAt?: unknown };
  if (typeof payload.updatedAt !== "string" || !Number.isFinite(Date.parse(payload.updatedAt))) {
    throw new Error("Host command response did not include a valid committed room revision");
  }
}

function parseCreatedRoom(payload: unknown): CreatedRoom {
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row || typeof row !== "object") throw new Error("Room insert returned no row");
  const id = "id" in row ? row.id : undefined;
  const code = "code" in row ? row.code : undefined;
  if (typeof id !== "string" || typeof code !== "string") {
    throw new Error("Room insert response did not include id and code");
  }
  return { id, code };
}

function formatFailure(error: unknown, indent = ""): string {
  if (error instanceof AggregateError) {
    const causes = error.errors
      .map((cause, index) => formatFailure(cause, `${indent}  `).replace(/^/gm, `${index + 1}. `))
      .join("\n");
    return `${indent}${error.message}\n${causes}`;
  }
  if (error instanceof Error) {
    const stack = error.stack || "";
    const detail =
      error.message && !stack.includes(error.message) ? `${error.message}\n${stack}` : stack;
    return `${indent}${detail || error.message}`;
  }
  return `${indent}${String(error)}`;
}

function scenarioStorySeed(scenario: BrowserSmokeScenario) {
  return `Smoke rehearsal: the ${scenario.venue} lost one ceremonial spoon`;
}

async function configureQuickStart(hostPage: Page, scenario: BrowserSmokeScenario) {
  const venueButton = hostPage.getByTestId(`quick-start-venue-${scenario.venue}`);
  await venueButton.click();
  if ((await venueButton.getAttribute("aria-pressed")) !== "true") {
    throw new Error(`Could not select venue ${scenario.venue}`);
  }

  const durationButton = hostPage.getByTestId(`quick-start-duration-${scenario.durationMinutes}`);
  await durationButton.click();
  if ((await durationButton.getAttribute("aria-pressed")) !== "true") {
    throw new Error(`Could not select duration ${scenario.durationMinutes}`);
  }

  const expectedPlayers = hostPage.getByTestId("quick-start-expected-players");
  await expectedPlayers.evaluate((element, value) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, scenario.expectedPlayers);
  if ((await expectedPlayers.inputValue()) !== String(scenario.expectedPlayers)) {
    throw new Error(`Could not select expected player count ${scenario.expectedPlayers}`);
  }

  const storySeed = scenarioStorySeed(scenario);
  await hostPage.getByTestId("quick-start-story-seed").fill(storySeed);

  const brief = hostPage.locator(
    [
      '[data-testid="quick-start-brief"]',
      '[data-context="landing"]',
      `[data-venue="${scenario.venue}"]`,
      `[data-duration-minutes="${scenario.durationMinutes}"]`,
      `[data-route-duration-minutes="${scenario.durationMinutes}"]`,
      `[data-expected-players="${scenario.expectedPlayers}"]`,
      '[data-has-finale="true"]',
      '[data-has-story-seed="true"]',
    ].join(""),
  );
  await brief.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  if (!((await brief.textContent()) ?? "").includes(storySeed)) {
    throw new Error("Landing brief did not show the selected party story seed");
  }
}

async function verifyLandingEntryPaths(hostPage: Page, baseUrl: URL) {
  const hostEntry = hostPage.getByTestId("landing-host-entry");
  const guestEntry = hostPage.getByTestId("landing-guest-entry");
  await hostEntry.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  await guestEntry.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  if ((await hostEntry.getAttribute("href")) !== "#quick-start") {
    throw new Error("Landing host entry does not target the two-minute setup");
  }
  if ((await guestEntry.getAttribute("href")) !== "#join-room") {
    throw new Error("Landing guest entry does not target the room-code fallback");
  }

  await guestEntry.click();
  if (new URL(hostPage.url()).hash !== "#join-room") {
    throw new Error("Landing guest entry did not open the room-code fallback");
  }
  const codeInput = hostPage.getByTestId("landing-room-code");
  await codeInput.fill("O0I1");
  await waitForRoomCodeFormState(hostPage, "landing-room-code", "landing-room-code-submit", {
    value: "O0I1",
    disabled: true,
  });
  await codeInput.fill("a-b c d");
  await waitForRoomCodeFormState(hostPage, "landing-room-code", "landing-room-code-submit", {
    value: "ABCD",
    disabled: false,
  });
  await hostEntry.click();
  if (new URL(hostPage.url()).hash !== "#quick-start") {
    throw new Error("Landing host entry did not return to the two-minute setup");
  }

  await hostPage.goto(new URL("/play/O0I1", baseUrl).toString(), {
    waitUntil: "networkidle",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  await hostPage
    .locator('[data-testid="guest-room-recovery"][data-failure-kind="invalid-code"]')
    .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  const recoveryCode = hostPage.getByTestId("guest-room-recovery-code");
  await waitForRoomCodeFormState(
    hostPage,
    "guest-room-recovery-code",
    "guest-room-recovery-submit",
    { value: "O0I1", disabled: true },
  );
  await recoveryCode.fill("a-b c d");
  await waitForRoomCodeFormState(
    hostPage,
    "guest-room-recovery-code",
    "guest-room-recovery-submit",
    { value: "ABCD", disabled: false },
  );

  await hostPage.goto(new URL("/#quick-start", baseUrl).toString(), {
    waitUntil: "networkidle",
    timeout: DEFAULT_TIMEOUT_MS,
  });
}

async function waitForRoomCodeFormState(
  page: Page,
  inputTestId: string,
  submitTestId: string,
  expected: { value: string; disabled: boolean },
) {
  await page.waitForFunction(
    ({ inputTestId, submitTestId, expected }) => {
      const input = document.querySelector<HTMLInputElement>(`[data-testid="${inputTestId}"]`);
      const submit = document.querySelector<HTMLButtonElement>(`[data-testid="${submitTestId}"]`);
      return input?.value === expected.value && submit?.disabled === expected.disabled;
    },
    { inputTestId, submitTestId, expected },
    { timeout: DEFAULT_TIMEOUT_MS },
  );
}

async function createQuickStartRoom(hostPage: Page, baseUrl: URL, scenario: BrowserSmokeScenario) {
  await hostPage.goto(baseUrl.toString(), {
    waitUntil: "networkidle",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  await verifyLandingEntryPaths(hostPage, baseUrl);
  await configureQuickStart(hostPage, scenario);
  const insertResponsePromise = hostPage.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" &&
        url.pathname.endsWith("/rest/v1/rooms") &&
        response.ok()
      );
    },
    { timeout: DEFAULT_TIMEOUT_MS },
  );

  await hostPage.getByTestId("quick-start-create").click();
  const insertResponse = await insertResponsePromise;
  const room = parseCreatedRoom(await insertResponse.json());
  await hostPage.waitForURL(new RegExp(`/host/${room.code}(?:[/?#]|$)`), {
    timeout: DEFAULT_TIMEOUT_MS,
  });
  await hostPage.getByTestId("quick-start-readiness").waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  await hostPage.getByTestId("quick-start-launch-coach").waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  const hostBrief = hostPage.locator(
    [
      '[data-testid="quick-start-brief"]',
      '[data-context="host"]',
      `[data-venue="${scenario.venue}"]`,
      `[data-duration-minutes="${scenario.durationMinutes}"]`,
      `[data-route-duration-minutes="${scenario.durationMinutes}"]`,
      `[data-expected-players="${scenario.expectedPlayers}"]`,
      '[data-has-finale="true"]',
      '[data-has-story-seed="true"]',
    ].join(""),
  );
  await hostBrief.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  if (!((await hostBrief.textContent()) ?? "").includes(scenarioStorySeed(scenario))) {
    throw new Error("Host brief did not preserve the selected party story seed");
  }
  return room;
}

async function openPlayer(
  browser: Browser,
  baseUrl: URL,
  roomCode: string,
  scenarioLabel: string,
  index: number,
  contexts: BrowserContext[],
  errors: string[],
): Promise<BrowserPlayer> {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  const fault = { active: false };
  observePage(page, `${scenarioLabel}-player-${index + 1}`, errors, fault);
  await page.goto(new URL(`/play/${roomCode}`, baseUrl).toString(), {
    waitUntil: "networkidle",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  return { context, fault, page, index, name: `Smoke Player ${index + 1}` };
}

async function submitPlayerJoin(player: BrowserPlayer, activeGameId?: string) {
  await player.page.getByTestId("player-name").fill(player.name);
  const teams = player.page.locator('[data-testid^="join-team-"]');
  await teams.first().waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  const teamCount = await teams.count();
  if (teamCount === 0) throw new Error(`No joinable team for ${player.name}`);
  await teams.nth(player.index % teamCount).click();
  const joinedTarget = activeGameId
    ? player.page.locator(`[data-testid="player-session"][data-game-id="${activeGameId}"]`)
    : player.page.getByTestId("player-joined");
  await joinedTarget.waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
}

async function joinPlayers(
  browser: Browser,
  baseUrl: URL,
  roomCode: string,
  scenario: BrowserSmokeScenario,
  contexts: BrowserContext[],
  errors: string[],
) {
  const scenarioLabel = browserSmokeScenarioLabel(scenario);
  const players: BrowserPlayer[] = [];
  for (let offset = 0; offset < scenario.playerCount; offset += PLAYER_JOIN_BATCH_SIZE) {
    const batchSize = Math.min(PLAYER_JOIN_BATCH_SIZE, scenario.playerCount - offset);
    const batch = await Promise.all(
      Array.from({ length: batchSize }, (_, batchIndex) =>
        openPlayer(
          browser,
          baseUrl,
          roomCode,
          scenarioLabel,
          offset + batchIndex,
          contexts,
          errors,
        ),
      ),
    );
    await Promise.all(batch.map((player) => submitPlayerJoin(player)));
    players.push(...batch);
  }
  return players;
}

async function verifyFullRoomBoundary(params: {
  baseUrl: URL;
  browser: Browser;
  contexts: BrowserContext[];
  errors: string[];
  hostPage: Page;
  roomId: string;
  roomCode: string;
  scenarioLabel: string;
}) {
  const { baseUrl, browser, contexts, errors, hostPage, roomCode, roomId, scenarioLabel } = params;
  await hostPage
    .locator('[data-testid="device-readiness-summary"][data-total-players="30"]')
    .waitFor({ state: "attached", timeout: DEFAULT_TIMEOUT_MS });
  const removeControls = hostPage.locator('[data-testid^="remove-player-"]');
  if ((await removeControls.count()) !== 30) {
    throw new Error("A full lobby did not expose one host recovery control per player");
  }

  const overflowContext = await browser.newContext();
  contexts.push(overflowContext);
  const overflowPage = await overflowContext.newPage();
  const overflowFault = { active: false };
  observePage(overflowPage, `${scenarioLabel}-overflow`, errors, overflowFault);
  await overflowPage.goto(new URL(`/play/${roomCode}`, baseUrl).toString(), {
    waitUntil: "networkidle",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  const fullState = overflowPage.locator(
    '[data-testid="room-capacity-full"][data-player-count="30"][data-player-limit="30"]',
  );
  await fullState.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  const fullCopy = (await fullState.textContent()) ?? "";
  if (!fullCopy.includes("30/30") || !fullCopy.includes("duplicate or inactive phone")) {
    throw new Error(`Overflow guest did not receive host-assisted recovery: ${fullCopy.trim()}`);
  }

  overflowFault.active = true;
  let serverBoundary: { body: string; status: number };
  try {
    serverBoundary = await overflowPage.evaluate(async (targetRoomId) => {
      const response = await fetch("/api/player-action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-player-secret": "capacity-overflow-smoke-secret",
        },
        body: JSON.stringify({
          roomId: targetRoomId,
          action: "join",
          playerId: "capacity_overflow_smoke",
          name: "Overflow Smoke",
          teamId: "forest",
        }),
      });
      return { body: await response.text(), status: response.status };
    }, roomId);
  } finally {
    overflowFault.active = false;
  }
  if (serverBoundary.status !== 409 || !serverBoundary.body.includes("room is full")) {
    throw new Error(
      `Server accepted or misreported the 31st identity: ${serverBoundary.status} ${serverBoundary.body}`,
    );
  }
}

function readinessLocator(hostPage: Page, scenario: BrowserSmokeScenario, joinedPlayers: number) {
  return hostPage.locator(
    [
      '[data-testid="quick-start-readiness"]',
      '[data-ready="true"]',
      '[data-ready-within-two-minutes="true"]',
      `[data-venue="${scenario.venue}"]`,
      `[data-duration-minutes="${scenario.durationMinutes}"]`,
      `[data-route-duration-minutes="${scenario.durationMinutes}"]`,
      `[data-expected-players="${scenario.expectedPlayers}"]`,
      `[data-joined-players="${joinedPlayers}"]`,
    ].join(""),
  );
}

function programReadinessLocator(
  hostPage: Page,
  scenario: BrowserSmokeScenario,
  joinedPlayers: number,
) {
  return hostPage.locator(
    [
      '[data-testid="quick-start-readiness"]',
      '[data-program-ready="true"]',
      '[data-ready-within-two-minutes="true"]',
      `[data-venue="${scenario.venue}"]`,
      `[data-duration-minutes="${scenario.durationMinutes}"]`,
      `[data-route-duration-minutes="${scenario.durationMinutes}"]`,
      `[data-expected-players="${scenario.expectedPlayers}"]`,
      `[data-joined-players="${joinedPlayers}"]`,
    ].join(""),
  );
}

function releaseHealthLocator(hostPage: Page, status: ExpectedBackendStatus) {
  return hostPage
    .locator(`[data-testid="release-health"][data-status="${status}"]`)
    .filter({ visible: true });
}

function liveSafetyLocator(hostPage: Page, status: string) {
  return hostPage
    .locator(`[data-testid="live-safety"][data-connection-status="${status}"]`)
    .filter({ visible: true });
}

async function waitForPlayerIdentity(page: Page, playerId: string, teamId: string) {
  await page
    .locator(
      `[data-testid="player-joined"][data-player-id="${playerId}"][data-team-id="${teamId}"]`,
    )
    .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
}

async function reloadDuringExpectedNavigation(
  page: Page,
  fault: NetworkFaultState,
  afterReload: () => Promise<void>,
) {
  fault.active = true;
  fault.mode = "navigation";
  try {
    await page.reload({ waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT_MS });
    await afterReload();
  } finally {
    fault.active = false;
    fault.mode = undefined;
  }
}

function hostRuntimeLocator(hostPage: Page, gameId: string, paused: boolean) {
  return hostPage.locator(
    `[data-testid="host-runtime"][data-game-id="${gameId}"][data-paused="${paused ? "true" : "false"}"]`,
  );
}

function activeHostGameLocator(hostPage: Page, gameId: string) {
  return hostPage.locator(`[data-testid="active-host-game"][data-game-id="${gameId}"]`);
}

function activePlayerGameLocator(page: Page, gameId: string) {
  return page.locator(`[data-testid="active-player-game"][data-game-id="${gameId}"]`);
}

function playerSessionLocator(
  page: Page,
  playerId: string,
  teamId: string,
  gameId: string,
  paused: boolean,
) {
  return page.locator(
    [
      '[data-testid="player-session"]',
      `[data-player-id="${playerId}"]`,
      `[data-team-id="${teamId}"]`,
      `[data-game-id="${gameId}"]`,
      `[data-paused="${paused ? "true" : "false"}"]`,
    ].join(""),
  );
}

async function soundscapeTopicsSnapshot(hostPage: Page) {
  const host = hostPage.locator('[data-testid="soundscape-host"][data-topics-ready="true"]');
  await host.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  const topics = await host.getAttribute("data-topics");
  const fallback = (await host.getAttribute("data-ai-fallback")) === "true";
  if (!topics || topics === "[]") throw new Error("Soundscape topics were not rendered");
  return { topics, fallback };
}

type ChromiumMediaPermission = "microphone" | "camera";

async function setMediaPermissions(
  player: BrowserPlayer,
  origin: string,
  setting: "denied" | "granted",
  permissions: ChromiumMediaPermission[],
) {
  if (setting === "granted") {
    await player.context.grantPermissions(permissions, { origin });
    return;
  }

  const session = await player.context.newCDPSession(player.page);
  try {
    const { targetInfo } = await session.send("Target.getTargetInfo");
    if (!targetInfo.browserContextId) {
      throw new Error("Could not identify Chromium browser context for media permissions");
    }
    for (const name of permissions) {
      await session.send("Browser.setPermission", {
        permission: { name },
        setting,
        origin,
        browserContextId: targetInfo.browserContextId,
      });
    }
  } finally {
    await session.detach();
  }
}

async function runLobbyDevicePreflight(params: {
  baseUrl: URL;
  hostPage: Page;
  player: BrowserPlayer;
  playerId: string;
  playerTeamId: string;
  scenarioLabel: string;
}) {
  const { baseUrl, hostPage, player, playerId, playerTeamId, scenarioLabel } = params;
  const preflight = player.page.getByTestId("device-preflight");
  await preflight.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });

  await setMediaPermissions(player, baseUrl.origin, "denied", ["microphone", "camera"]);
  await player.page.getByTestId("device-preflight-check").click();
  await player.page
    .locator('[data-testid="device-preflight"][data-status="denied"]')
    .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  const denial = (await player.page.getByTestId("device-preflight-message").textContent()) ?? "";
  if (!denial.includes("camera and microphone") || !denial.includes("Try again")) {
    throw new Error(`Device preflight denial did not render retry guidance: ${denial.trim()}`);
  }
  await hostPage
    .locator(
      '[data-testid="device-readiness-summary"][data-checked-players="1"][data-ready-players="0"]',
    )
    .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });

  await setMediaPermissions(player, baseUrl.origin, "granted", ["microphone", "camera"]);
  await player.page.getByTestId("device-preflight-check").click();
  await player.page
    .locator('[data-testid="device-preflight"][data-status="ready"]')
    .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  await hostPage
    .locator(
      '[data-testid="device-readiness-summary"][data-checked-players="1"][data-ready-players="1"]',
    )
    .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  await player.page.reload({ waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT_MS });
  await playerSessionLocator(player.page, playerId, playerTeamId, "", false).waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  await player.page
    .locator('[data-testid="device-preflight"][data-status="ready"]')
    .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  console.log(
    `ok ${scenarioLabel} lobby device preflight deny → grant → retry reached host and survived refresh`,
  );
}

async function runSoundscapeMicrophoneFlow(params: {
  baseUrl: URL;
  hostPage: Page;
  player: BrowserPlayer;
  playerId: string;
  playerTeamId: string;
  scenarioLabel: string;
}) {
  const { baseUrl, hostPage, player, playerId, playerTeamId, scenarioLabel } = params;
  await setMediaPermissions(player, baseUrl.origin, "denied", ["microphone"]);
  await hostPage.getByTestId("soundscape-lock-theme").click();
  await hostPage
    .locator('[data-testid="host-runtime"][data-game-id="soundscape"][data-game-phase="recording"]')
    .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });

  const recorder = player.page.getByTestId("audio-recorder");
  await recorder.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  await player.page.getByTestId("audio-recorder-start").click();
  await recorder.locator('[data-testid="audio-recorder-error"]').waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  const deniedMessage = (await player.page.getByTestId("audio-recorder-error").textContent()) ?? "";
  if (!deniedMessage.includes("microphone") || !deniedMessage.includes("Try again")) {
    throw new Error(`Microphone denial did not render retry guidance: ${deniedMessage.trim()}`);
  }

  await setMediaPermissions(player, baseUrl.origin, "granted", ["microphone"]);
  await player.page.getByTestId("audio-recorder-start").click();
  await player.page.getByTestId("audio-recorder-error").waitFor({
    state: "hidden",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  await Promise.race([
    player.page
      .locator('[data-testid="audio-recorder"][data-state="recording"]')
      .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS }),
    player.page
      .getByTestId("audio-recorder-error")
      .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS })
      .then(async () => {
        const message = await player.page.getByTestId("audio-recorder-error").textContent();
        throw new Error(`Microphone retry did not start recording: ${message?.trim()}`);
      }),
  ]);
  await playerSessionLocator(player.page, playerId, playerTeamId, "soundscape", false).waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  await player.page.waitForTimeout(2_500);
  await player.page.getByTestId("audio-recorder-stop").click();

  await Promise.race([
    player.page
      .locator('[data-testid="audio-recorder"][data-state="done"]')
      .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS }),
    player.page
      .getByTestId("audio-recorder-error")
      .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS })
      .then(async () => {
        const message = await player.page.getByTestId("audio-recorder-error").textContent();
        throw new Error(`Microphone retry reached media but upload failed: ${message?.trim()}`);
      }),
  ]);
  console.log(
    `ok ${scenarioLabel} microphone deny → grant → retry uploaded audio with stable identity`,
  );
}

async function findChallengeOperator(players: BrowserPlayer[]) {
  const deadline = Date.now() + DEFAULT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    for (const player of players) {
      if (await player.page.getByTestId("challenge-operator-ready").isVisible()) return player;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Challenge operator UI did not become ready");
}

async function runChallengeCameraFlow(params: {
  baseUrl: URL;
  hostPage: Page;
  players: BrowserPlayer[];
  scenarioLabel: string;
}) {
  const { baseUrl, hostPage, players, scenarioLabel } = params;
  const launch = hostPage.getByTestId("route-launch-game");
  await launch.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  const gameId = await launch.getAttribute("data-game-id");
  const routeStepId = await launch.getAttribute("data-route-step-id");
  if (gameId !== "challenge" || !routeStepId) {
    throw new Error(`Media smoke expected Challenge next, received ${gameId || "no game"}`);
  }
  await launch.click();
  await activeHostGameLocator(hostPage, "challenge").waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });

  const operator = await findChallengeOperator(players);
  const session = operator.page.getByTestId("player-session");
  const operatorId = await session.getAttribute("data-player-id");
  const operatorTeamId = await session.getAttribute("data-team-id");
  if (!operatorId || !operatorTeamId)
    throw new Error("Challenge operator identity was not rendered");

  await setMediaPermissions(operator, baseUrl.origin, "denied", ["microphone", "camera"]);
  await operator.page.getByTestId("challenge-open-camera").click();
  const permissionError = operator.page.getByTestId("challenge-permission-error");
  await permissionError.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  const deniedMessage = (await permissionError.textContent()) ?? "";
  if (!deniedMessage.includes("camera and microphone") || !deniedMessage.includes("Try again")) {
    throw new Error(`Camera denial did not render retry guidance: ${deniedMessage.trim()}`);
  }

  await setMediaPermissions(operator, baseUrl.origin, "granted", ["microphone", "camera"]);
  await operator.page.getByTestId("challenge-open-camera").click();
  await operator.page
    .locator('[data-testid="video-recorder"][data-state="preview"]')
    .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  await playerSessionLocator(operator.page, operatorId, operatorTeamId, "challenge", false).waitFor(
    { state: "visible", timeout: DEFAULT_TIMEOUT_MS },
  );
  console.log(
    `ok ${scenarioLabel} camera+microphone deny → grant → retry opened Challenge preview with stable identity`,
  );

  await runWithCommittedHostCommand(hostPage, () =>
    hostPage.getByTestId("host-back-to-hub").click(),
  );
  await hostRuntimeLocator(hostPage, "", false).waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  const nextStepId = await hostPage
    .getByTestId("party-conductor")
    .getAttribute("data-next-route-step-id");
  if (!nextStepId || nextStepId === routeStepId) {
    throw new Error(`Challenge route step ${routeStepId} returned after media retry`);
  }
  console.log(`ok ${scenarioLabel} media flow advanced route ${routeStepId} → ${nextStepId}`);
}

const PHOTO_SMOKE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">
  <rect width="1600" height="1200" fill="#16281f"/>
  <circle cx="800" cy="520" r="330" fill="#ff7a3d"/>
  <path d="M140 1010 L560 620 L860 890 L1120 660 L1480 1010 Z" fill="#7fda80"/>
  <text x="800" y="1100" fill="white" font-size="96" text-anchor="middle">AI Game Hub media smoke</text>
</svg>`;

async function runPhotoHuntCaptureFlow(params: {
  hostPage: Page;
  player: BrowserPlayer;
  scenarioLabel: string;
}) {
  const { hostPage, player, scenarioLabel } = params;
  const launch = hostPage.getByTestId("route-launch-game");
  await launch.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  const gameId = await launch.getAttribute("data-game-id");
  const routeStepId = await launch.getAttribute("data-route-step-id");
  if (gameId !== "phototunt" || !routeStepId) {
    throw new Error(`Media smoke expected Photo Hunt next, received ${gameId || "no game"}`);
  }
  await launch.click();
  await activeHostGameLocator(hostPage, "phototunt").waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });

  const session = player.page.getByTestId("player-session");
  const playerId = await session.getAttribute("data-player-id");
  const playerTeamId = await session.getAttribute("data-team-id");
  if (!playerId || !playerTeamId) throw new Error("Photo Hunt player identity was not rendered");

  const startHunt = hostPage.getByTestId("phototunt-start-hunt");
  await startHunt.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  await startHunt.click();
  await playerSessionLocator(player.page, playerId, playerTeamId, "phototunt", false).waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });

  await player.page.getByTestId("photo-capture-input").setInputFiles({
    name: "ai-game-hub-media-smoke.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(PHOTO_SMOKE_SVG),
  });
  await player.page
    .locator('[data-testid="photo-capture"][data-state="preview"]')
    .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  await Promise.race([
    player.page
      .getByTestId("phototunt-submitted")
      .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS }),
    player.page
      .getByTestId("phototunt-upload-error")
      .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS })
      .then(async () => {
        const message = await player.page.getByTestId("phototunt-upload-error").textContent();
        throw new Error(`Photo Hunt capture reached upload but failed: ${message?.trim()}`);
      }),
  ]);
  await playerSessionLocator(player.page, playerId, playerTeamId, "phototunt", false).waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  console.log(
    `ok ${scenarioLabel} Photo Hunt capture downscaled and uploaded an image with stable identity`,
  );

  await runWithCommittedHostCommand(hostPage, () =>
    hostPage.getByTestId("host-back-to-hub").click(),
  );
  await hostRuntimeLocator(hostPage, "", false).waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  const nextStepId = await hostPage
    .getByTestId("party-conductor")
    .getAttribute("data-next-route-step-id");
  if (!nextStepId || nextStepId === routeStepId) {
    throw new Error(`Photo Hunt route step ${routeStepId} returned after media capture`);
  }
  console.log(`ok ${scenarioLabel} photo media flow advanced route ${routeStepId} → ${nextStepId}`);
}

async function waitForNextRouteStep(hostPage: Page, previousStepId: string) {
  await hostPage.waitForFunction(
    (stepId) => {
      const conductor = document.querySelector('[data-testid="party-conductor"]');
      return Boolean(conductor && conductor.getAttribute("data-next-route-step-id") !== stepId);
    },
    previousStepId,
    { timeout: DEFAULT_TIMEOUT_MS },
  );
}

async function waitForActiveRouteStep(hostPage: Page, stepId: string) {
  await hostPage.waitForFunction(
    (expectedStepId) =>
      document
        .querySelector('[data-testid="party-conductor"]')
        ?.getAttribute("data-active-route-step-id") === expectedStepId,
    stepId,
    { timeout: DEFAULT_TIMEOUT_MS },
  );
}

async function launchFirstForegroundRouteGame(hostPage: Page) {
  const conductor = hostPage.getByTestId("party-conductor");
  await conductor.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const beginInterlude = hostPage.getByTestId("route-begin-interlude");
    if (await beginInterlude.isVisible()) {
      const stepId = await beginInterlude.getAttribute("data-step-id");
      if (!stepId) throw new Error("Route interlude did not expose its step id");
      await beginInterlude.click();
      await waitForActiveRouteStep(hostPage, stepId);
      continue;
    }

    const interlude = hostPage.getByTestId("route-complete-interlude");
    if (await interlude.isVisible()) {
      const stepId = await interlude.getAttribute("data-step-id");
      if (!stepId) throw new Error("Route interlude did not expose its step id");
      await interlude.click();
      await waitForNextRouteStep(hostPage, stepId);
      continue;
    }

    const launch = hostPage.getByTestId("route-launch-game");
    await launch.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
    const gameId = await launch.getAttribute("data-game-id");
    const routeStepId = await launch.getAttribute("data-route-step-id");
    const gameFormat = await launch.getAttribute("data-game-format");
    if (!gameId || !routeStepId || !gameFormat) {
      throw new Error("Route launch control did not expose game metadata");
    }

    await launch.click();
    if (gameFormat === "foreground") {
      await activeHostGameLocator(hostPage, gameId).waitFor({
        state: "visible",
        timeout: DEFAULT_TIMEOUT_MS,
      });
      return { gameId, routeStepId };
    }
    await waitForNextRouteStep(hostPage, routeStepId);
  }

  throw new Error("Could not reach a foreground route game in 12 route actions");
}

async function runFullJourneyChecks(params: {
  hostPage: Page;
  players: BrowserPlayer[];
  room: CreatedRoom;
  scenario: BrowserSmokeScenario;
}) {
  const { hostPage, players, room, scenario } = params;
  const scenarioLabel = browserSmokeScenarioLabel(scenario);
  const player = players[0];
  if (!player) throw new Error("Journey smoke requires at least one joined player");

  const conductor = hostPage.getByTestId("party-conductor");
  await conductor.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  let callbackEvidenceId = "";
  const launchedGames: string[] = [];

  for (let action = 0; action < 40; action += 1) {
    const routeStepId = await conductor.getAttribute("data-next-route-step-id");
    const routeStepKind = await conductor.getAttribute("data-next-route-step-kind");
    const nextActId = await conductor.getAttribute("data-next-act-id");
    if (!routeStepId || !routeStepKind) {
      if (nextActId) {
        const nextAct = hostPage.locator(
          `[data-testid="route-next-act"][data-act-id="${nextActId}"]`,
        );
        await nextAct.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
        hostPage.once("dialog", (dialog) => dialog.accept());
        await nextAct.click();
        await hostPage
          .locator(`[data-testid="party-conductor"][data-act-id="${nextActId}"]`)
          .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
        console.log(`ok ${scenarioLabel} journey opened ${nextActId} act`);
        continue;
      }
      throw new Error(
        `Journey conductor exposed neither a route step nor a next act: step=${routeStepId || "none"}, kind=${routeStepKind || "none"}`,
      );
    }

    const callback = hostPage.getByTestId("route-story-callback");
    if (await callback.isVisible()) {
      callbackEvidenceId = (await callback.getAttribute("data-evidence-id")) ?? "";
      if (!callbackEvidenceId) throw new Error("Route callback did not expose its evidence id");
    }

    if (routeStepKind === "finale") {
      const completed = Number(await conductor.getAttribute("data-completed-route-steps"));
      const total = Number(await conductor.getAttribute("data-total-route-steps"));
      const evidenceCount = Number(await conductor.getAttribute("data-story-evidence-count"));
      if (!Number.isInteger(total) || total < 2 || completed !== total - 1) {
        throw new Error(
          `Journey reached finale with incomplete route: completed=${completed}, total=${total}`,
        );
      }
      if (!callbackEvidenceId || evidenceCount < 1) {
        throw new Error(
          `Journey reached finale without a public callback: callback=${callbackEvidenceId || "none"}, evidence=${evidenceCount}`,
        );
      }

      const finaleTrigger = hostPage.getByTestId("party-finale-trigger");
      if ((await finaleTrigger.getAttribute("data-has-scores")) !== "false") {
        throw new Error(
          "Journey unexpectedly earned points while only exercising route transitions",
        );
      }
      await finaleTrigger.click();
      await hostPage
        .locator('[data-testid="host-runtime"][data-party-status="finished"]')
        .waitFor({ state: "attached", timeout: DEFAULT_TIMEOUT_MS });
      await hostPage
        .locator('[data-testid="host-party-finale"][data-total-score="0"]')
        .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
      await player.page
        .locator('[data-testid="player-party-finale"][data-total-score="0"]')
        .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });

      const hostNarrative = hostPage.locator(
        '[data-testid="party-finale-narrative"][data-callback-count="1"]',
      );
      await hostNarrative.waitFor({ state: "visible", timeout: READINESS_TIMEOUT_MS });
      await hostNarrative
        .locator(`[data-testid="party-finale-callback"][data-evidence-id="${callbackEvidenceId}"]`)
        .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
      const playerNarrative = player.page.locator(
        '[data-testid="party-finale-narrative"][data-callback-count="1"]',
      );
      await playerNarrative.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
      await playerNarrative
        .locator(`[data-testid="party-finale-callback"][data-evidence-id="${callbackEvidenceId}"]`)
        .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
      console.log(
        `ok ${scenarioLabel} full journey crossed ${completed} route steps and returned ${callbackEvidenceId} in host + player finale (${launchedGames.join(" → ")})`,
      );
      return;
    }

    const completeInterlude = hostPage.getByTestId("route-complete-interlude");
    if (await completeInterlude.isVisible()) {
      await completeInterlude.click();
      await waitForNextRouteStep(hostPage, routeStepId);
      continue;
    }

    const beginInterlude = hostPage.getByTestId("route-begin-interlude");
    if (await beginInterlude.isVisible()) {
      await beginInterlude.click();
      await waitForActiveRouteStep(hostPage, routeStepId);
      continue;
    }

    const launch = hostPage.getByTestId("route-launch-game");
    await launch.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
    const gameId = await launch.getAttribute("data-game-id");
    const launchStepId = await launch.getAttribute("data-route-step-id");
    const gameFormat = await launch.getAttribute("data-game-format");
    if (!gameId || launchStepId !== routeStepId || !gameFormat) {
      throw new Error(
        `Journey launch metadata did not match ${routeStepId}: game=${gameId}, step=${launchStepId}, format=${gameFormat}`,
      );
    }

    await launch.click();
    launchedGames.push(gameId);
    if (gameFormat !== "foreground") {
      await waitForNextRouteStep(hostPage, routeStepId);
      continue;
    }

    await activeHostGameLocator(hostPage, gameId).waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT_MS,
    });
    await activePlayerGameLocator(player.page, gameId).waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT_MS,
    });
    if (callbackEvidenceId && gameId !== "soundscape") {
      const currentRoom = await fetchRoomByCode(room.code);
      const promptEvidence = currentRoom?.state.party?.storyEvidence ?? [];
      if (!promptEvidence.some((item) => item.id === callbackEvidenceId)) {
        throw new Error(
          `Journey launched ${gameId} without carrying public callback ${callbackEvidenceId} into its prompt context`,
        );
      }
      console.log(
        `ok ${scenarioLabel} journey carried ${callbackEvidenceId} into ${gameId} prompt context`,
      );
    }
    if (gameId === "soundscape") {
      await soundscapeTopicsSnapshot(hostPage);
      await hostPage.getByTestId("soundscape-lock-theme").click();
      await hostPage
        .locator(
          '[data-testid="host-runtime"][data-game-id="soundscape"][data-game-phase="recording"]',
        )
        .waitFor({ state: "attached", timeout: DEFAULT_TIMEOUT_MS });
    }
    await runWithCommittedHostCommand(hostPage, () =>
      hostPage.getByTestId("host-back-to-hub").click(),
    );
    await hostRuntimeLocator(hostPage, "", false).waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT_MS,
    });
    const returnedRoom = await fetchRoomByCode(room.code);
    if (!returnedRoom) throw new Error(`Journey lost room ${room.code} after ${gameId}`);
    const latestEvidence = returnedRoom.state.party?.storyEvidence?.at(-1);
    if (gameId === "soundscape" && !latestEvidence) {
      throw new Error("Journey left Soundscape without publishing bounded story evidence");
    }
    if (!callbackEvidenceId && latestEvidence) {
      callbackEvidenceId = latestEvidence.id;
      console.log(
        `ok ${scenarioLabel} journey captured public callback ${callbackEvidenceId} after ${gameId}`,
      );
    }
    await waitForNextRouteStep(hostPage, routeStepId);
    console.log(`ok ${scenarioLabel} journey advanced ${routeStepId} through ${gameId}`);
  }

  throw new Error("Journey did not reach the finale within 40 route actions");
}

async function runActiveGameResilienceChecks(params: {
  baseUrl: URL;
  browser: Browser;
  contexts: BrowserContext[];
  errors: string[];
  hostContext: BrowserContext;
  hostFault: NetworkFaultState;
  hostPage: Page;
  media: boolean;
  player: BrowserPlayer;
  playerId: string;
  playerTeamId: string;
  players: BrowserPlayer[];
  room: CreatedRoom;
  scenario: BrowserSmokeScenario;
}) {
  const {
    baseUrl,
    browser,
    contexts,
    errors,
    hostContext,
    hostFault,
    hostPage,
    media,
    player,
    playerId,
    playerTeamId,
    players,
    room,
    scenario,
  } = params;
  const scenarioLabel = browserSmokeScenarioLabel(scenario);
  const { gameId, routeStepId } = await launchFirstForegroundRouteGame(hostPage);
  const hostRuntime = hostRuntimeLocator(hostPage, gameId, false);
  await hostRuntime.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  const initialPhase = await hostRuntime.getAttribute("data-game-phase");
  await activePlayerGameLocator(player.page, gameId).waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  await playerSessionLocator(player.page, playerId, playerTeamId, gameId, false).waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  console.log(`ok ${scenarioLabel} route launched active ${gameId} for host and player`);

  await reloadDuringExpectedNavigation(hostPage, hostFault, async () => {
    await activeHostGameLocator(hostPage, gameId).waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT_MS,
    });
  });
  const refreshedPhase = await hostRuntimeLocator(hostPage, gameId, false).getAttribute(
    "data-game-phase",
  );
  if (refreshedPhase !== initialPhase) {
    throw new Error(
      `Host refresh changed active phase for ${gameId}: ${initialPhase} → ${refreshedPhase}`,
    );
  }
  const generatedTopics = gameId === "soundscape" ? await soundscapeTopicsSnapshot(hostPage) : null;
  if (generatedTopics?.fallback && process.env.BROWSER_SMOKE_EXPECT_AI === "YES") {
    throw new Error("Soundscape fell back even though this smoke requires a provider result");
  }
  if (generatedTopics) {
    console.log(
      `ok ${scenarioLabel} server-persisted Soundscape topics survived launch refresh (${generatedTopics.fallback ? "fallback" : "provider"})`,
    );
  }
  console.log(
    `ok ${scenarioLabel} host refresh preserved active ${gameId}/${initialPhase || "none"}`,
  );

  await reloadDuringExpectedNavigation(player.page, player.fault, async () => {
    await activePlayerGameLocator(player.page, gameId).waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT_MS,
    });
  });
  await playerSessionLocator(player.page, playerId, playerTeamId, gameId, false).waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  console.log(`ok ${scenarioLabel} player refresh preserved active game and identity`);

  await hostPage.getByTestId("host-toggle-pause").click();
  await hostRuntimeLocator(hostPage, gameId, true).waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  await player.page.getByTestId("player-paused").waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  await playerSessionLocator(player.page, playerId, playerTeamId, gameId, true).waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  await reloadDuringExpectedNavigation(hostPage, hostFault, async () => {
    await hostRuntimeLocator(hostPage, gameId, true).waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT_MS,
    });
  });
  if (generatedTopics) {
    const afterPausedRefresh = await soundscapeTopicsSnapshot(hostPage);
    if (
      afterPausedRefresh.topics !== generatedTopics.topics ||
      afterPausedRefresh.fallback !== generatedTopics.fallback
    ) {
      throw new Error("Soundscape topics changed after pause and host refresh");
    }
  }
  await hostPage.locator('[data-testid="host-toggle-pause"][data-action="resume"]').click();
  await activePlayerGameLocator(player.page, gameId).waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  await playerSessionLocator(player.page, playerId, playerTeamId, gameId, false).waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  console.log(`ok ${scenarioLabel} pause survived host refresh and resumed for player`);

  hostFault.active = true;
  await hostContext.setOffline(true);
  await liveSafetyLocator(hostPage, "offline").waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  await hostContext.setOffline(false);
  await liveSafetyLocator(hostPage, "live").waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  hostFault.active = false;
  await activeHostGameLocator(hostPage, gameId).waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  console.log(`ok ${scenarioLabel} host offline → live preserved active game`);

  player.fault.active = true;
  await player.context.setOffline(true);
  await player.page
    .locator('[data-testid="player-shell"][data-connection-status="offline"]')
    .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  await player.context.setOffline(false);
  await player.page
    .locator('[data-testid="player-shell"][data-connection-status="live"]')
    .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  player.fault.active = false;
  await activePlayerGameLocator(player.page, gameId).waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  await playerSessionLocator(player.page, playerId, playerTeamId, gameId, false).waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  console.log(`ok ${scenarioLabel} player offline → live preserved active game and identity`);

  if (media) {
    if (gameId !== "soundscape") {
      throw new Error(`Media smoke requires Soundscape first, received ${gameId}`);
    }
    await runSoundscapeMicrophoneFlow({
      baseUrl,
      hostPage,
      player,
      playerId,
      playerTeamId,
      scenarioLabel,
    });
  }

  const latePlayer = await openPlayer(
    browser,
    baseUrl,
    room.code,
    scenarioLabel,
    scenario.playerCount + 1,
    contexts,
    errors,
  );
  await submitPlayerJoin(latePlayer, gameId);
  const lateSession = latePlayer.page.getByTestId("player-session");
  const latePlayerId = await lateSession.getAttribute("data-player-id");
  const lateTeamId = await lateSession.getAttribute("data-team-id");
  if (!latePlayerId || !lateTeamId) throw new Error("Active late join did not expose identity");
  await activePlayerGameLocator(latePlayer.page, gameId).waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  await reloadDuringExpectedNavigation(latePlayer.page, latePlayer.fault, async () => {
    await playerSessionLocator(latePlayer.page, latePlayerId, lateTeamId, gameId, false).waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT_MS,
    });
  });
  players.push(latePlayer);
  console.log(`ok ${scenarioLabel} late join during ${gameId} survived refresh`);

  await runWithCommittedHostCommand(hostPage, () =>
    hostPage.getByTestId("host-back-to-hub").click(),
  );
  await hostRuntimeLocator(hostPage, "", false).waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  const conductor = hostPage.getByTestId("party-conductor");
  await conductor.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  const nextRouteStepId = await conductor.getAttribute("data-next-route-step-id");
  if (!nextRouteStepId || nextRouteStepId === routeStepId) {
    throw new Error(`Completed route step ${routeStepId} returned after leaving ${gameId}`);
  }
  await waitForPlayerIdentity(player.page, playerId, playerTeamId);
  console.log(`ok ${scenarioLabel} hub return advanced route ${routeStepId} → ${nextRouteStepId}`);
  if (media) {
    await runChallengeCameraFlow({ baseUrl, hostPage, players, scenarioLabel });
    await runPhotoHuntCaptureFlow({ hostPage, player, scenarioLabel });
  }
}

async function runResilienceChecks(params: {
  baseUrl: URL;
  browser: Browser;
  contexts: BrowserContext[];
  errors: string[];
  hostContext: BrowserContext;
  hostFault: NetworkFaultState;
  hostPage: Page;
  media: boolean;
  players: BrowserPlayer[];
  room: CreatedRoom;
  scenario: BrowserSmokeScenario;
}) {
  const {
    baseUrl,
    browser,
    contexts,
    errors,
    hostContext,
    hostFault,
    hostPage,
    media,
    players,
    room,
    scenario,
  } = params;
  const scenarioLabel = browserSmokeScenarioLabel(scenario);
  const player = players[0];
  if (!player) throw new Error("Resilience smoke requires at least one joined player");
  const initialPlayerPanel = player.page.getByTestId("player-joined");
  const playerId = await initialPlayerPanel.getAttribute("data-player-id");
  const initialTeamId = await initialPlayerPanel.getAttribute("data-team-id");
  if (!playerId || !initialTeamId) throw new Error("Joined player identity was not rendered");

  await hostPage.reload({ waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT_MS });
  await readinessLocator(hostPage, scenario, scenario.playerCount).waitFor({
    state: "attached",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  await liveSafetyLocator(hostPage, "live").waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  console.log(`ok ${scenarioLabel} host refresh preserved authorization and readiness`);

  await player.page.reload({ waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT_MS });
  await waitForPlayerIdentity(player.page, playerId, initialTeamId);
  console.log(`ok ${scenarioLabel} player refresh preserved identity`);

  const targetTeam = player.page
    .locator('[data-testid^="switch-team-"][data-active="false"]')
    .first();
  await targetTeam.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  const targetTestId = await targetTeam.getAttribute("data-testid");
  const targetTeamId = targetTestId?.replace("switch-team-", "");
  if (!targetTeamId) throw new Error("Could not identify a target team for switch");
  await targetTeam.click();
  await waitForPlayerIdentity(player.page, playerId, targetTeamId);
  await player.page.reload({ waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT_MS });
  await waitForPlayerIdentity(player.page, playerId, targetTeamId);
  console.log(`ok ${scenarioLabel} team switch survived refresh with stable player id`);

  hostFault.active = true;
  await hostContext.setOffline(true);
  await liveSafetyLocator(hostPage, "offline").waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  await hostContext.setOffline(false);
  await liveSafetyLocator(hostPage, "live").waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  hostFault.active = false;
  await readinessLocator(hostPage, scenario, scenario.playerCount).waitFor({
    state: "attached",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  console.log(`ok ${scenarioLabel} host offline → live resync preserved room state`);

  player.fault.active = true;
  await player.context.setOffline(true);
  await player.page
    .locator('[data-testid="player-shell"][data-connection-status="offline"]')
    .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  await player.context.setOffline(false);
  await player.page
    .locator('[data-testid="player-shell"][data-connection-status="live"]')
    .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  player.fault.active = false;
  await waitForPlayerIdentity(player.page, playerId, targetTeamId);
  console.log(`ok ${scenarioLabel} player offline → live resync preserved identity`);

  const latePlayer = await openPlayer(
    browser,
    baseUrl,
    room.code,
    scenarioLabel,
    scenario.playerCount,
    contexts,
    errors,
  );
  await submitPlayerJoin(latePlayer);
  const latePanel = latePlayer.page.getByTestId("player-joined");
  const latePlayerId = await latePanel.getAttribute("data-player-id");
  const lateTeamId = await latePanel.getAttribute("data-team-id");
  if (!latePlayerId || !lateTeamId) throw new Error("Late player identity was not rendered");
  await readinessLocator(hostPage, scenario, scenario.playerCount + 1).waitFor({
    state: "attached",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  await latePlayer.page.reload({ waitUntil: "networkidle", timeout: DEFAULT_TIMEOUT_MS });
  await waitForPlayerIdentity(latePlayer.page, latePlayerId, lateTeamId);
  players.push(latePlayer);
  console.log(`ok ${scenarioLabel} late join updated roster and survived refresh`);

  if (media) {
    await runLobbyDevicePreflight({
      baseUrl,
      hostPage,
      player,
      playerId,
      playerTeamId: targetTeamId,
      scenarioLabel,
    });
  }

  await runActiveGameResilienceChecks({
    baseUrl,
    browser,
    contexts,
    errors,
    hostContext,
    hostFault,
    hostPage,
    media,
    player,
    playerId,
    playerTeamId: targetTeamId,
    players,
    room,
    scenario,
  });
}

async function closeContexts(contexts: BrowserContext[]) {
  await Promise.allSettled(contexts.map((context) => context.close()));
}

async function verifyHostHandoff({
  baseUrl,
  browser,
  contexts,
  errors,
  hostContext,
  hostPage,
  room,
  scenarioLabel,
}: {
  baseUrl: URL;
  browser: Browser;
  contexts: BrowserContext[];
  errors: string[];
  hostContext: BrowserContext;
  hostPage: Page;
  room: CreatedRoom;
  scenarioLabel: string;
}) {
  await hostContext.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: baseUrl.origin,
  });
  const liveSafety = hostPage.locator('[data-testid="live-safety"]:visible').first();
  await liveSafety.getByText("Backup host device", { exact: true }).click();
  const copyButton = liveSafety.getByTestId("copy-host-access");
  await copyButton.click();
  await hostPage
    .locator('[data-testid="copy-host-access"]:visible', { hasText: "Private link copied" })
    .first()
    .waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  const backupUrl = await hostPage.evaluate(() => navigator.clipboard.readText());
  const parsed = new URL(backupUrl);
  if (
    parsed.origin !== baseUrl.origin ||
    parsed.pathname !== `/host/${room.code}` ||
    parsed.search ||
    !parsed.hash.startsWith("#host-access=")
  ) {
    throw new Error("Private host backup link did not keep access in the expected URL fragment");
  }

  const backupContext = await browser.newContext();
  contexts.push(backupContext);
  const backupPage = await backupContext.newPage();
  observePage(backupPage, `${scenarioLabel}-backup-host`, errors, { active: false });
  await backupPage.goto(backupUrl, {
    waitUntil: "domcontentloaded",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  await backupPage.getByTestId("host-runtime").waitFor({
    state: "attached",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  await backupPage.waitForFunction(() => window.location.hash === "", undefined, {
    timeout: DEFAULT_TIMEOUT_MS,
  });
  if (new URL(backupPage.url()).hash) {
    throw new Error("Backup host credential remained in the address bar after verification");
  }
  console.log(`ok ${scenarioLabel} verified host handoff on an isolated backup device`);
  return backupPage;
}

async function verifyFieldReportDownload({
  backupHostPage,
  hostPage,
  room,
  scenario,
  players,
}: {
  backupHostPage: Page;
  hostPage: Page;
  room: CreatedRoom;
  scenario: BrowserSmokeScenario;
  players: BrowserPlayer[];
}) {
  const openPanel = async (page: Page) => {
    const panel = page.locator('[data-testid="field-report-panel"]:visible');
    await panel.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
    if ((await panel.getAttribute("open")) === null) await panel.locator("summary").click();
    return panel;
  };
  const waitForDraftState = async (
    panel: ReturnType<Page["locator"]>,
    states: string | string[],
  ) => {
    const expected = typeof states === "string" ? [states] : states;
    const selector = [...expected, "error"]
      .map((state) => `[data-testid="field-report-draft-status"][data-state="${state}"]`)
      .join(", ");
    const status = panel.locator(selector);
    await status.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
    const actual = await status.getAttribute("data-state");
    if (!actual || !expected.includes(actual)) {
      throw new Error(
        `Field report draft entered ${actual || "unknown"}: ${await status.textContent()}`,
      );
    }
  };

  let panel = await openPanel(hostPage);
  await waitForDraftState(panel, ["saved", "recovered"]);
  await panel.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
  await panel.getByLabel("Event date").fill("2026-07-17");
  await panel.getByPlaceholder("Venue / location").fill("Automated browser smoke");
  await panel.getByPlaceholder("Host device · OS · browser").fill("Chromium smoke host");
  await panel.getByLabel("Run evidence").selectOption("automated");
  await panel.getByLabel("Backup host handoff").selectOption("verified");
  await panel.getByLabel("Story callback in game").selectOption("not-tested");
  await panel.getByLabel("Story callback in finale").selectOption("not-tested");
  await panel.getByLabel("Story seed safety").selectOption("not-tested");
  await panel.getByLabel("Report outcome").selectOption("pass");
  await waitForDraftState(panel, "saving");
  await waitForDraftState(panel, "saved");

  await hostPage.reload({ waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT_MS });
  await hostPage.getByTestId("host-runtime").waitFor({
    state: "attached",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  panel = await openPanel(hostPage);
  await waitForDraftState(panel, "recovered");
  if (
    (await panel.getByLabel("Event date").inputValue()) !== "2026-07-17" ||
    (await panel.getByPlaceholder("Venue / location").inputValue()) !== "Automated browser smoke" ||
    (await panel.getByLabel("Run evidence").inputValue()) !== "automated" ||
    (await panel.getByLabel("Report outcome").inputValue()) !== "pass"
  ) {
    throw new Error("Field report draft did not survive the primary host refresh");
  }
  console.log(`ok ${browserSmokeScenarioLabel(scenario)} field report draft survived host refresh`);

  await backupHostPage.reload({ waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT_MS });
  await backupHostPage.getByTestId("host-runtime").waitFor({
    state: "attached",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  const backupPanel = await openPanel(backupHostPage);
  await waitForDraftState(backupPanel, "recovered");
  if (
    (await backupPanel.getByLabel("Event date").inputValue()) !== "2026-07-17" ||
    (await backupPanel.getByPlaceholder("Host device · OS · browser").inputValue()) !==
      "Chromium smoke host" ||
    (await backupPanel.getByLabel("Backup host handoff").inputValue()) !== "verified"
  ) {
    throw new Error("Field report draft did not reach the isolated backup host device");
  }
  console.log(
    `ok ${browserSmokeScenarioLabel(scenario)} field report draft recovered on backup host`,
  );

  await hostPage.bringToFront();
  await panel.getByRole("button", { name: "Download .json" }).click();
  await panel.getByText(/PASS report incomplete\. Next:/).waitFor({
    state: "visible",
    timeout: DEFAULT_TIMEOUT_MS,
  });
  await panel.getByLabel("Report outcome").selectOption("pending");
  const downloadPromise = hostPage.waitForEvent("download", { timeout: DEFAULT_TIMEOUT_MS });
  await panel.getByRole("button", { name: "Download .json" }).click();
  const download = await downloadPromise;
  const failure = await download.failure();
  if (failure) throw new Error(`Field report download failed: ${failure}`);
  if (!download.suggestedFilename().endsWith(".json")) {
    throw new Error(`Field report used an unexpected filename: ${download.suggestedFilename()}`);
  }
  const stream = await download.createReadStream();
  if (!stream) throw new Error("Field report download had no readable stream");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const serialized = Buffer.concat(chunks).toString("utf8");
  const report = JSON.parse(serialized) as {
    schemaVersion?: number;
    event?: { roomCode?: string; date?: string; runKind?: string };
    program?: {
      joinedPlayers?: number;
      rosterReadySeconds?: number | null;
      launchSeconds?: number | null;
      startedAt?: string | null;
      storySeedConfigured?: boolean;
    };
    scoring?: { ledgerAvailable?: boolean };
    observations?: {
      hostHandoff?: string;
      hostExperience?: string;
      hostAutonomy?: string;
      launchSignalResult?: string;
      launchSignalsObserved?: string[];
      storyCallbackInGame?: string;
      storyCallbackInFinale?: string;
      storySafety?: string;
      physicalReliability?: Record<string, string>;
    };
    privacy?: {
      containsPlayerNames?: boolean;
      containsPrivateAssignments?: boolean;
      containsTranscriptsOrMedia?: boolean;
    };
  };
  if (
    report.schemaVersion !== 5 ||
    report.event?.roomCode !== room.code ||
    report.event?.date !== "2026-07-17" ||
    report.event?.runKind !== "automated" ||
    report.program?.joinedPlayers !== scenario.playerCount ||
    typeof report.program.rosterReadySeconds !== "number" ||
    typeof report.program.launchSeconds !== "number" ||
    !report.program.startedAt ||
    report.program.storySeedConfigured !== true ||
    report.scoring?.ledgerAvailable !== true ||
    report.observations?.hostHandoff !== "verified" ||
    report.observations?.hostExperience !== "unknown" ||
    report.observations?.hostAutonomy !== "unknown" ||
    report.observations?.launchSignalResult !== "unknown" ||
    !report.observations?.launchSignalsObserved?.includes("INVITE.") ||
    !report.observations?.launchSignalsObserved?.includes("START.") ||
    report.observations?.storyCallbackInGame !== "not-tested" ||
    report.observations?.storyCallbackInFinale !== "not-tested" ||
    report.observations?.storySafety !== "not-tested" ||
    !report.observations.physicalReliability ||
    Object.keys(report.observations.physicalReliability).length !== 7 ||
    !Object.values(report.observations.physicalReliability).every(
      (result) => result === "not-tested",
    )
  ) {
    throw new Error(`Field report missed required live evidence: ${serialized.slice(0, 1_000)}`);
  }
  if (
    report.privacy?.containsPlayerNames !== false ||
    report.privacy?.containsPrivateAssignments !== false ||
    report.privacy?.containsTranscriptsOrMedia !== false
  ) {
    throw new Error("Field report did not declare the expected privacy boundary");
  }
  for (const player of players) {
    if (serialized.includes(player.name)) {
      throw new Error(`Field report exposed player data for test player ${player.index}`);
    }
  }
  if (serialized.includes(scenarioStorySeed(scenario))) {
    throw new Error("Field report exposed the public story seed instead of a bounded boolean");
  }
  console.log(`ok ${browserSmokeScenarioLabel(scenario)} privacy-safe field report downloaded`);
}

async function runBrowserSmokeScenario(
  browser: Browser,
  baseUrl: URL,
  scenario: BrowserSmokeScenario,
  brief: boolean,
  resilience: boolean,
  media: boolean,
  journey: boolean,
  expectedBackend: ExpectedBackendStatus,
) {
  const scenarioLabel = browserSmokeScenarioLabel(scenario);
  const startedAt = Date.now();
  const pageErrors: string[] = [];
  const contexts: BrowserContext[] = [];
  let room: CreatedRoom | undefined;
  let failure: unknown;

  try {
    const hostContext = await browser.newContext();
    contexts.push(hostContext);
    const hostPage = await hostContext.newPage();
    const hostFault = { active: false };
    observePage(hostPage, `${scenarioLabel}-host`, pageErrors, hostFault);

    room = await createQuickStartRoom(hostPage, baseUrl, scenario);
    console.log(`ok ${scenarioLabel} room created: ${room.code}`);

    if (brief) {
      await releaseHealthLocator(hostPage, "ready").waitFor({
        state: "visible",
        timeout: READINESS_TIMEOUT_MS,
      });
      const inviteCoach = hostPage.locator(
        '[data-testid="quick-start-launch-coach"][data-coach-state="invite-guests"][data-coach-action="show-qr"][data-signal="INVITE."]',
      );
      await inviteCoach.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
      const inviteCopy = (await inviteCoach.textContent()) ?? "";
      if (
        !inviteCopy.includes("INVITE.") ||
        !inviteCopy.includes("Invite") ||
        !inviteCopy.includes("later arrivals can still join") ||
        (await inviteCoach.locator("button, a").count()) !== 1
      ) {
        throw new Error(`First-time host did not receive one launch signal: ${inviteCopy.trim()}`);
      }
      await hostPage.getByTestId("quick-start-show-qr").click();
      await hostPage.getByTestId("setup-fullscreen-qr").waitFor({
        state: "visible",
        timeout: DEFAULT_TIMEOUT_MS,
      });
      await hostPage.getByTestId("setup-fullscreen-qr-close").click();
      await hostPage.getByTestId("setup-fullscreen-qr").waitFor({
        state: "hidden",
        timeout: DEFAULT_TIMEOUT_MS,
      });
      if (pageErrors.length > 0) {
        throw new Error(`Uncaught browser errors:\n${pageErrors.join("\n")}`);
      }
      console.log(
        `ok ${scenarioLabel} self-serve host brief persisted and INVITE signal opened the QR`,
      );
    } else {
      const backupHostPage = await verifyHostHandoff({
        baseUrl,
        browser,
        contexts,
        errors: pageErrors,
        hostContext,
        hostPage,
        room,
        scenarioLabel,
      });

      const players = await joinPlayers(
        browser,
        baseUrl,
        room.code,
        scenario,
        contexts,
        pageErrors,
      );
      console.log(`ok ${scenarioLabel} ${scenario.playerCount} isolated players joined`);

      if (scenario.playerCount === 30) {
        await verifyFullRoomBoundary({
          baseUrl,
          browser,
          contexts,
          errors: pageErrors,
          hostPage,
          roomCode: room.code,
          roomId: room.id,
          scenarioLabel,
        });
        console.log(`ok ${scenarioLabel} 31st guest blocked with host-assisted recovery`);
      }

      const programReadiness = programReadinessLocator(hostPage, scenario, scenario.playerCount);
      await programReadiness.waitFor({
        state: "attached",
        timeout: READINESS_TIMEOUT_MS,
      });
      await releaseHealthLocator(hostPage, expectedBackend).waitFor({
        state: "visible",
        timeout: READINESS_TIMEOUT_MS,
      });

      if (expectedBackend === "degraded") {
        const degraded = hostPage.locator(
          '[data-testid="quick-start-readiness"][data-program-ready="true"][data-ready="false"][data-backend-ready="false"][data-backend-status="degraded"]',
        );
        await degraded.waitFor({ state: "attached", timeout: DEFAULT_TIMEOUT_MS });
        const repairCoach = hostPage.locator(
          '[data-testid="quick-start-launch-coach"][data-coach-state="repair-backend"][data-coach-action="live-safety"][data-signal="FIX."]',
        );
        await repairCoach.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
        const repairCopy = (await repairCoach.textContent()) ?? "";
        if (
          !repairCopy.includes("FIX.") ||
          !repairCopy.includes("service blocked") ||
          (await repairCoach.locator("button, a").count()) !== 1
        ) {
          throw new Error(`Host did not receive one backend-repair signal: ${repairCopy.trim()}`);
        }
        if ((await hostPage.getByTestId("quick-start-begin").count()) !== 0) {
          throw new Error("Backend-degraded room exposed a misleading party launch control");
        }
        if (
          (await hostPage.getByTestId("quick-start-open-live-safety").getAttribute("href")) !==
          "#live-safety"
        ) {
          throw new Error("Backend repair coach did not point to Live safety");
        }
        console.log(
          `ok ${scenarioLabel} program ready but backend gate degraded in ${Date.now() - startedAt}ms`,
        );
      } else {
        const readiness = readinessLocator(hostPage, scenario, scenario.playerCount);
        await readiness.waitFor({ state: "attached", timeout: DEFAULT_TIMEOUT_MS });
        const readyCoach = hostPage.locator(
          '[data-testid="quick-start-launch-coach"][data-coach-state="ready-to-start"][data-coach-action="start"][data-signal="START."]',
        );
        await readyCoach.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
        const readyCoachCopy = (await readyCoach.textContent()) ?? "";
        const expectedCapacityCopy =
          scenario.playerCount === 30 ? "exactly 30/30" : "Extra guests can join";
        if (
          !readyCoachCopy.includes("START.") ||
          !readyCoachCopy.includes(expectedCapacityCopy) ||
          (await readyCoach.locator("button, a").count()) !== 1
        ) {
          throw new Error(`Ready host signal was ambiguous: ${readyCoachCopy.trim()}`);
        }
        console.log(`ok ${scenarioLabel} host readiness green in ${Date.now() - startedAt}ms`);

        const beginParty = hostPage.getByTestId("quick-start-begin");
        const firstStepId = await beginParty.getAttribute("data-step-id");
        if (!firstStepId) throw new Error("Quick start did not expose its first route cue");
        await beginParty.click();
        await hostPage
          .locator(
            `[data-testid="quick-start-readiness"][data-party-started="true"][data-active-route-step-id="${firstStepId}"]`,
          )
          .waitFor({ state: "attached", timeout: DEFAULT_TIMEOUT_MS });
        await waitForActiveRouteStep(hostPage, firstStepId);
        const liveCueText =
          (await hostPage.getByTestId("quick-start-readiness").textContent()) ?? "";
        if (!liveCueText.includes("First cue live")) {
          throw new Error(`Quick start did not expose the live opening cue: ${liveCueText.trim()}`);
        }
        console.log(`ok ${scenarioLabel} party started with persisted cue ${firstStepId}`);
        await verifyFieldReportDownload({ backupHostPage, hostPage, room, scenario, players });
      }
      if (pageErrors.length > 0) {
        throw new Error(`Uncaught browser errors:\n${pageErrors.join("\n")}`);
      }

      if (resilience) {
        await runResilienceChecks({
          baseUrl,
          browser,
          contexts,
          errors: pageErrors,
          hostContext,
          hostFault,
          hostPage,
          media,
          players,
          room,
          scenario,
        });
        if (pageErrors.length > 0) {
          throw new Error(`Uncaught browser errors:\n${pageErrors.join("\n")}`);
        }
      }
      if (journey) {
        await runFullJourneyChecks({ hostPage, players, room, scenario });
        if (pageErrors.length > 0) {
          throw new Error(`Uncaught browser errors:\n${pageErrors.join("\n")}`);
        }
      }
    }
  } catch (error) {
    failure =
      pageErrors.length > 0
        ? new AggregateError(
            [error, new Error(pageErrors.join("\n"))],
            "Browser smoke failed with page diagnostics",
          )
        : error;
  } finally {
    await closeContexts(contexts);
    if (room) {
      let cleanupFailure: unknown;
      try {
        const cleanup = await cleanupRoomById(room.id);
        if (cleanup.roomsDeleted !== 1 || cleanup.errors.length > 0) {
          cleanupFailure = new Error(
            `Targeted cleanup was incomplete: deleted=${cleanup.roomsDeleted}, errors=${cleanup.errors.join(", ") || "none"}`,
          );
        } else {
          console.log(`ok ${scenarioLabel} test room ${room.code} removed`);
        }
      } catch (cleanupError) {
        cleanupFailure = cleanupError;
      }
      if (cleanupFailure) {
        failure = failure
          ? new AggregateError([failure, cleanupFailure], "Browser smoke and cleanup both failed")
          : cleanupFailure;
      }
    }
  }

  if (failure) throw failure;
}

async function runBrowserSmoke() {
  const baseUrl = browserSmokeBaseUrl();
  const expectedBackend = expectedBackendStatus();
  const scenarios = parseBrowserSmokeScenarios(process.argv.slice(2), process.env);
  const { brief, journey, media, resilience } = parseBrowserSmokeOptions(
    process.argv.slice(2),
    process.env,
  );
  if ((resilience || journey) && scenarios.length !== 1) {
    throw new Error(
      "Resilience and journey smoke run one scenario at a time; do not combine them with --matrix",
    );
  }
  if (brief && (resilience || journey)) {
    throw new Error("Brief smoke is setup-only; do not combine it with journey or resilience");
  }
  if (journey && resilience) {
    throw new Error(
      "Journey smoke is a distinct full-route run; do not combine it with resilience or media",
    );
  }
  if (resilience && scenarios[0] && scenarios[0].playerCount >= 29) {
    throw new Error(
      "Resilience smoke needs room for lobby and active-game late joins; start with fewer than 29 players",
    );
  }
  if (media && scenarios[0]?.venue !== "park") {
    throw new Error("Media smoke requires a park route so Soundscape and Challenge run in order");
  }
  if (journey && scenarios[0]?.venue !== "park") {
    throw new Error(
      "Journey smoke requires a park route so Soundscape supplies connected evidence",
    );
  }
  if (expectedBackend === "degraded" && (resilience || journey)) {
    throw new Error(
      "Degraded backend smoke only verifies the release gate; resilience and journey need ready",
    );
  }
  assertMutationSafety(baseUrl);
  const browser = await chromium.launch({
    executablePath: chromeExecutablePath(),
    headless: process.env.BROWSER_SMOKE_HEADLESS !== "NO",
    args: media ? ["--use-fake-device-for-media-stream"] : undefined,
  });

  try {
    for (const scenario of scenarios) {
      await runBrowserSmokeScenario(
        browser,
        baseUrl,
        scenario,
        brief,
        resilience,
        media,
        journey,
        expectedBackend,
      );
    }
  } finally {
    await browser.close().catch(() => {});
  }

  console.log(
    `Browser smoke passed ${scenarios.length} scenario${scenarios.length === 1 ? "" : "s"} with backend ${expectedBackend} for ${baseUrl.origin}`,
  );
}

await runBrowserSmoke().catch((error) => {
  console.error(formatFailure(error));
  process.exit(1);
});
