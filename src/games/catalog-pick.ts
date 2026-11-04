export type ThemedCatalogItem = {
  id: string;
  acts?: readonly string[];
  heat?: number;
};

export type ThemedPickOptions = {
  actId?: string;
  preferHeat?: number;
};

export function pickThemedItem<T extends ThemedCatalogItem>(
  items: readonly T[],
  usedIds: string[],
  random = Math.random(),
  options?: ThemedPickOptions,
): T {
  if (items.length === 0) {
    throw new Error("catalog is empty");
  }
  const unused = items.filter((item) => !usedIds.includes(item.id));
  const base = unused.length > 0 ? unused : items;
  let pool = base;
  if (options?.actId) {
    const themed = base.filter((item) => item.acts?.includes(options.actId!));
    if (themed.length > 0) pool = themed;
  }
  if (options?.preferHeat != null) {
    const hot = pool.filter((item) => (item.heat ?? 1) >= options.preferHeat!);
    if (hot.length > 0) pool = hot;
  }
  const index = Math.max(0, Math.min(pool.length - 1, Math.floor(random * pool.length)));
  return pool[index]!;
}
