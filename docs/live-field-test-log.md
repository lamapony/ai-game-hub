# Release 7 field-test log

Copy the **Evening record** section once per full event. Release 7 passes only after two records are
complete with no manual SQL/JSON repair and no lost score or secret data.

## Programmatic preflight (required, not a substitute for physical devices)

- [x] `bun run test:rehearsal` passes all 24 routes: park/bar/home/festival × 120/180/240 minutes ×
      8/30 players.
- [x] Every scripted game is launchable in its selected act, every route step is recorded once and
      each route reaches a completed finale.
- [x] Every timed route moment is begun separately, receives one server timestamp and clears its
      active cue on completion across all 24 deterministic rehearsals.
- [x] Every rehearsal produces a strict schema-valid grounded finale fallback. Routes containing
      Soundscape prove that an early public clue survives later foreground launches into the finale;
      interlude rendering calls the latest stored clue back to the host. Unit coverage proves that
      hub cleanup, next-game launch and finish all preserve the public sequence, two host requests
      share one lease, stale full-state writes preserve the server epilogue, and
      transcript/media/private-word sentinels never enter the evidence or rendered pending UI.
- [x] Local `UJ2K` and production `ATDJ` prove that one bounded public Soundscape reveal survives
      JSONB round-trip and enters the next Challenge, Photo Hunt and Who Among Us prompt context
      before returning as the same host/player finale callback. The prompt block is quoted untrusted
      data, omits internal ids/private artifacts and permits at most one natural callback. Both rooms
      were removed. This proves transport and prompt grounding only; people must still judge whether
      the callback lands naturally during the physical evenings below.
- [x] Host room convergence is revision-ordered rather than arrival-ordered. REST and realtime
      carry `rooms.updated_at`; `/api/host-command` returns the committed CAS revision; older,
      equal and unversioned-after-versioned snapshots cannot overwrite the host's locally applied
      command result. Browser journey now rejects any **Back to hub** response without a valid
      committed revision. Local `RFDW` and production `8GYE` completed the eight-player connected
      route in 11.615 / 21.927 seconds readiness and were removed exactly. Production deployment
      `dpl_BFEJtCNWx6MGFFx4gAtyTQWtmzRA` is `READY`; rollback is
      `dpl_HkvpXacVQFh9mNGhUEq2q5vTiTiA`. This is automated ordering evidence only; real network
      switching and background/resume still require the physical device matrix below.
- [x] Smoke reveal, Oracle verification and compact Tongs finish through their real lifecycle state
      transitions rather than relaunching the game.
- [x] Local system-Chrome matrix verifies park/bar/home/festival, all 120/180/240-minute controls
      and both 8/30-player boundaries. Readiness: 8.10 / 6.11 / 6.16 / 18.55 seconds; every exact
      room is removed in `finally`.
- [x] Local resilience smoke verifies host/player refresh, stable player identity through team
      switch, host/player `offline → live`, late ninth-player roster update and refresh. It then
      launches the first foreground route game and preserves one server-persisted provider topic
      set through launch-time refresh, pause/resume and a second network fault without fallback or
      a second provider request. It accepts a tenth player during the active round and returns to
      the next route step without replay. This is programmatic evidence only; the physical
      network/device rows below remain required.
- [x] Ready-backend browser smoke after all three migrations created `TGZN`, joined eight isolated
      players, reached green readiness in 14.801 seconds, pressed **Start the party**, observed the
      persisted `park-arrival-120` cue and removed exactly that room. The historical degraded smoke
      kept the same control disabled before migration.
- [x] Local fake-device media smoke verifies Soundscape microphone deny → retry guidance → grant →
      retry → real audio blob upload, then Challenge camera+microphone deny → grant → retry → video
      preview on the same operator identity. Photo Hunt then receives a native capture-input image,
      downscales it to JPEG, uploads it and records the artifact before advancing the route. The
      exact room is removed. This is programmatic evidence only; physical rows remain required.
- [x] Lobby phone preflight stores only camera/mic status through an authenticated player action;
      host sees checked/ready/blocked counts. Automated deny → grant → retry reaches host realtime
      and survives player refresh without changing identity. Real phones are still required below.
- [x] Authenticated release-health preflight checks private memory, score ledger, private media
      storage and AI configuration without returning raw backend errors. The current linked remote
      returns `READY` for all four checks. Historical smoke `PPSY` (removed in `finally`) proved the
      inverse gate before migration: `program-ready=true`, `ready=false`, visible backend guidance
      and a disabled **Start the party** control.
- [x] Local and GitHub production deploy paths run the same strict read-only backend verifier before
      build. The authorized 2026-07-16 audit exits `0` with private memory, score ledger, private
      storage and AI runtime all passing; unit tests still cover the degraded inverse contract.
- [x] Applied and verified remote migrations `20260715143000` (private party records) and
      `20260715151500` (score event ledger), plus `20260716120000` (restore/private recordings
      bucket and remove legacy anon policies). `supabase migration list` shows matching local and
      remote versions for all three; backend health and the first-cue browser flow pass afterward.
- [x] 2026-07-17 production deployment `dpl_7r8KHTs1bjZFZbYwN5innr721aZa` is `Ready` behind the
      public alias and returns HTTP 200. A remote ready-backend smoke created `JFN9`, joined eight
      isolated players, reached green readiness in 7.742 seconds, persisted `park-arrival-120`
      after **Start the party** and removed exactly that room. Backend verification stayed `READY`
      and the migration dry-run stayed up to date. This is still programmatic evidence only.
- [x] Host **Field-test report** exports `.md` and `.json` from the live room without a developer.
      Server-authoritative first-cue and finale timestamps survive cue completion; the report also
      derives the eighth join, aggregates device readiness, credits/tokens/provider failures,
      manual-fallback activations/time, prepared readiness and score-ledger integrity. Sentinel
      tests prove automatic output omits names/ids, assignments, transcripts/media, score
      reasons/rubrics, AI operation/cache keys and finale evidence text. Physical evidence is still
      required below.
- [x] Production deployment `dpl_4eFeLjomgPRifybzdpWHe6ZZwdVV` is `Ready` and HTTP 200. Remote
      smoke `D39M` joined eight isolated players, reached green readiness in 11.317 seconds,
      persisted `park-arrival-120`, downloaded the JSON through the visible host UI, verified its
      server start/roster/ledger fields and privacy flags, rejected any test-player-name exposure,
      then removed exactly that room. Previous deployment `dpl_7r8KHTs1bjZFZbYwN5innr721aZa` is
      the rollback target. This is still automated, not a physical evening.
- [x] Field-report schema v2 distinguishes physical, automated and unclassified evidence and adds
      explicit no-SQL-repair, no-secret-incident and pacing-reviewed declarations. The strict
      verifier rejects synthetic evidence as a release proof, requires park/bar/home/festival and
      120/180/240 coverage across at least two event labels, reconciles the full score ledger,
      checks the privacy boundary and calibrates 60/120/240 caps from same-currency observed cost.
      Run it with `bun run verify:field-reports <report-1.json> ...`; programmatic tests cover both
      PASS and deliberately broken evidence.
- [x] Final schema-v2 production deployment `dpl_7Ezmm4NXvsZcJS832WArGoNC8bnE` is `Ready` and
      HTTP 200. Remote smoke `7ZRS` joined eight isolated players, reached green readiness in
      11.724 seconds, persisted `park-arrival-180`, downloaded the report through the host UI and
      required schema v2 plus `runKind=automated`, ledger availability and the privacy boundary. It
      rejected player-name exposure and removed exactly `7ZRS`. Backend preflight remains `READY`,
      remote migrations are up to date and `dpl_581XduQd7eMn58BJ59Ae78wnatqF` is the nearest
      rollback. This remains programmatic evidence, not a physical evening.
- [x] Final local host-handoff smoke `AMHE` copied the private backup link through the visible Live
      safety control, opened it in a fresh browser context with empty storage, passed the auth-only
      server check, rendered the same host room and removed the credential fragment from the
      address bar. The original host then joined eight isolated players, reached readiness in
      14.811 seconds, persisted `park-arrival-180`, downloaded the privacy-safe report with verified
      handoff evidence and removed exactly `AMHE`. Unit tests require fragment-only transport,
      duplicate/invalid fragment
      rejection, safe 403 guidance, verified storage and a cryptographic 192-bit secret for new
      rooms. A physical backup device is still required below.
- [x] Current private-host-handoff production deployment `dpl_7fACe6oTsTpixZHGMfqvxvAP9hKR` is
      `Ready` and HTTP 200. Remote smoke `TTNF` copied the real Live safety backup link, opened it
      in a fresh storage-isolated browser, passed the auth-only check, rendered the same host room
      and removed the credential fragment. It then joined eight isolated players, reached green
      readiness in 12.368 seconds, persisted `park-arrival-180`, downloaded schema-v2 evidence with
      `hostHandoff=verified` and removed exactly `TTNF`. Backend preflight is `READY`, remote
      migrations are up to date and `dpl_7Ezmm4NXvsZcJS832WArGoNC8bnE` is the nearest rollback.
      This is still programmatic evidence; the physical backup-device gate remains open.
- [x] Full current production matrix proves the automated range on the same deployment:
      `park/120/8` room `RML8` reached readiness in 10.236 seconds, `bar/180/8` room `WZHU` in
      8.602 seconds, `home/240/8` room `VVHU` in 8.570 seconds and `festival/180/30` room `E74R` in
      16.141 seconds. Every scenario used a fresh isolated backup-host browser, persisted its first
      route cue, downloaded privacy-safe schema-v2 evidence with `runKind=automated` and
      `hostHandoff=verified`, and removed exactly its own room. The matching local matrix also
      passed in 11.808 / 7.401 / 7.150 / 17.968 seconds. This closes the programmatic 8–30 and
      120/180/240 coverage gap, but not the physical-device or real-duration evidence below.
- [x] Player-action contention hardening is live on deployment
      `dpl_kma1Sr5tQtFGxMt7vk3WXisbandn`. A leak-safe per-room queue serializes mutations already
      sharing one server runtime while the existing optimistic CAS remains authoritative between
      Vercel instances; different rooms still execute in parallel and a failed action releases the
      next waiter. Local festival room `UJDY` joined 30 isolated players with 30/30
      `attempts=1`, no write conflicts and a 4.297-second maximum queue wait. The current
      production matrix passed `KJ3H` park/120/8 in 10.219 seconds, `N5WA` bar/180/8 in 8.556,
      `4W3Y` home/240/8 in 8.488 and `JX8Y` festival/180/30 in 49.093; every room completed
      handoff/cue/report/exact-cleanup. Runtime evidence for `JX8Y` contains 30 unique successful
      joins in 5.822 seconds, maximum queue wait 5.582 seconds and maximum eight CAS attempts,
      down from 15 on the previous production deployment. The browser clock includes creation of
      30 isolated Chrome contexts; it remains below the 120-second launch gate.
- [x] Full-route connected-finale browser gate is live on deployment
      `dpl_3NmjDyT79SpqnBNe7XgEfgPoSpuw`; previous verified production
      `dpl_kma1Sr5tQtFGxMt7vk3WXisbandn` is the rollback target. Local room `ALGK` and production
      room `WT8V` each joined eight isolated players, started `park-arrival-120`, completed six
      pre-finale route steps through Soundscape → Challenge → Photo Hunt → Who Among Us, opened the
      separate finale act and finished with zero score without blocking the host. Both host and
      player finale returned the same early Soundscape evidence id; `WT8V` reached readiness in
      12.920 seconds and was deleted exactly. Production runtime logs show the deliberately fast
      route safely skipped late guarded Challenge and Photo Hunt AI writes after the active game had
      advanced, with no deployment 500s. This is automated rehearsal evidence, not a physical
      two-hour party or a substitute for the device matrix below.
- [x] Self-serve host brief is derived from the selected route and game capabilities before room
      creation, then persists beside host readiness after the QR appears. Unit coverage checks all
      12 venue/duration combinations. The setup-only Chrome matrix passed park/bar/home/festival
      representative routes and removed rooms `PTBJ`, `44L4`, `J5C4` and `BFUG`; desktop and iPhone
      screenshots keep the launch CTA readable. Production deployment
      `dpl_ERu9s4Mog85zm3tditfjDQZa6Avt` is `Ready`; the remote matrix repeated the contract and
      removed `PZNG`, `NMHN`, `Q3TL`, `YP7R`. A first-time physical host must still prove that the
      in-product brief is sufficient without this runbook or a developer.
- [x] Party story seed accepts one optional public detail, normalizes and limits it to 160
      characters, persists it from landing to host readiness and passes it to every party-mode AI
      prompt as JSON-quoted untrusted flavor after an explicit injection boundary. Local rooms
      `ZXWL`, `8VTN`, `AFAB`, `4VDX` and production rooms `Q7H2`, `RQWM`, `UKRM`, `VU7N` passed the
      four-setting setup matrix and were deleted exactly. Physical evenings must still prove one
      natural callback in a game and the finale, with no instruction-following or safety regression.
- [x] First-time-host launch model maps program mismatch, backend checking/failure, over-capacity,
      fewer than eight guests and live readiness to exactly one visible launch signal: **REBUILD.**,
      **CHECK.**, **FIX.**, **REDUCE.**, **INVITE.** or **START.** Local rooms `9XDZ`,
      `QEHA`, `KD7V`, `F3SV`, `W4HY` and production rooms `7CEG`, `BF7K`, `LTH7`, `XH98`, `9B3K`
      covered QR, eight-player unlock and persisted first cue, then were deleted exactly. Physical
      evidence must still show that a new host follows it without this runbook or developer help.
- [x] Field-report schema v3 records bounded first-time-host/autonomy/coach and game/finale/safety
      declarations while exporting only `storySeedConfigured`, never the seed text. The strict
      audit requires independent launch-signal use in every physical report, at least one first-time host
      and safe callbacks in every setting; v2, unknown, prompted, misunderstood, missing callbacks
      and safety concerns fail. Local `JTRC` and production `725Q` passed real UI downloads and were
      deleted exactly on deployment `dpl_F3UrHatZsYvwfBzHvznZPSUjmkju`.
- [x] Self-serve field evidence coach records a validated `YYYY-MM-DD` event date, counts 18
      required PASS declarations and exposes exactly one next action. An incomplete PASS export is
      blocked while pending/FAIL remain downloadable. The audit now requires two distinct event
      dates instead of trusting free-text labels. Local `8KFF` and production `4RDQ` passed the
      block/download/privacy/cleanup flow; `4RDQ` reached readiness in 12.066 seconds on deployment
      `dpl_GdZarBcWP5T3vjovmsgNo5hgQCq4`.
- [x] The first mobile viewport separates **Host a party** → two-minute setup from **Join a party**
      → room-code fallback, so guests no longer scroll through the full host form. Browser smoke
      clicks both paths before room creation. 390×844 visual QA passed; local `MUVQ` and production
      `59BL` completed eight joins, first cue, report and exact cleanup, with production readiness
      at 13.505 seconds on deployment `dpl_pYvWNdny3WNMdVLQbn55qr3iVnoS`.
- [x] Guest room codes use one four-character alphabet across generation, root and `/play`.
      Ambiguous `I/O/0/1`, incomplete input and submit stay blocked; pasted spaces/hyphens are
      normalized before validation; Enter/Go works and `/play` autofocuses. Browser smoke proves
      `O0I1` stays disabled and `a-b c d` becomes `ABCD`. Local `ZQ8T` and production `2EAD`
      completed eight joins, first cue, report and exact cleanup, with production readiness at
      13.747 seconds on deployment `dpl_6Re3EkJeZD1VCBo21SHgTtgv2iF3`.
- [x] Guest room recovery distinguishes an invalid direct link, a room that is no longer live and
      a temporary lookup/network failure. The guest edits or retries the preserved code in place;
      five-character input cannot pass through truncation. Browser smoke opens `/play/O0I1` before
      room creation and proves `a-b c d → ABCD`; 390×844 QA covered invalid, deleted-room, offline
      retry and restored network. Production `BRSM` completed eight joins, first cue, report and
      exact cleanup with readiness at 15.604 seconds on deployment
      `dpl_GR6xb9fg7fESkubwbqvoucb7jnCt`.
- [x] One shared 8–30 room-capacity contract blocks a new 31st identity with HTTP 409 while an
      existing player can rejoin at 30/30. The guest sees a dedicated full-room recovery screen;
      the host can remove a duplicate or inactive phone only in the lobby before the first cue.
      Mobile 390×844 and desktop roster QA passed. Local `R2FH` completed 30 joins, overflow,
      first cue, report and cleanup in 26.437 seconds readiness. An initial production `F2ZU`
      exposed Vercel's automation checkpoint when all 30 Playwright POSTs fired simultaneously;
      the smoke now joins in fast batches of four. Production `9Z54` then proved 30 joins, UI and
      direct-server 31st rejection, cue `festival-rally-180`, report and exact cleanup with
      readiness at 86.452 seconds on deployment `dpl_Eq4PGx17o75ZmJgQwPkGzeXQLgDm`.
- [x] Field-report observations persist as one bounded host-only draft for the current quick-start
      run. They never enter public room state, realtime or player responses; a new party gets a new
      identity. Local `ZQNS` and production `DCUT` waited for the actual save, reloaded the primary
      host, recovered the same values on an isolated backup host, downloaded the privacy-safe report
      and removed the exact rooms. Readiness was 13.176 / 23.372 seconds. Production deployment
      `dpl_5CvFoV599PtuJJJywctxJu4dWmE5` is `Ready`; rollback is
      `dpl_Eq4PGx17o75ZmJgQwPkGzeXQLgDm`. This protects evidence collection, but still does not
      substitute for two physical evenings.
- [x] Field-report schema v4 moves seven physical reliability claims out of free-form Markdown:
      host Wi-Fi/mobile recovery, powered-off-primary backup takeover, player background/resume,
      host refresh in lobby and live play, late joining across acts, team-switch identity/ledger
      integrity and camera/microphone permission recovery. Each exports only
      `not-tested`/`passed`/`failed`; a physical PASS needs all seven `passed`. The aggregate verifier
      rejects v1–v3 and any v4 report missing the exact object. Draft v2 accepts and migrates an
      existing v1 host-only draft with all drills set honestly to `not-tested`.
- [x] Field-report schema v5 records the first-seen, privacy-safe launch-signal sequence
      automatically on the host device. Private draft v3 migrates v1/v2 drafts without inventing
      evidence and monotonically merges signals from primary and backup hosts. A physical PASS now
      needs both `INVITE.` and `START.` plus the human classification that every visible signal was
      followed without prompting; the aggregate verifier reports automatic sequence evidence as a
      separate gate.

## Device matrix

Record at least 8 and preferably 12 physical phones.

| Device    | OS/browser       | Network start | Camera | Mic | Background/resume | Wi-Fi ↔ mobile | Result/notes |
| --------- | ---------------- | ------------- | ------ | --- | ----------------- | -------------- | ------------ |
| Host      |                  |               | n/a    | n/a |                   |                |              |
| Player 1  | iOS / Safari     |               |        |     |                   |                |              |
| Player 2  | Android / Chrome |               |        |     |                   |                |              |
| Player 3  |                  |               |        |     |                   |                |              |
| Player 4  |                  |               |        |     |                   |                |              |
| Player 5  |                  |               |        |     |                   |                |              |
| Player 6  |                  |               |        |     |                   |                |              |
| Player 7  |                  |               |        |     |                   |                |              |
| Player 8  |                  |               |        |     |                   |                |              |
| Player 9  |                  |               |        |     |                   |                |              |
| Player 10 |                  |               |        |     |                   |                |              |

## Required fault injections

| Scenario                                   | Expected recovery                                                 | Pass/evidence |
| ------------------------------------------ | ----------------------------------------------------------------- | ------------- |
| Host Wi-Fi off, then mobile data           | `offline` → Resync → `live`; same score/players                   |               |
| Original host device powered off           | trusted backup link opens same host state; fragment is gone       |               |
| Player backgrounded for 2+ minutes         | foreground fetch restores current phase and identity              |               |
| Host refresh during lobby and active game  | host authorization and active state return                        |               |
| Long 32-character name                     | layout stays usable on host/player                                |               |
| Late join during each act                  | joins waiting screen; existing secret assignments stay unchanged  |               |
| Team switch in lobby                       | identity stays stable; score ledger does not move or reset        |               |
| Camera denied, then allowed                | clear error; retry succeeds without a new player                  |               |
| Microphone denied, then allowed            | clear error; retry or phase skip succeeds                         |               |
| Manual AI mode                             | no provider wait; fallback is visibly marked                      |               |
| Invalid vision JSON                        | schema fallback/manual review; no model-authored score trusted    |               |
| Invalid finale JSON / invented evidence id | deterministic epilogue fallback; podium and ledger remain usable  |               |
| STT timeout                                | host can review/pass/skip; no automatic penalty                   |               |
| Supabase transient during host action      | same command retries once; action is not duplicated               |               |
| Signed media link after 6 hours            | link expired; room cleanup later removes object                   |               |
| AI budget reaches configured cap           | no new provider call; visible deterministic/manual fallback       |               |
| Prepare AI, then launch matching game      | prepared deck is consumed; launch has no generation wait          |               |
| Prepare AI, then change the roster         | ready badge clears; stale private payload is never assigned       |               |
| Quick start: room → 8 joined → Start       | green within 120s; first cue persists; no state/SQL repair        |               |
| Repeat quick start for four settings       | park/bar/home/festival load matching environment and first moment |               |
| Run 2h / 3h / 4h route selection           | conductor shows 120/180/240 minutes and never repeats done steps  |               |

## Evening record

Attach the downloaded `ai-game-hub-field-<room>-<date>.md` and `.json`. Copy the automatic values
below; do not replace physical observations with the report. Before a PASS export, confirm the
in-product **Physical PASS evidence** card says `26/26 declarations ready`; follow its single next
action until it does. Pending/FAIL exports are intentionally allowed for incomplete evidence.

- Event date from the report date picker (`YYYY-MM-DD`):
- Venue/location:
- Evidence kind: **physical**
- Field report filenames:
- Room code (do not record host/player secrets):
- Host device/browser:
- First-time host? Could they choose and prepare the route using only the in-product brief?:
- Backup host device/browser and verified handoff:
- Number of players/devices:
- Experience/contingency:
- Quick-start setting / promised duration / expected players:
- Tonight's thread configured? yes/no (do not copy its text into the report):
- Natural callback observed in which game / exact moment:
- Finale callback observed / any instruction-following or safety issue:
- Seconds from room creation to eighth join / first live cue:
- Server start/end time / actual duration:
- AI budget cap / credits used / provider requests / tokens:
- Prepared games and measured launch wait before/after preparation:
- Estimated provider cost from dashboard telemetry:
- Manual AI mode used? Why and for how long?
- SQL/state edits performed: **must be none**
- Score ledger before finale / at finale:
- Secret-record checks (Oracle, Smoke, Contraband, Tongs, Cross):
- Cleanup dry-run result after retention window:
- Failures with timestamp, device and reproduction:
- Outcome: PASS / FAIL (leave pending or choose FAIL until the in-product evidence card is 26/26)

After all records are attached, run the machine gate over every JSON export:

```bash
bun run verify:field-reports reports/*.json
```

Keep the full PASS output and its budget recommendation with the release record. `--json` emits a
machine-readable audit for CI or archiving. A schema-v1/v2, automated or incomplete report is
expected to fail.

## Release gate

- [ ] Evening 1 passed with 8–12 phones.
- [ ] Evening 2 passed with 8–12 phones.
- [ ] Evening 1 and Evening 2 reports contain two distinct structured event dates.
- [ ] Both evenings have matching `.md` and `.json` field reports with ledger detail available.
- [ ] No manual SQL or room-state editing.
- [ ] No lost or duplicated score events.
- [ ] No secret assignment exposed to another player or client bundle.
- [ ] A trusted backup host device opened the private link, retained control after the original host was powered off and showed no credential fragment.
- [ ] 60/120/240 credit presets are calibrated against observed provider cost; chosen production cap is recorded.
- [ ] Prepared payload removes the next-game generation wait and never survives an incompatible roster/context.
- [ ] A first-time host selected, prepared and launched the route from the in-product brief without
      opening this runbook or asking a developer.
- [ ] The first-time host followed each visible launch signal without being told where
      to click, correctly explained why start was locked and needed no hidden disabled control;
      the report captured at least `INVITE. then START.` automatically.
- [ ] In every physical report a harmless **Tonight's thread** callback landed naturally in a game
      and again in the finale; embedded instruction-like text was never followed and did not weaken
      safety.
- [ ] At least one run of each park/bar/home/festival quick-start setting passed.
- [ ] The 120/180/240-minute routes were pacing-reviewed; completed steps never reappeared.
- [ ] `bun run verify:field-reports ...` passes all attached schema-v5 JSON reports, including the
      automatic launch sequence, two-date, host-autonomy, story-continuity and seven
      physical-recovery checks, and its
      recommended production cap is recorded.
