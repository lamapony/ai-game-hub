import { describe, expect, test } from "bun:test";
import { contextForExperience } from "@/experiences/catalog";
import { oracleVerificationDecisionSchema } from "@/games/grilloracle/model";
import {
  grillOracleVerificationSpec,
  oracleVerificationJsonSchema,
} from "./grilloracle-verification.prompts";

const barContext = {
  ...contextForExperience("smoke-neon-norrebro", "normal"),
  actId: "bar" as const,
  venue: "bar" as const,
};

describe("Grill Oracle verification prompt", () => {
  test("keeps the exact verdict schema and deterministic fallback numbers", () => {
    const input = {
      playerName: "Ada",
      predictions: ["One", "Two", "Three"] as [string, string, string],
      results: [true, false, true] as [boolean, boolean, boolean],
    };
    const fallback = grillOracleVerificationSpec.fallback(input, barContext);

    expect(oracleVerificationDecisionSchema.safeParse(fallback).success).toBe(true);
    expect(fallback.fulfilled_count).toBe(2);
    expect(fallback.oracle_points).toBe(10);
    expect(fallback.skeptic_points).toBe(3);
    expect(oracleVerificationJsonSchema.schema.additionalProperties).toBe(false);
    expect(oracleVerificationDecisionSchema.safeParse({ ...fallback, rank: 1 }).success).toBe(
      false,
    );
  });

  test("includes server-derived bar environment, fixed scoring and few-shots", () => {
    const system = grillOracleVerificationSpec.buildSystem(barContext);

    expect(system).toContain("Viggos Bar");
    expect(system).toContain("5 oracle points per fulfilled prediction");
    expect(system).toContain("add no environment bonus");
    expect(system).toContain("Барная аура");
    expect(system).toContain('"fulfilled_count"');
  });
});
