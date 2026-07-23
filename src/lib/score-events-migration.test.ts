import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../../supabase/migrations/20260715151500_create_score_event_ledger.sql",
  import.meta.url,
);

describe("score event ledger migration", () => {
  test("keeps the append-only ledger behind the service role", async () => {
    const sql = await readFile(migrationUrl, "utf8");

    expect(sql.includes("ALTER TABLE public.score_events ENABLE ROW LEVEL SECURITY")).toBe(true);
    expect(sql.includes("REVOKE ALL ON public.score_events FROM PUBLIC, anon, authenticated")).toBe(
      true,
    );
    expect(
      sql.includes("GRANT SELECT, INSERT, DELETE ON public.score_events TO service_role"),
    ).toBe(true);
    expect(sql.includes("GRANT UPDATE ON public.score_events")).toBe(false);
    expect(sql.includes("ALTER PUBLICATION supabase_realtime ADD TABLE public.score_events")).toBe(
      false,
    );
    expect(sql.includes("CREATE POLICY")).toBe(false);
  });

  test("awards and materializes totals in one locked transaction", async () => {
    const sql = await readFile(migrationUrl, "utf8");

    expect(sql.includes("UNIQUE (room_id, idempotency_key)")).toBe(true);
    expect(sql.includes("SECURITY DEFINER")).toBe(true);
    expect(sql.includes("FOR UPDATE")).toBe(true);
    expect(sql.includes("UPDATE public.rooms SET state = v_state")).toBe(true);
    expect(sql.includes("score idempotency key belongs to another event")).toBe(true);
    expect(sql.includes("jsonb_build_object('replayed', true)")).toBe(true);
    expect(
      sql.includes("source IN ('vote', 'deterministic', 'ai-bonus', 'host-adjustment', 'legacy')"),
    ).toBe(true);
    expect(sql.includes("'Legacy score state reconciliation'")).toBe(true);
  });

  test("validates targets and keeps cleanup room-scoped", async () => {
    const sql = await readFile(migrationUrl, "utf8");

    expect(sql.includes("REFERENCES public.rooms(id) ON DELETE CASCADE")).toBe(true);
    expect(sql.includes("score player does not belong to team")).toBe(true);
    expect(sql.includes("score team not found")).toBe(true);
    expect(sql.includes("octet_length(rubric::text) <= 16384")).toBe(true);
    expect(
      sql.includes(
        "REVOKE ALL ON FUNCTION public.award_score_events(UUID, JSONB) FROM PUBLIC, anon, authenticated",
      ),
    ).toBe(true);
  });
});
