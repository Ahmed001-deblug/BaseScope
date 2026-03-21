import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) return NextResponse.json({ error: "No address" }, { status: 400 });

  const moralisKey = process.env.NEXT_PUBLIC_MORALIS_API_KEY || "";

  try {
    // Get current net worth
    const networthRes = await fetch(
      `https://deep-index.moralis.io/api/v2.2/wallets/${address}/net-worth?chains=base&exclude_spam=true&exclude_unverified_contracts=true`,
      { headers: { "X-API-Key": moralisKey } }
    );
    const networthData = await networthRes.json();
    const currentValue = parseFloat(networthData?.total_networth_usd || "0");

    // Get history for ATH/ATL
    const historyRes = await fetch(
      `https://deep-index.moralis.io/api/v2.2/wallets/${address}/net-worth/history?chain=base&days=3650`,
      { headers: { "X-API-Key": moralisKey } }
    );
    const historyData = await historyRes.json();
    const snapshots: { date: string; total_networth_usd: string }[] = historyData?.result || [];

    let ath = currentValue;
    let athDate = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    let atl = currentValue;
    let atlDate = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    snapshots.forEach((snap) => {
      const val = parseFloat(snap.total_networth_usd || "0");
      const date = new Date(snap.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      if (val > ath) { ath = val; athDate = date; }
      if (val > 0 && val < atl) { atl = val; atlDate = date; }
    });

    // Get % changes
    const profitRes = await fetch(
      `https://deep-index.moralis.io/api/v2.2/wallets/${address}/profitability/summary?chain=base`,
      { headers: { "X-API-Key": moralisKey } }
    );
    const profitData = await profitRes.json();

    return NextResponse.json({
      currentValue,
      change24h: parseFloat(profitData?.realized_profit_24h || "0"),
      change7d: parseFloat(profitData?.realized_profit_7d || "0"),
      change30d: parseFloat(profitData?.realized_profit_30d || "0"),
      change1y: parseFloat(profitData?.realized_profit_365d || "0"),
      ath,
      athDate,
      atl,
      atlDate,
    });
  } catch {
    return NextResponse.json({ error: "Failed", currentValue: 0 }, { status: 500 });
  }
}
