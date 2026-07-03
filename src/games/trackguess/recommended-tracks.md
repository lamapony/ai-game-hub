# Recommended Tracks for TrackGuess (Real or AI)

Goal: Make the game hard and interesting. 
AI tracks must sound human. 
Real tracks must have cool, impressive executions or sound strangely perfect/AI-like.

## How to add tracks

1. **Best way (recommended)**: Use the in-game **TrackVault** (in HostView during briefing). 
   Add Custom Real Tracks with direct .mp3 URL + metadata.

2. For permanent catalog: edit `catalog.ts` and set `isAi: true/false`.

**Important**: The audio must be a direct playable URL (https://... .mp3). Spotify links are only for labeling, not playback.

## AI tracks that sound extremely real (generate these)

Use Suno.ai or Udio.com. Use these prompts (copy-paste):

### Prompt 1 — Intimate Bar Ballad (perfect for Viggos Bar phase)
"Raw male vocal, acoustic guitar, subtle upright bass, late night bar in Copenhagen, slightly raspy voice, natural breathing and room reverb, emotional but understated, real human recording, warm analog, no AI artifacts, high quality"

### Prompt 2 — Soulful Female, Grill Night
"Soulful female singer with natural vibrato, fingerpicked acoustic guitar, soft percussion, summer evening at outdoor grill, honest emotion, slight imperfections in timing, like a real artist performing live for friends, detailed realistic vocals, intimate"

### Prompt 3 — Blues with Grit
"Gravelly male blues voice, slide guitar and harmonica, rainy evening, authentic grit and soul, real performance feel, imperfect but powerful, recorded on old equipment but clear, no synthetic sound"

### Prompt 4 — Indie Folk Duet (hard to tell)
"Soft male and female duet vocals, acoustic guitar and light piano, melancholic indie folk about memories, very natural voices with real harmonies, breath sounds, like a small living room recording, extremely realistic production"

### Prompt 5 — Jazz Bar Standard feel
"Crooner style male vocal with light jazz band, double bass, brushes on drums, sophisticated but relaxed, 1950s bar vibe but modern recording, real singer, warm and human"

After generating in Suno:
- Download the best version (preferably the one with better vocal take)
- Host the mp3 somewhere public (temporary file host, or your own server)
- Add via custom tracks in the game or to catalog with `isAi: true`

## Real tracks that sound AI / hyper-real (hard examples)

Look for these characteristics:
- Extremely clean production
- Perfect pitch and timing
- Slightly uncanny or "too good" vocals
- Heavy processing that makes voice sound synthetic

Suggestions to search for:
- Hyperpop tracks (Charli XCX style productions)
- Very polished modern indie with heavy auto-tune or effects
- Some lo-fi beats with too-perfect vocals
- Certain viral "bedroom pop" that are suspiciously clean

Specific artists/styles to explore for "real but AI-like":
- Some tracks by artists who heavily use production (e.g. certain Grimes, or modern pop)
- Live recordings that are too perfect

## Cool real executions (impressive performances)

These make great "Real" examples because the performance itself is the star:

- Great live acoustic versions (search "live acoustic" + artist)
- A cappella performances (Pentatonix style or solo vocal)
- Virtuoso instrumental (guitar, piano) with emotion
- Raw emotional vocal takes (e.g. famous live versions)

Examples of impressive styles to hunt:
- Emotional live ballads
- Unplugged sessions
- One-take recordings
- Street performer or small venue recordings that feel authentic

## How to get direct mp3 URLs

1. Royalty free sites:
   - Pixabay Music (many acoustic/vocal tracks, direct download)
   - Bensound (check license)
   - Free Music Archive
   - Mixkit (already used, look for more vocal tracks)

2. For your own:
   - Record a real performance
   - Or take a track you have rights to and host the mp3

3. For testing the game quickly:
   - Use existing Mixkit + add 2-3 good vocal real tracks from Pixabay

## Next step ideas

- Replace the obvious "Synthetic decoy" AI tracks with realistic generated ones.
- Add 4-5 high-quality real tracks with actual vocals.
- Add a "difficulty" tag or separate "hard pool" for later rounds.

Add your own via the TrackVault in the app — it's designed exactly for this.
