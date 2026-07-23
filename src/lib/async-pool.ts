export async function mapAllSettledBounded<T, TResult>(
  items: readonly T[],
  maxConcurrency: number,
  task: (item: T, index: number) => Promise<TResult>,
): Promise<PromiseSettledResult<TResult>[]> {
  if (items.length === 0) return [];
  const requested = Number.isFinite(maxConcurrency) ? Math.floor(maxConcurrency) : 1;
  const workerCount = Math.min(items.length, Math.max(1, requested));
  const results = new Array<PromiseSettledResult<TResult>>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: "fulfilled", value: await task(items[index]!, index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
