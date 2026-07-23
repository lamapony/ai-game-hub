export function tongsPoints(input: {
  honestyScore: number;
  dodgeDetected: boolean;
  artistryScore: number;
  environmentUsed: boolean;
}) {
  const honesty = Math.max(0, Math.min(10, Math.trunc(input.honestyScore)));
  const artistry = Math.max(0, Math.min(5, Math.trunc(input.artistryScore)));
  return Math.max(
    0,
    Math.min(
      20,
      honesty + artistry + (input.environmentUsed ? 5 : 0) - (input.dodgeDetected ? 3 : 0),
    ),
  );
}
