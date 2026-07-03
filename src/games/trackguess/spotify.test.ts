import { describe, expect, test } from "bun:test";
import { isSpotifyUrl, spotifyEmbedUrl, spotifyTrackId, spotifyTrackUrl } from "./spotify";

describe("spotify track helpers", () => {
  test("parses track urls and uris", () => {
    expect(spotifyTrackId("https://open.spotify.com/track/3dYD57lRAUcMHufyqn9GcI")).toBe(
      "3dYD57lRAUcMHufyqn9GcI",
    );
    expect(
      spotifyTrackId("https://open.spotify.com/intl-da/track/3dYD57lRAUcMHufyqn9GcI?si=abc"),
    ).toBe("3dYD57lRAUcMHufyqn9GcI");
    expect(spotifyTrackId("spotify:track:3dYD57lRAUcMHufyqn9GcI")).toBe("3dYD57lRAUcMHufyqn9GcI");
  });

  test("builds canonical track and embed urls", () => {
    expect(isSpotifyUrl("https://open.spotify.com/track/3dYD57lRAUcMHufyqn9GcI")).toBe(true);
    expect(spotifyTrackUrl("spotify:track:3dYD57lRAUcMHufyqn9GcI")).toBe(
      "https://open.spotify.com/track/3dYD57lRAUcMHufyqn9GcI",
    );
    expect(spotifyEmbedUrl("https://open.spotify.com/track/3dYD57lRAUcMHufyqn9GcI")).toBe(
      "https://open.spotify.com/embed/track/3dYD57lRAUcMHufyqn9GcI?utm_source=generator",
    );
  });
});
