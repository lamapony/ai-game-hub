import { MAX_ROOM_PLAYERS, MIN_ROOM_PLAYERS } from "../src/lib/room-capacity";

export const BROWSER_SMOKE_VENUES = ["park", "bar", "home", "festival"] as const;
export const BROWSER_SMOKE_DURATIONS = [120, 180, 240] as const;
export const BROWSER_SMOKE_MIN_PLAYERS = MIN_ROOM_PLAYERS;
export const BROWSER_SMOKE_MAX_PLAYERS = MAX_ROOM_PLAYERS;

export type BrowserSmokeVenue = (typeof BROWSER_SMOKE_VENUES)[number];
export type BrowserSmokeDuration = (typeof BROWSER_SMOKE_DURATIONS)[number];

export type BrowserSmokeScenario = {
  venue: BrowserSmokeVenue;
  durationMinutes: BrowserSmokeDuration;
  playerCount: number;
  expectedPlayers: number;
};

export type BrowserSmokeOptions = {
  brief: boolean;
  journey: boolean;
  media: boolean;
  resilience: boolean;
};

export const BROWSER_SMOKE_MATRIX: readonly BrowserSmokeScenario[] = [
  { venue: "park", durationMinutes: 120, playerCount: 8, expectedPlayers: 8 },
  { venue: "bar", durationMinutes: 180, playerCount: 8, expectedPlayers: 8 },
  { venue: "home", durationMinutes: 240, playerCount: 8, expectedPlayers: 8 },
  { venue: "festival", durationMinutes: 180, playerCount: 30, expectedPlayers: 30 },
];

function argValue(args: string[], name: string) {
  return args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

function parseInteger(value: string | undefined, fallback: number, label: string) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer, got ${value}`);
  return parsed;
}

function parseVenue(value: string | undefined): BrowserSmokeVenue {
  const venue = value ?? "park";
  if (!(BROWSER_SMOKE_VENUES as readonly string[]).includes(venue)) {
    throw new Error(`venue must be one of ${BROWSER_SMOKE_VENUES.join(", ")}, got ${venue}`);
  }
  return venue as BrowserSmokeVenue;
}

function parseDuration(value: string | undefined): BrowserSmokeDuration {
  const duration = parseInteger(value, 180, "duration");
  if (!(BROWSER_SMOKE_DURATIONS as readonly number[]).includes(duration)) {
    throw new Error(
      `duration must be one of ${BROWSER_SMOKE_DURATIONS.join(", ")}, got ${duration}`,
    );
  }
  return duration as BrowserSmokeDuration;
}

function parsePlayerCount(value: string | undefined, fallback: number, label: string) {
  const count = parseInteger(value, fallback, label);
  if (count < BROWSER_SMOKE_MIN_PLAYERS || count > BROWSER_SMOKE_MAX_PLAYERS) {
    throw new Error(
      `${label} must be ${BROWSER_SMOKE_MIN_PLAYERS}–${BROWSER_SMOKE_MAX_PLAYERS}, got ${count}`,
    );
  }
  return count;
}

export function browserSmokeScenarioLabel(scenario: BrowserSmokeScenario) {
  return `${scenario.venue}-${scenario.durationMinutes}m-${scenario.playerCount}p`;
}

export function parseBrowserSmokeOptions(
  args: string[],
  env: Record<string, string | undefined>,
): BrowserSmokeOptions {
  const media = args.includes("--media") || env.BROWSER_SMOKE_MEDIA === "YES";
  return {
    brief: args.includes("--brief") || env.BROWSER_SMOKE_BRIEF === "YES",
    journey: args.includes("--journey") || env.BROWSER_SMOKE_JOURNEY === "YES",
    media,
    resilience: media || args.includes("--resilience") || env.BROWSER_SMOKE_RESILIENCE === "YES",
  };
}

export function parseBrowserSmokeScenarios(
  args: string[],
  env: Record<string, string | undefined>,
): BrowserSmokeScenario[] {
  if (args.includes("--matrix") || env.BROWSER_SMOKE_MATRIX === "YES") {
    return BROWSER_SMOKE_MATRIX.map((scenario) => ({ ...scenario }));
  }

  const playerCount = parsePlayerCount(
    argValue(args, "--players") ?? env.BROWSER_SMOKE_PLAYERS,
    BROWSER_SMOKE_MIN_PLAYERS,
    "players",
  );
  const expectedPlayers = parsePlayerCount(
    argValue(args, "--expected-players") ?? env.BROWSER_SMOKE_EXPECTED_PLAYERS,
    playerCount,
    "expected players",
  );
  return [
    {
      venue: parseVenue(argValue(args, "--venue") ?? env.BROWSER_SMOKE_VENUE),
      durationMinutes: parseDuration(argValue(args, "--duration") ?? env.BROWSER_SMOKE_DURATION),
      playerCount,
      expectedPlayers,
    },
  ];
}
