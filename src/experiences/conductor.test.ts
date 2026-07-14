import { describe, expect, test } from "bun:test";
import type { PartyContext } from "@/lib/party-context";
import { contextForExperience, getExperienceRoute } from "./catalog";
import {
  buildRouteTimeline,
  getActiveExperienceAct,
  getActiveExperiencePack,
  getActiveExperienceRoute,
  getConductorLabels,
  getNextRecommendedRouteStep,
  localizeText,
} from "./conductor";

function withParty(base: PartyContext, patch: Partial<PartyContext>): PartyContext {
  return { ...base, ...patch };
}

describe("conductor selectors", () => {
  test("classic free play: empty route, no next step, free-play labels", () => {
    const park = contextForExperience("classic-park");
    const bar = contextForExperience("classic-park", "bar-only");

    expect(getActiveExperiencePack(park).id).toBe("classic-park");
    expect(getActiveExperienceRoute(park).actOrder).toEqual(["classic"]);
    expect(getActiveExperienceRoute(park).steps).toEqual([]);
    expect(getActiveExperienceAct(park)?.id).toBe("classic");
    expect(buildRouteTimeline(park)).toEqual([]);
    expect(getNextRecommendedRouteStep(park)).toBeUndefined();

    expect(getActiveExperienceAct(bar)?.id).toBe("bar");
    expect(getActiveExperienceRoute(bar).actOrder).toEqual(["bar"]);
    expect(buildRouteTimeline(bar)).toEqual([]);
    expect(getNextRecommendedRouteStep(bar)).toBeUndefined();

    const labels = getConductorLabels(park);
    expect(labels.experienceShortTitle).toBe("Classic");
    expect(labels.actLabel).toBe("Park");
    expect(labels.actEmoji).toBe("🌳");
    expect(labels.contingencyLabel).toBe("Full route");
  });

  test("smoke-neon normal: pack/route/act and grill next step prefer non-optional", () => {
    const grill = contextForExperience("smoke-neon-norrebro", "normal");
    expect(grill.actId).toBe("grill");

    expect(getActiveExperiencePack(grill).id).toBe("smoke-neon-norrebro");
    expect(getActiveExperienceRoute(grill).actOrder).toEqual([
      "grill",
      "transition",
      "bar",
      "finale",
    ]);
    expect(getActiveExperienceAct(grill)?.themeKey).toBe("grill");

    const next = getNextRecommendedRouteStep(grill);
    expect(next?.id).toBe("smoke-assign");
    expect(Boolean(next?.optional)).toBe(false);
    expect(next && "gameId" in next ? next.gameId : undefined).toBe("smokescreen");

    const grillSteps = getExperienceRoute("smoke-neon-norrebro", "normal").steps.filter(
      (step) => step.actId === "grill",
    );
    expect(grillSteps.some((step) => step.optional)).toBe(true);
    expect(next?.id === "still-life").toBe(false);
    expect(next?.id === "photo-hunt").toBe(false);
  });

  test("smoke-neon normal timeline marks past/current/upcoming from current act", () => {
    const base = contextForExperience("smoke-neon-norrebro", "normal");

    const atGrill = buildRouteTimeline(base);
    expect(atGrill.every((item) => item.step.actId === "grill" || item.status === "upcoming")).toBe(
      true,
    );
    expect(atGrill.filter((item) => item.status === "current").map((item) => item.step.id)).toEqual(
      ["smoke-assign", "tongs-background", "oracle-capture", "still-life", "photo-hunt"],
    );
    expect(atGrill.filter((item) => item.status === "past")).toEqual([]);
    expect(atGrill.find((item) => item.step.id === "seal-evidence")?.status).toBe("upcoming");
    expect(atGrill.find((item) => item.step.id === "sommelier")?.status).toBe("upcoming");
    expect(atGrill.find((item) => item.step.id === "party-verdict")?.status).toBe("upcoming");

    const atTransition = buildRouteTimeline(
      withParty(base, { actId: "transition", venue: "grill-site" }),
    );
    expect(atTransition.find((item) => item.step.id === "smoke-assign")?.status).toBe("past");
    expect(atTransition.find((item) => item.step.id === "seal-evidence")?.status).toBe("current");
    expect(atTransition.find((item) => item.step.id === "sommelier")?.status).toBe("upcoming");
    expect(getNextRecommendedRouteStep(withParty(base, { actId: "transition" }))?.id).toBe(
      "seal-evidence",
    );
    expect(getNextRecommendedRouteStep(withParty(base, { actId: "transition" }))?.kind).toBe(
      "transition",
    );

    const atBar = buildRouteTimeline(withParty(base, { actId: "bar", venue: "bar" }));
    expect(atBar.find((item) => item.step.id === "oracle-capture")?.status).toBe("past");
    expect(atBar.find((item) => item.step.id === "seal-evidence")?.status).toBe("past");
    expect(atBar.find((item) => item.step.id === "sommelier")?.status).toBe("current");
    expect(atBar.find((item) => item.step.id === "cross-examination")?.status).toBe("current");
    expect(atBar.find((item) => item.step.id === "party-verdict")?.status).toBe("upcoming");

    const barNext = getNextRecommendedRouteStep(withParty(base, { actId: "bar", venue: "bar" }));
    expect(barNext?.id).toBe("sommelier");
    expect(Boolean(barNext?.optional)).toBe(false);

    const atFinale = buildRouteTimeline(withParty(base, { actId: "finale", venue: "bar" }));
    expect(atFinale.every((item) => item.step.actId === "finale" || item.status === "past")).toBe(
      true,
    );
    expect(atFinale.find((item) => item.step.id === "party-verdict")?.status).toBe("current");
    expect(getNextRecommendedRouteStep(withParty(base, { actId: "finale" }))?.id).toBe(
      "party-verdict",
    );
    expect(getNextRecommendedRouteStep(withParty(base, { actId: "finale" }))?.kind).toBe("finale");
  });

  test("bar-only contingency starts on bar and never schedules grill acts", () => {
    const barOnly = contextForExperience("smoke-neon-norrebro", "bar-only");
    expect(barOnly.actId).toBe("bar");
    expect(getActiveExperienceRoute(barOnly).actOrder).toEqual(["bar", "finale"]);

    const timeline = buildRouteTimeline(barOnly);
    expect(
      timeline.every((item) => item.step.actId === "bar" || item.step.actId === "finale"),
    ).toBe(true);
    expect(timeline.some((item) => item.step.actId === "grill")).toBe(false);
    expect(timeline.some((item) => item.step.actId === "transition")).toBe(false);

    expect(
      timeline.filter((item) => item.status === "current").map((item) => item.step.id),
    ).toEqual([
      "bar-smoke-assign",
      "bar-oracle-capture",
      "bar-sommelier",
      "bar-contraband",
      "bar-toast",
      "bar-oracle-verify",
      "bar-smoke-reveal",
      "bar-cross-examination",
    ]);
    expect(timeline.find((item) => item.step.id === "bar-party-verdict")?.status).toBe("upcoming");

    const next = getNextRecommendedRouteStep(barOnly);
    expect(next?.id).toBe("bar-smoke-assign");
    expect(Boolean(next?.optional)).toBe(false);

    const finale = withParty(barOnly, { actId: "finale" });
    expect(getNextRecommendedRouteStep(finale)?.id).toBe("bar-party-verdict");
    const finaleTimeline = buildRouteTimeline(finale);
    expect(finaleTimeline.find((item) => item.step.id === "bar-smoke-assign")?.status).toBe("past");
    expect(finaleTimeline.find((item) => item.step.id === "bar-party-verdict")?.status).toBe(
      "current",
    );
  });

  test("compact contingency is shorter and still prefers non-optional grill openers", () => {
    const compact = contextForExperience("smoke-neon-norrebro", "compact");
    const normal = contextForExperience("smoke-neon-norrebro", "normal");

    expect(
      getActiveExperienceRoute(compact).steps.length <
        getActiveExperienceRoute(normal).steps.length,
    ).toBe(true);
    expect(getNextRecommendedRouteStep(compact)?.id).toBe("compact-smoke-assign");

    const timeline = buildRouteTimeline(withParty(compact, { actId: "bar", venue: "bar" }));
    expect(timeline.find((item) => item.step.id === "compact-oracle")?.status).toBe("past");
    expect(timeline.find((item) => item.step.id === "compact-seal")?.status).toBe("past");
    expect(timeline.find((item) => item.step.id === "compact-toast")?.status).toBe("current");
    expect(timeline.find((item) => item.step.id === "compact-verdict")?.status).toBe("upcoming");

    expect(getNextRecommendedRouteStep(withParty(compact, { actId: "bar" }))?.id).toBe(
      "compact-toast",
    );
  });

  test("locale behavior uses uiLocale for labels, not contentLocale", () => {
    const base = contextForExperience("smoke-neon-norrebro");
    expect(base.contentLocale).toBe("ru");
    expect(base.uiLocale).toBe("en");

    const en = getConductorLabels(base);
    expect(en.experienceTitle).toBe("Smoke & Neon");
    expect(en.actLabel).toBe("Act I — Fire");
    expect(en.hostPersonaName).toBe("the evening investigator");
    expect(en.contingencyLabel).toBe("Full route");

    const ru = getConductorLabels(withParty(base, { uiLocale: "ru", contentLocale: "en" }));
    expect(ru.experienceTitle).toBe("Дым и неон");
    expect(ru.actLabel).toBe("Акт I — Огонь");
    expect(ru.hostPersonaName).toBe("следователь вечера");
    expect(ru.contingencyLabel).toBe("Полный маршрут");
    expect(ru.actEmoji).toBe("🔥");

    const barOnlyRu = getConductorLabels(
      withParty(contextForExperience("smoke-neon-norrebro", "bar-only"), { uiLocale: "ru" }),
    );
    expect(barOnlyRu.contingencyLabel).toBe("Только бар");
    expect(barOnlyRu.actLabel).toBe("Акт II — Алиби");

    expect(localizeText({ en: "Hello", ru: "Привет" }, "ru")).toBe("Привет");
    expect(localizeText({ en: "Hello", ru: "Привет" }, "en")).toBe("Hello");
  });

  test("invalid or impossible combinations allowed by PartyContext types stay safe", () => {
    const classicOnGrill = withParty(contextForExperience("classic-park"), {
      actId: "grill",
      venue: "grill-site",
    });
    expect(getActiveExperienceAct(classicOnGrill)).toBeUndefined();
    expect(buildRouteTimeline(classicOnGrill)).toEqual([]);
    expect(getNextRecommendedRouteStep(classicOnGrill)).toBeUndefined();
    expect(getConductorLabels(classicOnGrill).actLabel).toBe("");
    expect(getConductorLabels(classicOnGrill).actEmoji).toBe("");

    const smokeClassic = withParty(contextForExperience("smoke-neon-norrebro"), {
      actId: "classic",
      venue: "park",
    });
    expect(getActiveExperienceAct(smokeClassic)).toBeUndefined();
    expect(buildRouteTimeline(smokeClassic).every((item) => item.status === "upcoming")).toBe(true);
    expect(getNextRecommendedRouteStep(smokeClassic)).toBeUndefined();

    const barOnlyOnGrill = withParty(contextForExperience("smoke-neon-norrebro", "bar-only"), {
      actId: "grill",
      venue: "grill-site",
    });
    expect(getActiveExperienceAct(barOnlyOnGrill)?.id).toBe("grill");
    expect(getNextRecommendedRouteStep(barOnlyOnGrill)).toBeUndefined();
    const orphanTimeline = buildRouteTimeline(barOnlyOnGrill);
    expect(orphanTimeline.length > 0).toBe(true);
    expect(orphanTimeline.every((item) => item.status === "upcoming")).toBe(true);

    const classicFinale = withParty(contextForExperience("classic-park", "compact"), {
      actId: "finale",
      venue: "bar",
    });
    expect(getActiveExperienceRoute(classicFinale).steps).toEqual([]);
    expect(getNextRecommendedRouteStep(classicFinale)).toBeUndefined();
  });

  test("optional steps are never preferred when a non-optional step exists for the act", () => {
    const bar = withParty(contextForExperience("smoke-neon-norrebro"), {
      actId: "bar",
      venue: "bar",
    });
    const route = getActiveExperienceRoute(bar);
    const barSteps = route.steps.filter((step) => step.actId === "bar");
    const optionalIds = barSteps.filter((step) => step.optional).map((step) => step.id);
    expect(optionalIds.includes("contraband-start")).toBe(true);
    expect(optionalIds.includes("cross-examination")).toBe(true);

    const next = getNextRecommendedRouteStep(bar);
    expect(next?.id).toBe("sommelier");
    expect(Boolean(next?.optional)).toBe(false);
    expect(optionalIds.includes(next!.id)).toBe(false);
  });
});
