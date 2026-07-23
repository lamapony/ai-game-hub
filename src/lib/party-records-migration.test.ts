import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../../supabase/migrations/20260715143000_create_private_party_records.sql",
  import.meta.url,
);
const sessionBoundaryMigrationUrl = new URL(
  "../../supabase/migrations/20260719120000_add_party_record_session_boundary.sql",
  import.meta.url,
);

describe("private party records migration", () => {
  test("keeps the table server-only and out of public realtime", async () => {
    const sql = await readFile(migrationUrl, "utf8");

    expect(sql.includes("ALTER TABLE public.party_records ENABLE ROW LEVEL SECURITY")).toBe(true);
    expect(
      sql.includes("REVOKE ALL ON public.party_records FROM PUBLIC, anon, authenticated"),
    ).toBe(true);
    expect(sql.includes("GRANT ALL ON public.party_records TO service_role")).toBe(true);
    expect(sql.includes("ALTER PUBLICATION supabase_realtime ADD TABLE public.party_records")).toBe(
      false,
    );
    expect(sql.includes("CREATE POLICY")).toBe(false);
  });

  test("cascades cleanup and enforces idempotency and sealed payload constraints", async () => {
    const sql = await readFile(migrationUrl, "utf8");

    expect(sql.includes("REFERENCES public.rooms(id) ON DELETE CASCADE")).toBe(true);
    expect(sql.includes("UNIQUE (room_id, idempotency_key)")).toBe(true);
    expect(sql.includes("jsonb_typeof(payload) = 'object'")).toBe(true);
    expect(sql.includes("octet_length(payload::text) <= 65536")).toBe(true);
    expect(sql.includes("visibility <> 'player' OR owner_player_id IS NOT NULL")).toBe(true);
    expect(sql.includes("'sealed'")).toBe(true);
    expect(sql.includes("'revealed'")).toBe(true);
  });

  test("binds idempotency and reads to an explicit reusable-room session", async () => {
    const sql = await readFile(sessionBoundaryMigrationUrl, "utf8");

    expect(sql.includes("ADD COLUMN session_started_at BIGINT NOT NULL DEFAULT 0")).toBe(true);
    expect(sql.includes("room.state #>> '{party,sessionStartedAt}'")).toBe(true);
    expect(sql.includes("party_record.created_at >= to_timestamp")).toBe(true);
    expect(sql.includes("(room_id, session_started_at, run_id, created_at)")).toBe(true);
    expect(sql.includes("DROP CONSTRAINT party_records_room_idempotency_key")).toBe(false);
  });
});
