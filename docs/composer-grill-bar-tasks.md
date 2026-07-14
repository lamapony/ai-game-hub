# Composer Tasks — Grill + Bar Party Upgrade

> **Historical task list.** For the current repository state and implementation order, use
> `docs/conceptual-development-plan.md`. This file was written before the seventh game, finale,
> venue mode and server hardening landed; do not extend the current RoomState/route switch pattern
> eight more times.

Master spec: `docs/grill-bar-party-upgrade.md`

**Important adaptation notes for this codebase:**
- The original spec was written for a simple standalone `park-ai-games.html`.
- Current architecture: TanStack Start + Supabase + per-game folders in `src/games/`.
- Each game has: HostView.tsx, PlayerView.tsx (and often Recorder.tsx, Orchestra.tsx for soundscape).
- State is managed via Supabase realtime + game-state.ts / host-controls.ts.
- New games or phases should follow the existing pattern (see soundscape/ and challenge/ as reference).
- Add new games to `src/lib/game-rules.ts` (GAME_IDS and GAME_RULES).
- Phases (grill/bar) can be implemented as:
  - A top-level party phase selector (similar to current game selection).
  - Or per-game context injection (like the spec's `withPhaseContext`).
  - Environment context should be passed into AI prompts (Supabase edge functions or server routes for judging).

**Priority order for agents (atomic):**

## Phase 1 — Foundation (do first)
1. Add party phase system (grill / bar / classic) in UI and state.
   - Create simple phase selector in host UI.
   - Store currentPhase in local state + persist if needed.
   - Add phase context to game rules or a central config.
2. Update GAME_RULES and add phase tags where relevant.
3. Adapt the 4 existing "classic" concepts if they map (soundscape, challenge, phototunt) with phase-specific prompts.

## Phase 2 — Core New Games (implement 1 by 1)
Implement as new entries in `src/games/` following existing structure.

Priority games from spec (adapted):
- Гриль-Оракул (Grill Oracle) — vision + prophecy that carries to bar verification.
- Щипцы Правды (Tongs of Truth) — audio + lie detection during "cooking".
- Дымовая Завеса (Smoke Screen) — secret missions + deduction reveal.
- Натюрморт: Выживание (Still Life Survival) — creative food installation.
- Синдикат Тостов (Toast Syndicate) — audio toasts with contraband words.
- Сомелье-Шарлатан (Sommelier Charlatan) — vision drink analysis + psychoportrait guessing.
- Контрабанда (Contraband) — background phrase smuggling in conversation.
- Перекрёстный Допрос (Cross Examination) — finale comparing grill stories.

For each:
- Add to GAME_IDS and GAME_RULES (with phase tags).
- Create `src/games/[slug]/` with HostView, PlayerView (and Recorder if audio).
- Implement AI prompts using the exact schemas and few-shots from section 3 of the spec.
- Use existing Supabase patterns for artifacts, transcripts, votes.
- Add mock first, then real calls (follow patterns in lib/player-media.server.ts etc.).

## Phase 3 — Integration & Polish
- Leaderboard with phase tags and special titles (Королева Гриля etc.).
- Transition ritual UI between phases.
- Rain fallback mode (bar-only).
- Update host flow / party setup to choose or auto-detect phase.
- End-of-party title ceremony.

## Prompt Work
- All AI prompts must follow the base + phase context + few-shot style from the spec.
- Keep scoring: base + creativity + humor + "use of environment" bonus.
- Winners often decided by players (voting), AI only for comedy/judgment.

**Execution rules for Composer agents:**
- Work one task / one game at a time.
- After changes: `bun run lint`, typecheck, and manual smoke if possible.
- Reference the exact JSON schemas in the spec.
- Do not delete or break existing games.
- Add comments in code: `// From grill-bar-party-upgrade.md section X.Y`

Start with Phase 1 foundation. Report status after each atomic piece.
