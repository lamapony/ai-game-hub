import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyRoomState } from "@/lib/types";
import { PartyFinaleNarrative } from "./party-finale-narrative";

describe("PartyFinaleNarrative", () => {
  test("renders the same public connected epilogue for a player screen", () => {
    const state = emptyRoomState("Host");
    state.status = "finished";
    state.finale = {
      evidenceVersion: 1,
      evidenceCapturedAt: 1,
      evidence: [],
      narrative: {
        version: 1,
        headline: "Smoke met glassware",
        opening: "The grill opened the case.",
        callbacks: [
          {
            evidenceId: "toast:1",
            title: "The toast",
            payoff: "The bar accepted jurisdiction.",
          },
        ],
        closingToast: "To the witnesses.",
      },
    };

    const html = renderToStaticMarkup(<PartyFinaleNarrative state={state} />);
    expect(html).toContain('data-testid="party-finale-narrative"');
    expect(html).toContain('data-callback-count="1"');
    expect(html).toContain('data-testid="party-finale-callback"');
    expect(html).toContain('data-evidence-id="toast:1"');
    expect(html).toContain("Smoke met glassware");
    expect(html).toContain("The bar accepted jurisdiction");
    expect(html).toContain("To the witnesses");
  });

  test("does not expose serialized evidence while generation is pending", () => {
    const state = emptyRoomState("Host");
    state.status = "finished";
    state.finale = {
      evidenceVersion: 1,
      evidenceCapturedAt: 1,
      evidence: [
        {
          id: "safe:1",
          gameId: "toastsyndicate",
          title: "Public title",
          detail: "SERVER_ONLY_PROMPT_EVIDENCE",
        },
      ],
    };

    const html = renderToStaticMarkup(<PartyFinaleNarrative state={state} />);
    expect(html).toContain('data-testid="party-finale-narrative-pending"');
    expect(html.includes("SERVER_ONLY_PROMPT_EVIDENCE")).toBe(false);
  });
});
