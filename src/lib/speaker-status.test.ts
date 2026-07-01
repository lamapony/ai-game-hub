import { describe, expect, test } from "bun:test";
import { formatSpeakerHeartbeatAge, speakerReadiness } from "./speaker-status";

describe("speaker readiness", () => {
  test("treats the host device as the main speaker", () => {
    const status = speakerReadiness(1, undefined, 1000);

    expect(status.status).toBe("host");
    expect(status.label).toBe("ведущий");
    expect(status.ageMs).toBe(0);
  });

  test("marks disconnected extra speakers offline", () => {
    expect(
      speakerReadiness(2, { connected: false, name: "Oak Spirit", lastSeenAt: 1000 }, 2000).status,
    ).toBe("offline");
  });

  test("marks connected speakers with fresh heartbeat ready", () => {
    const status = speakerReadiness(
      2,
      { connected: true, name: "Oak Spirit", lastSeenAt: 1000 },
      25_000,
    );

    expect(status.status).toBe("ready");
    expect(status.label).toBe("на связи");
    expect(status.ageMs).toBe(24_000);
  });

  test("marks connected speakers stale when heartbeat is old or missing", () => {
    expect(
      speakerReadiness(2, { connected: true, name: "Oak Spirit", lastSeenAt: 1000 }, 40_000).status,
    ).toBe("stale");
    expect(speakerReadiness(2, { connected: true, name: "Oak Spirit" }, 40_000).status).toBe(
      "stale",
    );
  });

  test("formats heartbeat age for host diagnostics", () => {
    expect(formatSpeakerHeartbeatAge(undefined)).toBe("нет heartbeat");
    expect(formatSpeakerHeartbeatAge(500)).toBe("только что");
    expect(formatSpeakerHeartbeatAge(15_000)).toBe("15 сек назад");
    expect(formatSpeakerHeartbeatAge(120_000)).toBe("2 мин назад");
  });
});
