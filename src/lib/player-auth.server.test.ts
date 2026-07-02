import { describe, expect, test } from "bun:test";
import { hashPlayerSecret, playerSecretHashFromRequest } from "./player-auth.server";

describe("player auth", () => {
  test("hashes raw player secrets from trusted request fields", () => {
    const secret = "ps_1234567890abcdef1234567890abcdef";
    const request = new Request("http://localhost/api/player-action", {
      headers: { "x-player-secret": secret },
    });

    expect(playerSecretHashFromRequest(request, {})).toBe(hashPlayerSecret(secret));
  });

  test("does not accept public player secret hashes from request bodies", () => {
    const request = new Request("http://localhost/api/player-action");

    expect(
      playerSecretHashFromRequest(request, { playerSecretHash: "public-room-state-hash" } as never),
    ).toBe("");
  });
});
