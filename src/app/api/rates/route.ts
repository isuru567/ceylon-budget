import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.EXCHANGE_RATE_API_KEY;
  const url = key
    ? `https://v6.exchangerate-api.com/v6/${key}/latest/USD`
    : "https://open.er-api.com/v6/latest/USD";

  try {
    const res = await fetch(url, { next: { revalidate: 21600 } });
    const text = await res.text();

    if (!res.ok) {
      console.error("Rates HTTP error:", res.status, text.slice(0, 200));
      return NextResponse.json(
        { error: "Rates unavailable", status: res.status },
        { status: 502 }
      );
    }

    const data = JSON.parse(text);
    const rates = data.rates ?? data.conversion_rates;
    if (data.result !== "success" || !rates) {
      console.error("Rates bad response:", text.slice(0, 200));
      return NextResponse.json(
        { error: "Rates unavailable", detail: "Unexpected response" },
        { status: 502 }
      );
    }
    return NextResponse.json({ rates });
  } catch (err) {
    const cause =
      err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
    console.error("Rates fetch failed:", err);
    return NextResponse.json(
      { error: "Rates unavailable", detail: `${String(err)} ${cause}` },
      { status: 502 }
    );
  }
}