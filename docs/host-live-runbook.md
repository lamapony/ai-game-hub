# Host live runbook — one page

Use this for a real 8–30 person party. The host screen is the source of truth; never repair a live
room with SQL or by editing JSON state.

## 15 minutes before guests

- On the landing screen, the host taps **Host a party** to jump directly to setup. A guest whose QR
  failed taps **Join a party** to reach the room-code field without scrolling through host setup.
  The code is exactly four characters and never uses `I`, `O`, `0` or `1`; pasted spaces or hyphens
  are removed automatically. The Join button turns green only when the code is ready. If a guest
  opens a bad link, they correct the preserved code on that screen: **Room … is not live** means
  compare it with the host screen, while **Couldn’t check room …** means restore signal and press
  **Check again**. Do not restart the party or send them through host setup.
- A room has 30 player places. At **30/30**, a new phone sees **Room is full** and cannot create a
  31st identity. Before the first live cue, open **Players** and use **Remove** for a duplicate or
  inactive phone; the waiting screen unlocks as soon as the place is free. Never remove a real
  participant to repair a live game, and do not expect roster removal after the party has started.
- In quick start, add at most one public **Tonight's thread**: a harmless occasion, visible object
  or shared joke you would comfortably show to every guest. It is AI flavor, not a private note;
  never enter secrets, sensitive personal data or operational instructions. During the evening,
  note whether one game and the finale call it back naturally.
- From room creation to the opening cue, let the first-time host follow only the visible **Do this
  now** card. Do not point at controls unless they are stuck; record whether they understood the
  live check, opened the full-screen QR and started after the eighth join without prompting.
- Open the host link on the device that created the room. Keep that tab open and disable battery
  saver for the event.
- Open **Live safety → Backup host device**, copy the private link and open it on exactly one
  trusted backup phone or laptop. Confirm the full host screen appears and the address bar no
  longer contains `#host-access`. This link grants full control: never show it as a QR, paste it in
  group chat or include it in screenshots.
- Join with one iPhone/Safari and one Android/Chrome. Refresh both: the same name, team and room
  must return.
- Ask every joined player to tap **Check this phone** in the waiting screen. Camera/mic require
  HTTPS; the check keeps no recording. Use the host player list to help any phone marked `! media`
  before launch. An unchecked phone does not block the party, but should not be the only device
  available for a media round.
- If Soundscape uses extra phones or Bluetooth speakers, connect and test every speaker slot now.
- Confirm the host **Live safety** card says both `live` and **Live backend ready**. If it says
  **Backend setup required**, do not promise or launch the full scenario: apply the named release
  migrations/configuration first, then press **Retry**. Also confirm AI mode says `automatic` and
  choose an AI budget cap (120 credits is the default field-test baseline).
- In the conductor, press **Prepare AI now** for the next supported game. Wait for **AI ready** or
  **Fallback deck ready** before gathering guests; if the roster changes, prepare again.
- Confirm the cleanup bucket is private.
- After eight guests are connected and readiness is green, press **Start the party** once. Confirm
  **First cue live** appears with the opening instruction. If the button is disabled, fix the named
  readiness/backend check; do not bypass it by manually skipping the first moment.

## Normal operating rule

Lead the live opening cue, then press **Moment complete** in the conductor when it has actually
landed. Launch later acts and games only from the conductor. Wait for host state to update before a
second control. Late guests may join or switch teams from the waiting screen while the room has
fewer than 30 players; do not restart a room.

## 60-second emergency sequence

1. Press **Pause room**. Keep every browser tab open and read the four-letter room code aloud.
2. If AI or vision is slow, press **Use manual fallbacks**. New prompt calls skip the provider and
   use deterministic fallback cards; existing scores and private records remain intact. If STT
   times out, do not resend audio repeatedly: use the game's manual review/pass or skip the phase.
   If the AI budget is exhausted, keep it exhausted unless the event owner has explicitly approved a
   higher cap; deterministic fallbacks are the intended recovery.
3. Restore Wi-Fi or mobile data. Return to the host tab and press **Resync** once. Wait for `live`.
4. Continue the round, use **Skip phase**, or choose **Safe return to hub**. These are idempotent
   server commands and may be retried after a transient network failure.

Do not refresh while recording media. If a recorder permission was denied, open browser site
settings, allow camera/microphone, return to the same tab, and retry. If permission cannot be fixed in
one minute, skip that media phase and keep the score ledger.

## Failure table

| Symptom                            | Host action                                                     | What must remain intact                                          |
| ---------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| `offline` / `resyncing`            | Pause, restore network, Resync                                  | teams, score ledger, secret assignments                          |
| AI/STT timeout or invalid JSON     | Use manual fallbacks                                            | deterministic tasks; manual verdict where scoring needs judgment |
| AI budget at 100%                  | Keep fallback mode or select an approved higher preset          | no unbounded provider spend; score/records remain intact         |
| Prepared badge disappears          | Roster/context changed; press Prepare AI now again              | stale prepared payload must not be assigned                      |
| Supabase transient error           | Do not double-click; wait for retry, then Resync                | command idempotency prevents a duplicate host action             |
| Camera/mic denied                  | Fix site permission or skip the phase                           | no penalty for missing media caused by fallback                  |
| Player returns after backgrounding | Keep tab open; foregrounding triggers a fresh room fetch        | same player id, name and team                                    |
| Guest code is not live/unavailable | Correct it in place, or restore signal and press Check again    | live host room and every joined player remain unchanged          |
| Guest sees `30/30 Room is full`    | Before first cue, remove only a duplicate/inactive phone        | existing identities, teams and score ledger remain unchanged     |
| Host device is unusable            | Open the pre-verified private link on the trusted backup device | same live state; credential disappears from its address bar      |

## After the party

- Finish through **Party finale** and photograph/export the visible standings if desired.
- Before pressing **New party**, open **Live safety → Field-test report**. Choose the actual event
  date in the date picker and fill venue/location, host device, network notes, observed provider
  cost, prepared-deck wait and failures; choose
  **Physical phones**, **None** for SQL/state edits and secret exposure only when those statements
  are true, mark **Backup host handoff: verified** only after the trusted second device passed,
  classify host experience/autonomy and the visible launch-signal result, confirm the plain
  **Observed automatically** line contains at least `INVITE. then START.`, record game/finale story
  callbacks and story safety, confirm the 2/3/4-hour pacing review, and choose PASS/FAIL. The
  **Real-device recovery drills** section must record the actual result of host network switching,
  backup takeover after the primary host is powered off, player background/resume, host refresh in
  both lobby and live play, late joining in every act, lobby team switching and camera/microphone
  permission recovery. Mark a drill **Passed on devices** only after triggering that exact fault.
  The **Physical PASS evidence** card must say `26/26 declarations ready` before a PASS export; follow
  its single next action until it does. The UI blocks an incomplete PASS, while pending/FAIL remain
  downloadable for honest incomplete evidence. Any AI failure, blocked operation or manual fallback
  needs a short failure note. Wait for **Private draft saved** before closing the tab or pressing
  **New party**. Refreshing this host or opening the already verified backup-host link restores the
  current run's private draft; players cannot read it. A new party deliberately starts with a blank
  report.
  Download both `.md` and `.json`. The export records server times for the eighth join, first live
  cue and finale plus device, AI and score-ledger aggregates. If ledger detail is unavailable, the
  export says so and the evening cannot close the score-integrity gate.
- Record whether a public **Tonight's thread** was configured, but do not copy its text into the
  report. Classify the first natural in-game callback, the finale callback and any case where the
  model appeared to follow instruction-like text inside it. Any such execution or safety weakening
  is a failed field gate.
- Review the free-text notes before sharing. Automatic report fields exclude participant/team
  names and ids, private assignments, transcripts, media, score reasons/rubrics and auth secrets.
- After the four settings and 120/180/240-minute coverage have been collected across at least two
  evenings, run:

  ```bash
  bun run verify:field-reports reports/*.json
  ```

  A release candidate passes only when this command prints `Field report release gate: PASS`. It
  rejects automated runs, duplicate room codes, fewer than two distinct structured event dates,
  missing settings/durations, launch over 120
  seconds, incomplete device/backend evidence, ledger drift, unsafe privacy flags and missing
  declarations, including a verified backup host device. Schema v5 also requires an automatic
  `INVITE.` → `START.` launch sequence, all seven structured real-device recovery drills,
  independent launch-signal use in every run, at least one
  first-time host, a safe Tonight's-thread callback in every game and finale, and never exports the
  thread text. It recommends the smallest 60/120/240 credit preset with 20% headroom from
  same-currency observed provider costs.

- Run the protected cleanup workflow first in dry-run, then live after the retention window.
- Record device/browser/network failures in the field-test log. Release 7 closes only after two full
  evenings with no manual SQL/state repair and no lost score or secret data.
