import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "No address provided" }, { status: 400 });
  }

  const moralisKey = process.env.MORALIS_API_KEY || "";

  if (!moralisKey) {
    return NextResponse.json({ error: "No API key configured" }, { status: 500 });
  }

  try {
    const res = await fetch(
      `https://deep-index.moralis.io/api/v2.2/wallets/${address}/net-worth?chains=base&exclude_spam=true&exclude_unverified_contracts=true`,
      {
        method: "GET",
        headers: {
          "X-API-Key": moralisKey,
          "Accept": "application/json"
        }
      }
    );

    const json = await res.json();

    const currentValue = parseFloat(json?.total_networth_usd || "0");

    return NextResponse.json({
      currentValue,
      change24h: 0,
      change7d: 0,
      change30d: 0,
      change1y: 0,
      ath: currentValue,
      athDate: "—",
      atl: currentValue,
      atlDate: "—"
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: String(e),
        currentValue: 0,
        change24h: 0,
        change7d: 0,
        change30d: 0,
        change1y: 0,
        ath: 0,
        athDate: "—",
        atl: 0,
        atlDate: "—"
      },
      { status: 500 }
    );
  }
}