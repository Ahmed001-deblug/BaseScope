import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) return NextResponse.json({ error: "No address" }, { status: 400 });

  try {
    // Use Ankr's free API - no key needed
    const ankrRes = await fetch("https://rpc.ankr.com/multichain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "ankr_getAccountBalance",
        params: {
          walletAddress: address,
          blockchain: ["base"],
          onlyWhitelisted: false,
        },
        id: 1,
      }),
    });

    const ankrData = await ankrRes.json();
    const assets = ankrData?.result?.assets || [];

    // Sum all Base token values
    const currentValue = assets.reduce((total: number, asset: {
      blockchain: string;
      balanceUsd?: string;
    }) => {
      return total + parseFloat(asset?.balanceUsd || "0");
    }, 0);

    // Get historical chart from Moralis for ATH/ATL
    const moralisKey = process.env.NEXT_PUBLIC_MORALIS_API_KEY || "";
    let ath = currentValue;
    let athDate = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    let atl = currentValue;
    let atlDate = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    try {
      const historyRes = await fetch(
        `https://deep-index.moralis.io/api/v2.2/wallets/${address}/net-worth/history?chain=base&days=3650`,
        { headers: { "X-API-Key": moralisKey } }
      );
      const historyData = await historyRes.json();
      const snapshots: { date: string; total_networth_usd: string }[] = historyData?.result || [];

      snapshots.forEach((snap) => {
        const val = parseFloat(snap.total_networth_usd || "0");
        const date = new Date(snap.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        if (val > ath) { ath = val; athDate = date; }
        if (val > 0 && val < atl) { atl = val; atlDate = date; }
      });
    } catch {
      // keep defaults
    }

    // Get % changes from Moralis
    let change24h = 0, change7d = 0, change30d = 0, change1y = 0;
    try {
      const profitRes = await fetch(
        `https://deep-index.moralis.io/api/v2.2/wallets/${address}/profitability/summary?chain=base`,
        { headers: { "X-API-Key": moralisKey } }
      );
      const profitData = await profitRes.json();
      change24h = parseFloat(profitData?.realized_profit_24h || "0");
      change7d = parseFloat(profitData?.realized_profit_7d || "0");
      change30d = parseFloat(profitData?.realized_profit_30d || "0");
      change1y = parseFloat(profitData?.realized_profit_365d || "0");
    } catch {
      // keep defaults
    }

    return NextResponse.json({
      currentValue,
      change24h,
      change7d,
      change30d,
      change1y,
      ath,
      athDate,
      atl,
      atlDate,
    });
  } catch {
    return NextResponse.json({ error: "Failed", currentValue: 0 }, { status: 500 });
  }
}
