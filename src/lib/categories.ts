export const CATEGORIES = [
  { key: "tax", label: "Tax" },
  { key: "rent", label: "Rent" },
  { key: "food", label: "Food & Groceries" },
  { key: "net", label: "Internet / Data" },
  { key: "trans", label: "Transport" },
  { key: "elec", label: "Utilities" },
  { key: "health", label: "Health" },
  { key: "oth", label: "Other" },
];

export function categoryLabel(key: string) {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key;
}