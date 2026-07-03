# Ready-to-paste prompt for Composer 2.5 / Cursor Composer

Copy everything below this line and paste into your Composer agent.

---

You are working on the AI Game Hub project (TanStack Start + Supabase spatial audio party games).

**Your mission:** Implement the Grill + Bar Party Upgrade so the app supports the new party format (outdoor grill at Grønningen Nordvest + indoor bar at Viggos Bar).

**Master documents (read them in this order):**
1. AGENTS.md (full file)
2. docs/composer-grill-bar-tasks.md
3. docs/grill-bar-party-upgrade.md (this is the complete creative spec from Fable 5)

**Critical adaptation:**
The spec was originally written for a simple standalone HTML. 
The real project uses:
- src/games/[game-id]/ with HostView.tsx + PlayerView.tsx
- Central configuration in src/lib/game-rules.ts (GAME_IDS, GAME_RULES)
- Supabase for room state, artifacts, realtime, storage, transcripts
- Existing advanced reference: src/games/soundscape/

**Non-negotiable rules:**
- NOTHING is removed. All existing 6 games must remain fully functional.
- Only add and adapt.
- Environment must be the hero (fire/smoke/tongs/meat for grill vs glasses/light/toasts/confessions for bar).
- Tone: adult, sharp, slightly sarcastic, educated. No corporate fluff.
- All AI prompts must follow the exact style, JSON schemas, few-shot examples, and "+5 for using the environment" rubric from section 3 of the spec.
- Winners are decided by players (voting) or deterministic logic. AI only provides comedy, judgment, and arbitration.

**Work strictly atomically:**
- Follow the exact priority in docs/composer-grill-bar-tasks.md
- Start with Phase 1: Foundation (party phase system)
- Then implement one new game at a time
- After every meaningful change: run `bun run lint && bunx tsc --noEmit`
- Add comments like: // Adapted from grill-bar-party-upgrade.md section 2.1

**Phase system requirements (from spec section 1):**
- PARTY_PHASES object with classic / grill / bar
- Phase context that can be injected into AI prompts (adapt withPhaseContext idea)
- UI phase switcher (host side)
- Phase-aware game cards and rules
- Leaderboard entries tagged with phase + special end-of-party titles (Королева Гриля 🔥, Легенда Бара 🍸, MVP)

**Output expectations:**
- Clean, working React/TSX components following existing patterns
- New games added as full folders in src/games/ (with HostView + PlayerView)
- Updates to game-rules.ts
- Prompts either in code comments or a shared prompts file, matching the spec exactly
- Backward compatible for classic mode

Begin immediately with Phase 1 foundation. Report progress after each atomic step.

Do not ask for clarification — use the documents.

---

End of prompt. Paste the block above into Composer.