import { describe, expect, test } from "bun:test";
import { EXPERIENCE_IDS, PARTY_LOCALES } from "@/lib/party-context";
import {
  EXPERIENCE_PACKS,
  contextForExperience,
  environmentPromptContext,
  getExperienceAct,
  getExperienceRoute,
  PLANNED_GAME_IDS,
} from "./catalog";

describe("experience catalog", () => {
  test("defines every supported experience exactly once", () => {
    expect(Object.keys(EXPERIENCE_PACKS).sort()).toEqual([...EXPERIENCE_IDS].sort());

    for (const id of EXPERIENCE_IDS) {
      const pack = EXPERIENCE_PACKS[id];
      expect(pack.id).toBe(id);
      expect(pack.acts.length > 0).toBe(true);
      expect(new Set(pack.acts.map((act) => act.id)).size).toBe(pack.acts.length);
      for (const locale of PARTY_LOCALES) {
        expect(pack.title[locale].length > 0).toBe(true);
        expect(pack.hostPersona.name[locale].length > 0).toBe(true);
        expect(pack.hostPersona.voice[locale].length > 0).toBe(true);
      }
    }
  });

  test("default contexts point to acts with matching venues", () => {
    for (const id of EXPERIENCE_IDS) {
      const pack = EXPERIENCE_PACKS[id];
      const act = getExperienceAct(id, pack.defaultContext.actId);
      expect(pack.defaultContext.experienceId).toBe(id);
      expect(act?.venue).toBe(pack.defaultContext.venue);
    }
  });

  test("all routes reference declared acts and have valid unique steps", () => {
    for (const id of EXPERIENCE_IDS) {
      const pack = EXPERIENCE_PACKS[id];
      const actIds = new Set(pack.acts.map((act) => act.id));
      for (const route of Object.values(pack.routes)) {
        expect(route.actOrder.length > 0).toBe(true);
        expect(new Set(route.actOrder).size).toBe(route.actOrder.length);
        for (const actId of route.actOrder) expect(actIds.has(actId)).toBe(true);

        const stepIds = route.steps.map((step) => step.id);
        expect(new Set(stepIds).size).toBe(stepIds.length);
        for (const step of route.steps) {
          expect(actIds.has(step.actId)).toBe(true);
          expect(route.actOrder.includes(step.actId)).toBe(true);
          expect(step.durationMinutes > 0).toBe(true);
        }
      }
    }
  });

  test("smoke and neon routes preserve the normal, bar-only and compact stories", () => {
    expect(getExperienceRoute("smoke-neon-norrebro", "normal").actOrder).toEqual([
      "grill",
      "transition",
      "bar",
      "finale",
    ]);
    expect(getExperienceRoute("smoke-neon-norrebro", "bar-only").actOrder).toEqual([
      "bar",
      "finale",
    ]);
    expect(
      getExperienceRoute("smoke-neon-norrebro", "compact").steps.length <
        getExperienceRoute("smoke-neon-norrebro", "normal").steps.length,
    ).toBe(true);
  });

  test("planned game ids are unique and every normal game step is known", () => {
    expect(new Set(PLANNED_GAME_IDS).size).toBe(PLANNED_GAME_IDS.length);
    const planned = new Set<string>(PLANNED_GAME_IDS);
    const existing = new Set([
      "soundscape",
      "challenge",
      "phototunt",
      "trackguess",
      "spectrumcourt",
      "whoamong",
      "impostor",
    ]);

    for (const step of getExperienceRoute("smoke-neon-norrebro", "normal").steps) {
      if (!("gameId" in step)) continue;
      expect(planned.has(step.gameId) || existing.has(step.gameId)).toBe(true);
    }
  });

  test("environment context follows content locale and keeps the environment central", () => {
    const grillRu = environmentPromptContext({
      ...contextForExperience("smoke-neon-norrebro"),
      contentLocale: "ru",
    });
    const grillEn = environmentPromptContext({
      ...contextForExperience("smoke-neon-norrebro"),
      contentLocale: "en",
    });
    const barRu = environmentPromptContext({
      ...contextForExperience("smoke-neon-norrebro", "bar-only"),
      contentLocale: "ru",
    });

    expect(grillRu).toContain("дым");
    expect(grillRu).toContain("щипцы");
    expect(grillEn).toContain("smoke");
    expect(grillEn).toContain("tongs");
    expect(barRu).toContain("бокалы");
    expect(barRu).toContain("тосты");
  });

  test("classic context remains compatible with the existing park and bar modes", () => {
    const park = contextForExperience("classic-park");
    const bar = contextForExperience("classic-park", "bar-only");

    expect(park.actId).toBe("classic");
    expect(park.venue).toBe("park");
    expect(bar.actId).toBe("bar");
    expect(bar.venue).toBe("bar");
    expect(environmentPromptContext(park)).toContain("city park");
    expect(environmentPromptContext(bar)).toContain("cozy bar");
  });
});
