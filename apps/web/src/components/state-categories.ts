// Presentation only. These aliases never change stored kinds or limit new categories.
export type StateRecord = {
  id: string;
  content: string;
  kind: string;
  recordRole?: "item" | "object";
  listLabel?: string | null;
  stateLabel?: string | null;
  status: string;
  url: string | null;
  structuredValue: Record<string, unknown> | null;
  updatedAt: string;
  itemCount: number;
};
export type StateCategory = {
  key: string;
  label: string;
  icon: "trip" | "idea" | "shopping" | "purchase" | "folder" | "saved";
};
const clean = (s: string) =>
  s.trim().toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ");
export function readableLabel(s: string) {
  return clean(s).replace(/\b\w/g, (c) => c.toUpperCase());
}
export function categoryFor(record: StateRecord): StateCategory {
  const kind = clean(record.kind),
    list = clean(record.listLabel ?? ""),
    state = clean(record.stateLabel ?? "");
  if (record.recordRole === "object") {
    if (/^(trip|travel|vacation|journey|यात्रा)$/.test(kind))
      return { key: "trips", label: "Trips", icon: "trip" };
    if (/^(project|plan|goal)$/.test(kind))
      return { key: "projects", label: "Projects & plans", icon: "folder" };
  }
  if (/^(idea|video idea|content idea|podcast idea|content|आइडिया)$/.test(kind))
    return { key: "ideas", label: "Ideas", icon: "idea" };
  if (/^(purchased|bought)$/.test(state))
    return { key: "purchases", label: "Purchases", icon: "purchase" };
  if (
    /^(cart item|shopping|shopping item|product|purchase|buy|shopping cart|wishlist item)$/.test(
      kind,
    ) ||
    /^(cart|shopping|shopping cart|wishlist|to buy)$/.test(list)
  )
    return { key: "shopping", label: "Shopping", icon: "shopping" };
  if (list)
    return { key: `list:${list}`, label: readableLabel(list), icon: "folder" };
  if (/^(link|bookmark|item|saved item|candidate|note)$/.test(kind))
    return { key: "saved", label: "Saved", icon: "saved" };
  const label = readableLabel(kind);
  return {
    key: `kind:${kind}`,
    label: label.endsWith("s") ? label : `${label}s`,
    icon: record.recordRole === "object" ? "folder" : "saved",
  };
}
export function stateDetails(value: Record<string, unknown> | null): string[] {
  if (!value) return [];
  const parts: string[] = [];
  if (typeof value.amount === "number") {
    const currency = typeof value.currency === "string" ? value.currency : null;
    let amount: string;
    try {
      amount = currency
        ? new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency,
            maximumFractionDigits: 2,
          }).format(value.amount)
        : String(value.amount);
    } catch {
      amount = `${value.amount} ${currency ?? ""}`.trim();
    }
    parts.push(
      `${amount}${typeof value.unit === "string" ? ` ${value.unit}` : ""}`,
    );
  }
  for (const [key, v] of Object.entries(value)) {
    if (v === null || v === "" || ["amount", "currency", "unit"].includes(key))
      continue;
    const text = ["value", "details", "occurredAt"].includes(key)
      ? String(v)
      : `${readableLabel(key)}: ${v}`;
    if (!parts.includes(text)) parts.push(text);
  }
  return parts;
}
