export type ObservedProviderCost = {
  amount: number;
  currency: "DKK" | "EUR" | "USD";
};

function normalizedCurrency(value: string): ObservedProviderCost["currency"] | null {
  if (value === "$" || value === "USD") return "USD";
  if (value === "€" || value === "EUR") return "EUR";
  return value === "DKK" ? "DKK" : null;
}

export function parseObservedProviderCost(value: string): ObservedProviderCost | null {
  const normalized = value.trim().toUpperCase().replace(",", ".");
  const prefix = normalized.match(/^(DKK|USD|EUR|\$|€)\s*([0-9]+(?:\.[0-9]{1,4})?)$/);
  const suffix = normalized.match(/^([0-9]+(?:\.[0-9]{1,4})?)\s*(DKK|USD|EUR)$/);
  const amountText = prefix?.[2] ?? suffix?.[1];
  const currencyText = prefix?.[1] ?? suffix?.[2];
  const amount = amountText ? Number(amountText) : Number.NaN;
  const currency = currencyText ? normalizedCurrency(currencyText) : null;
  if (!currency || !Number.isFinite(amount) || amount <= 0) return null;
  return { amount, currency };
}
