# Project Notes

This project is maintained directly in GitHub and deployed independently. Avoid
rewriting published history unless explicitly requested.

## Cursor Cloud specific instructions

This is a single **Bun**-managed TanStack Start app (React 19 + Vite 8, SSR via Nitro).
There is no separate backend process — SSR server functions and API routes
(`src/routes/api/*`) run inside the same Vite/Nitro dev server. Standard commands live
in `README.md` and `package.json` scripts; the notes below are only the non-obvious
cloud caveats.

### Standard commands (see `package.json`)
- Dev server: `bun run dev` → serves on `http://localhost:8080` (see `vite.config.ts`).
- Lint / test / build: `bun run lint`, `bun test`, `bun run build`. Typecheck: `bunx tsc --noEmit`.

### Local Supabase backend (required for room create/join and Realtime)
The app cannot create/join rooms without a Supabase backend. This environment uses a
**local** Supabase stack (Docker) instead of a cloud project — the org's cloud projects
are unrelated apps / free-tier limited, so do not point `.env` at them.

- Docker is installed but **not auto-started** on boot. Start it once per session:
  `sudo nohup dockerd > /tmp/dockerd.log 2>&1 &` then `sudo chmod 666 /var/run/docker.sock`.
  (Docker 29 uses fuse-overlayfs + `containerd-snapshotter: false` in `/etc/docker/daemon.json`.)
- Start the Supabase stack from the repo root: `supabase start` (first run pulls images;
  migrations in `supabase/migrations/` are applied automatically). Local API is
  `http://127.0.0.1:54321`, Studio `http://127.0.0.1:54323`. `supabase status` prints keys.
- `.env` (gitignored) points at the local stack using Supabase's shared local-dev default
  keys. RLS policies are intentionally open, so anon insert/select on `rooms` works. If
  `.env` is missing, `cp .env.example .env` and fill `VITE_SUPABASE_URL` / `SUPABASE_URL`
  = `http://127.0.0.1:54321` and the anon/service keys from `supabase status`.

### AI features (optional)
The three games call an OpenAI-compatible API (`src/lib/ai-gateway.server.ts`). Room
create/join and lobby work without it; set `OPENAI_API_KEY` in `.env` to exercise
TTS/STT/vision/judging. No key is provisioned in this environment.

### Gotchas
- `bunfig.toml` sets `minimumReleaseAge = 86400`, so `bun install` skips dependency
  versions published in the last 24h.
- Use `bun` (not npm/yarn); only `bun.lock` is present.
