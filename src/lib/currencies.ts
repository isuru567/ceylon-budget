const FALLBACK = [
  "ILS", "LKR", "USD", "EUR", "GBP", "AED", "SAR", "QAR", "KWD",
  "BHD", "OMR", "JPY", "KRW", "CAD", "AUD", "SGD", "MYR", "INR", "CHF",
];
const POPULAR = ["LKR", "ILS", "USD", "EUR", "GBP", "AED", "SAR", "QAR", "KWD"];

export function allCurrencies(): { code: string; name: string }[] {
  let codes: string[] = [];
  try {
    codes = Intl.supportedValuesOf("currency");
  } catch {
    codes = [];
  }
  if (codes.length === 0) codes = FALLBACK;

  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(["en"], { type: "currency" });
  } catch {
    names = null;
  }

  const rank = (c: string) => {
    const i = POPULAR.indexOf(c);
    return i === -1 ? 999 : i;
  };

  return codes
    .map((code) => ({ code, name: names?.of(code) ?? code }))
    .sort((a, b) => rank(a.code) - rank(b.code) || a.code.localeCompare(b.code));
}