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

    return NextResponse.json({
      moralisRaw: json
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}