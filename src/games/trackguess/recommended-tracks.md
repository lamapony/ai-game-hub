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

## Spotify finds (ready uploaded tracks)

Spotify has tons of already released tracks. These are "готовые залитые".

**Important note**: Spotify links work great for `sourceUrl` (the game will label them as Spotify).  
But for actual playback in the game you still need a direct .mp3 URL.  
You can:
- Add them as custom real tracks with the Spotify link (for reference)
- Later find/extract audio or use as inspiration
- Or use Spotify on the side while testing the game

### Cool real performances (impressive executions) on Spotify

Search these directly in Spotify:

- "NPR Tiny Desk" or "Tiny Desk Concert" → excellent live performances with real emotion and skill.  
  Great examples:
  - Hozier Tiny Desk (raw powerful vocals)
  - Jacob Collier Tiny Desk (insane vocal harmonies and performance)
  - Billie Eilish Tiny Desk (intimate, high quality live)
  - Other good ones: Arlo Parks, Clairo, or any "Tiny Desk" with strong vocals

- "MTV Unplugged" or "Live Acoustic"
- "Live from the Royal Albert Hall" (Adele or others)
- Search "acoustic live session" + artist name

These are perfect for "Real" because the performance is obviously human and often impressive.

### Real tracks that sound AI / hyper-real (hard to distinguish)

Search these on Spotify:

- "hyperpop" playlist or "Brat" by Charli XCX
  - Specific tracks: Charli XCX – "360", "Von dutch", "Apple"
    (extremely processed, digital, perfect timing — can feel uncanny/AI)

- Search "100 gecs" or "hyperpop 2024"
- "digital pop" or "futuristic R&B"
- Some very clean modern soul or bedroom pop

These often have heavy vocal tuning and production that blurs the line with AI.

### AI-generated tracks already on Spotify

Search these terms (many creators upload Suno/Udio generations):

- "Suno AI"
- "Udio AI"
- "AI generated music"
- "AI soul" or "AI folk" or "AI bar music"
- Playlists: "AI Music", "Suno Creations", "Completely AI Generated"

Tip: Look for tracks with 10k–100k+ streams by small artists. Some are surprisingly good and realistic.

### Grill + Bar friendly searches on Spotify

- "live jazz bar"
- "acoustic soul live"
- "intimate acoustic performance"
- "late night bar music live"
- "outdoor grill vibes" or chill folk live sessions

### How to add Spotify tracks to the game

1. Open the game as Host → briefing phase.
2. Use TrackVault to add Custom Real Track.
3. Paste:
   - Title + Artist
   - Genre
   - For URL: you still need a playable audio link (or test later)
   - sourceUrl: the full Spotify link (e.g. https://open.spotify.com/track/xxxx)
4. The game will show it as "Spotify" source.

If you find specific tracks you like, send me the names/links and I can format them as ready-to-paste custom track objects.

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

### Ready-to-paste custom track examples

Copy these into the TrackVault or adapt for catalog (replace URL with actual playable audio if you have it):

```js
// Example 1: Cool live performance (Tiny Desk style)
{
  id: "real-hozier-tinydesk",
  title: "Take Me To Church (Live)",
  artist: "Hozier",
  genre: "Soul / Live Performance",
  url: "https://YOUR_DIRECT_MP3_URL_HERE",
  sourceUrl: "https://open.spotify.com/track/4f3YqE5v3v3v3v3v3v3v3",  // find real link
}

// Example 2: Hyper-real / AI-sounding real (hyperpop)
{
  id: "real-charli-360",
  title: "360",
  artist: "Charli XCX",
  genre: "Hyperpop",
  url: "https://YOUR_DIRECT_MP3_URL_HERE",
  sourceUrl: "https://open.spotify.com/track/3W4U7TE5u5D4n3i5v3v3v3",
}

// Example 3: Search "Suno AI" on Spotify for AI-generated examples
{
  id: "ai-suno-bar-ballad",
  title: "[Paste track name]",
  artist: "[Artist]",
  genre: "AI / Soulful Bar",
  url: "https://YOUR_DIRECT_MP3_URL_HERE",
  sourceUrl: "https://open.spotify.com/track/..."
}
```

Search these exact terms on Spotify right now:
- "Hozier Tiny Desk"
- "Charli XCX 360"
- "Suno AI"
- "AI generated soul"
- "Jacob Collier Tiny Desk"
