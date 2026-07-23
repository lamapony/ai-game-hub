import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("private recordings storage migrations", () => {
  test("creates a private bucket and removes anonymous read/write policies", () => {
    const createSql = readFileSync(
      resolve("supabase/migrations/20260701180000_create_recordings_bucket.sql"),
      "utf8",
    );
    const hardenSql = readFileSync(
      resolve("supabase/migrations/20260702170000_harden_room_state_writes.sql"),
      "utf8",
    );
    const repairSql = readFileSync(
      resolve("supabase/migrations/20260716120000_ensure_private_recordings_bucket.sql"),
      "utf8",
    );

    expect(createSql).toContain("VALUES ('recordings', 'recordings', false)");
    expect(hardenSql).toContain('DROP POLICY IF EXISTS "recordings_anon_insert"');
    expect(hardenSql).toContain('DROP POLICY IF EXISTS "recordings_anon_select"');
    expect(repairSql).toContain("ON CONFLICT (id) DO UPDATE");
    expect(repairSql).toContain("public = false");
    expect(repairSql).toContain('DROP POLICY IF EXISTS "recordings_anon_insert"');
    expect(repairSql).toContain('DROP POLICY IF EXISTS "recordings_anon_select"');
  });
});
