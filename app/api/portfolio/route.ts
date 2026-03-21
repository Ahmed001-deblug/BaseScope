import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) return NextResponse.json({ error: "No address" }, { status: 400 });

  const zerionKey = process.env.ZERION_API_KEY || "";
  const encoded = Buffer.from(`${zerionKey}:`).toString("base64");
  const headers = {
    "Authorization": `Basic ${encoded}`,
    "Content-Type": "application/json",
  };

  try {
    // Get positions on Base
    const posRes = await fetch(
      `https://api.zerion.io/v1/wallets/${address}/positions/?filter[chain_ids]=base&filter[position_types]=wallet&currency=usd`,
      { headers }
    );
    const posData = await posRes.json();
    const positions = posData?.data || [];
    const currentValue = positions.reduce((total: number, pos: { attributes?: { value?: number } }) => {
      return total + (pos?.attributes?.value || 0);
    }, 0);

    // Get chart for ATH/ATL
    const chartRes = await fetch(
      `https://api.zerion.io/v1/wallets/${address}/portfolio/chart?currency=usd&period=year&filter[chain_ids]=base`,
      { headers }
    );
    const chartData = await chartRes.json();
    const points: [number, number][] = chartData?.data?.attributes?.points || [];

    let ath = currentValue;
    let athDate = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    let atl = currentValue;
    let atlDate = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    points.forEach(([timestamp, value]) => {
      const date = new Date(timestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      if (value > ath) { ath = value; athDate = date; }
      if (value > 0 && value < atl) { atl = value; atlDate = date; }
    });

    // Get % changes
    const pnlRes = await fetch(
      `https://api.zerion.io/v1/wallets/${address}/portfolio/?currency=usd&filter[chain_ids]=base`,
      { headers }
    );
    const pnlData = await pnlRes.json();
    const changes = pnlData?.data?.attributes?.changes || {};

    return NextResponse.json({
      currentValue,
      change24h: changes?.percent_1d || 0,
      change7d: changes?.percent_1w || 0,
      change30d: changes?.percent_1m || 0,
      change1y: changes?.percent_1y || 0,
      ath, athDate, atl, atlDate,
    });
  } catch (e) {
    return NextResponse.json({ error: "Failed", currentValue: 0 }, { status: 500 });
  }
}
