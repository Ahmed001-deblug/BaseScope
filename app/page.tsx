"use client";
import { useEffect, useState } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";

type Screen = "search" | "portfolio" | "pnl";

interface PortfolioData {
  username: string;
  address: string;
  avatar: string;
  currentValue: number;
  ath: number;
  athDate: string;
  atl: number;
  atlDate: string;
  change24h: number;
  change7d: number;
  change30d: number;
  change1y: number;
  totalInvested: number;
}

async function lookupFarcasterUser(username: string): Promise<{ address: string; avatar: string; displayName: string } | null> {
  try {
    const cleanUsername = username.startsWith("@") ? username.slice(1) : username;
    const res = await fetch(
      `https://api.neynar.com/v2/farcaster/user/by_username?username=${cleanUsername}`,
      { headers: { "api_key": process.env.NEXT_PUBLIC_NEYNAR_API_KEY || "" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const user = data?.user;
    if (!user) return null;
    const address = user?.verified_addresses?.eth_addresses?.[0] || user?.custody_address || "";
    const avatar = user?.pfp_url || "";
    const displayName = user?.username || cleanUsername;
    return { address, avatar, displayName };
  } catch {
    return null;
  }
}

async function reverseLookupWallet(address: string): Promise<{ avatar: string; displayName: string } | null> {
  try {
    const res = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${address}`,
      { headers: { "api_key": process.env.NEXT_PUBLIC_NEYNAR_API_KEY || "" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const users = data?.[address.toLowerCase()];
    if (!users || users.length === 0) return null;
    const user = users[0];
    return { avatar: user?.pfp_url || "", displayName: user?.username || "" };
  } catch {
    return null;
  }
}

async function getWalletData(address: string): Promise<{
  currentValue: number;
  change24h: number;
  change7d: number;
  change30d: number;
  change1y: number;
  ath: number;
  athDate: string;
  atl: number;
  atlDate: string;
  totalInvested: number;
}> {
  try {
    const moralisKey = process.env.NEXT_PUBLIC_MORALIS_API_KEY || "";
    const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || "";
    const baseUrl = `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`;

    // Get ETH balance via Alchemy
    const ethRes = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "eth_getBalance", params: [address, "latest"] }),
    });
    const ethData = await ethRes.json();
    const ethBalance = parseInt(ethData?.result || "0", 16) / 1e18;

    // Get ETH price
    const ethPriceRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
    const ethPriceData = await ethPriceRes.json();
    const ethPrice = ethPriceData?.ethereum?.usd || 0;
    const ethValue = ethBalance * ethPrice;

    // Get ERC-20 token balances via Alchemy
    const tokenRes = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1, jsonrpc: "2.0",
        method: "alchemy_getTokenBalances",
        params: [address, "erc20"],
      }),
    });
    const tokenData = await tokenRes.json();
    const tokenBalances = tokenData?.result?.tokenBalances || [];

    // Known Base token addresses and their CoinGecko IDs
    const knownTokens: Record<string, { symbol: string; decimals: number; coingeckoId: string }> = {
      "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", decimals: 6, coingeckoId: "usd-coin" },
      "0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18, coingeckoId: "ethereum" },
      "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": { symbol: "DAI", decimals: 18, coingeckoId: "dai" },
      "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca": { symbol: "USDbC", decimals: 6, coingeckoId: "usd-coin" },
      "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22": { symbol: "cbETH", decimals: 18, coingeckoId: "coinbase-wrapped-staked-eth" },
    };

    // Get prices for known tokens
    const coingeckoIds = [...new Set(Object.values(knownTokens).map(t => t.coingeckoId))].join(",");
    const tokenPriceRes = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoIds}&vs_currencies=usd`
    );
    const tokenPrices = await tokenPriceRes.json();

    // Calculate token values
    let totalTokenValue = 0;
    for (const token of tokenBalances) {
      const contractAddr = token.contractAddress.toLowerCase();
      const known = knownTokens[contractAddr];
      if (!known) continue;
      const balance = parseInt(token.tokenBalance, 16) / Math.pow(10, known.decimals);
      const price = tokenPrices?.[known.coingeckoId]?.usd || 0;
      const value = balance * price;
      totalTokenValue += value;
    }

    const currentValue = ethValue + totalTokenValue;

    // Get full net worth history from Moralis for ATH/ATL
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
    const change24h = parseFloat(profitData?.realized_profit_24h || "0");
    const change7d = parseFloat(profitData?.realized_profit_7d || "0");
    const change30d = parseFloat(profitData?.realized_profit_30d || "0");
    const change1y = parseFloat(profitData?.realized_profit_365d || "0");

    return {
      currentValue, change24h, change7d, change30d, change1y,
      ath, athDate, atl, atlDate,
      totalInvested: currentValue * 0.7,
    };
  } catch {
    return {
      currentValue: 0, change24h: 0, change7d: 0, change30d: 0, change1y: 0,
      ath: 0, athDate: "—", atl: 0, atlDate: "—", totalInvested: 0,
    };
  }
}

function validateInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return "Please enter a username or wallet address.";
  if (/^(1[a-zA-Z0-9]{25,34}|3[a-zA-Z0-9]{25,34}|bc1[a-zA-Z0-9]{6,87})$/.test(trimmed))
    return "₿ Bitcoin address detected. BaseScope only supports Base and Ethereum wallets. Try a Base wallet starting with 0x or a Farcaster username.";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed) && !trimmed.startsWith("0x"))
    return "◎ This looks like a Solana address. BaseScope only supports Base and Ethereum wallets. Try a Base wallet starting with 0x or a Farcaster username.";
  if (trimmed.startsWith("0x")) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed))
      return "Invalid wallet address. A valid Base wallet starts with 0x and is 42 characters long.";
    return null;
  }
  const username = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  if (!/^[a-zA-Z0-9_.-]{1,50}$/.test(username))
    return "Invalid input. Please enter a valid Farcaster username or a Base wallet starting with 0x.";
  return null;
}

function pct(val: number) {
  return (val >= 0 ? "+" : "") + val.toFixed(2) + "%";
}

function usd(val: number) {
  return "$" + val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Home() {
  const { setFrameReady, isFrameReady, context } = useMiniKit();
  const [screen, setScreen] = useState<Screen>("search");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFrameReady) setFrameReady();
  }, [setFrameReady, isFrameReady]);

  useEffect(() => {
    if (context?.user?.username) setQuery(context.user.username);
  }, [context]);

  const handleSearch = async (overrideQuery?: string) => {
    const searchQuery = overrideQuery || query;
    setError(null);
    const validationError = validateInput(searchQuery);
    if (validationError) { setError(validationError); return; }
    setLoading(true);
    try {
      let address = "";
      let avatar = "";
      let displayName = searchQuery;

      if (searchQuery.startsWith("0x")) {
        address = searchQuery;
        displayName = searchQuery.slice(0, 6) + "..." + searchQuery.slice(-4);
        const farcasterProfile = await reverseLookupWallet(searchQuery);
        if (farcasterProfile) {
          avatar = farcasterProfile.avatar;
          displayName = farcasterProfile.displayName;
        }
      } else {
        const farcasterUser = await lookupFarcasterUser(searchQuery);
        if (farcasterUser) {
          address = farcasterUser.address;
          avatar = farcasterUser.avatar;
          displayName = farcasterUser.displayName;
        } else {
          setError("User not found on Farcaster. Check the username and try again.");
          setLoading(false);
          return;
        }
      }

      const walletData = address ? await getWalletData(address) : {
        currentValue: 0, change24h: 0, change7d: 0, change30d: 0, change1y: 0,
        ath: 0, athDate: "—", atl: 0, atlDate: "—", totalInvested: 0,
      };

      setData({ username: displayName, address, avatar, ...walletData });
      setScreen("portfolio");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const shareOnX = () => {
    if (!data) return;
    const text = "My Base Portfolio\n"
      + usd(data.currentValue) + "\n"
      + "ATH: " + usd(data.ath) + " (" + data.athDate + ")\n"
      + "ATL: " + usd(data.atl) + " (" + data.atlDate + ")\n"
      + "1Y: " + pct(data.change1y) + "\n"
      + "Checked with BaseScope";
    window.open("https://x.com/intent/tweet?text=" + encodeURIComponent(text), "_blank");
  };

  const pnl = data ? data.currentValue - data.totalInvested : 0;
  const roi = data && data.totalInvested > 0 ? (pnl / data.totalInvested) * 100 : 0;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0a0a0f 0%, #0d1117 100%)", color: "#fff", fontFamily: "'Courier New', monospace", padding: "0", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "20px 20px 12px", borderBottom: "1px solid #1a1a2e", display: "flex", alignItems: "center", gap: "10px" }}>
        {screen !== "search" && (
          <button onClick={() => { setScreen("search"); setError(null); }} style={{ background: "none", border: "none", color: "#4a9eff", fontSize: "1.2rem", cursor: "pointer", padding: "0 8px 0 0" }}>←</button>
        )}
        <div>
          <div style={{ fontSize: "1.1rem", fontWeight: 900, letterSpacing: "0.05em" }}>BASE<span style={{ color: "#0052ff" }}>SCOPE</span></div>
          <div style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.2em" }}>ONCHAIN PORTFOLIO TRACKER</div>
        </div>
        <div style={{ marginLeft: "auto", width: "8px", height: "8px", borderRadius: "50%", background: "#0052ff", boxShadow: "0 0 8px #0052ff" }} />
      </div>

      <div style={{ flex: 1, padding: "20px", maxWidth: "480px", width: "100%", margin: "0 auto" }}>
        {screen === "search" && (
          <div>
            <div style={{ marginBottom: "32px", marginTop: "12px" }}>
              <div style={{ fontSize: "1.4rem", fontWeight: 900, lineHeight: 1.2, marginBottom: "6px" }}>
                {context?.user?.username ? "👋 Hey @" + context.user.username : "🔍 Search any portfolio"}
              </div>
              <div style={{ fontSize: "0.7rem", color: "#555", letterSpacing: "0.1em" }}>ENTER FARCASTER USERNAME OR BASE WALLET</div>
            </div>
            {context?.user?.username && (
              <button onClick={() => handleSearch(context.user.username!)} style={{ width: "100%", padding: "16px", background: "linear-gradient(135deg, #0052ff, #0099ff)", border: "none", borderRadius: "12px", color: "#fff", fontFamily: "'Courier New', monospace", fontWeight: 900, fontSize: "0.9rem", cursor: "pointer", marginBottom: "16px" }}>
                📊 VIEW MY PORTFOLIO
              </button>
            )}
            <div style={{ background: "#0d0d0d", border: `1px solid ${error ? "#ff3c5f" : "#1f1f2e"}`, borderRadius: "12px", padding: "4px", display: "flex", gap: "8px", marginBottom: "8px" }}>
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setError(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="@username or 0x..."
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#e0e0e0", fontFamily: "'Courier New', monospace", fontSize: "0.9rem", padding: "12px 14px" }}
              />
              <button onClick={() => handleSearch()} disabled={loading} style={{ background: loading ? "#111" : "#0052ff", border: "none", borderRadius: "10px", color: "#fff", fontFamily: "'Courier New', monospace", fontWeight: 700, fontSize: "0.8rem", padding: "10px 16px", cursor: loading ? "default" : "pointer" }}>
                {loading ? "..." : "SEARCH"}
              </button>
            </div>
            {error && (
              <div style={{ background: "#1a0a0a", border: "1px solid #ff3c5f44", borderRadius: "10px", padding: "12px 14px", marginBottom: "12px", fontSize: "0.75rem", color: "#ff3c5f", lineHeight: 1.5 }}>
                ⚠️ {error}
              </div>
            )}
            <div style={{ fontSize: "0.65rem", color: "#333", textAlign: "center", letterSpacing: "0.1em" }}>WORKS WITH ANY FARCASTER USER OR BASE WALLET</div>
          </div>
        )}

        {screen === "portfolio" && data && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px", marginTop: "8px" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#0052ff22", border: "2px solid #0052ff44", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", overflow: "hidden" }}>
                {data.avatar ? <img src={data.avatar} alt="pfp" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} /> : "👤"}
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: "1rem" }}>@{data.username}</div>
                <div style={{ fontSize: "0.6rem", color: "#444" }}>{data.address || "No wallet linked"}</div>
              </div>
            </div>
            <div style={{ background: "#0d0d1a", border: "1px solid #1a1a2e", borderRadius: "16px", padding: "20px", marginBottom: "12px" }}>
              <div style={{ fontSize: "0.6rem", color: "#444", letterSpacing: "0.2em", marginBottom: "6px" }}>PORTFOLIO VALUE</div>
              <div style={{ fontSize: "2rem", fontWeight: 900 }}>{usd(data.currentValue)}</div>
              <div style={{ fontSize: "0.75rem", color: "#444", marginTop: "4px" }}>
                {data.currentValue === 0 ? "No tokens found on Base" : "Live from Base network"}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
              {[{ label: "ATH 📈", value: usd(data.ath), date: data.athDate, color: "#00ff87" }, { label: "ATL 📉", value: usd(data.atl), date: data.atlDate, color: "#ff3c5f" }].map(({ label, value, date, color }) => (
                <div key={label} style={{ background: "#0d0d1a", border: "1px solid #1a1a2e", borderRadius: "12px", padding: "14px" }}>
                  <div style={{ fontSize: "0.6rem", color: "#444", marginBottom: "6px" }}>{label}</div>
                  <div style={{ fontWeight: 900, color, fontSize: "1rem" }}>{value}</div>
                  <div style={{ fontSize: "0.6rem", color: "#333", marginTop: "4px" }}>{date}</div>
                </div>
              ))}
            </div>
            <div style={{ background: "#0d0d1a", border: "1px solid #1a1a2e", borderRadius: "12px", padding: "16px", marginBottom: "12px" }}>
              <div style={{ fontSize: "0.6rem", color: "#444", letterSpacing: "0.2em", marginBottom: "12px" }}>PERFORMANCE</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px" }}>
                {[{ label: "24H", val: data.change24h }, { label: "7D", val: data.change7d }, { label: "30D", val: data.change30d }, { label: "1Y", val: data.change1y }].map(({ label, val }) => (
                  <div key={label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "0.55rem", color: "#444", marginBottom: "4px" }}>{label}</div>
                    <div style={{ fontWeight: 900, fontSize: "0.8rem", color: val === 0 ? "#555" : val >= 0 ? "#00ff87" : "#ff3c5f" }}>{val === 0 ? "—" : pct(val)}</div>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={() => setScreen("pnl")} style={{ width: "100%", padding: "16px", background: "linear-gradient(135deg, #0052ff, #0099ff)", border: "none", borderRadius: "12px", color: "#fff", fontFamily: "'Courier New', monospace", fontWeight: 900, fontSize: "0.9rem", cursor: "pointer" }}>
              📊 VIEW PnL CARD
            </button>
          </div>
        )}

        {screen === "pnl" && data && (
          <div>
            <div style={{ marginBottom: "20px", marginTop: "8px" }}>
              <div style={{ fontSize: "0.6rem", color: "#444", letterSpacing: "0.2em" }}>YOUR PnL CARD</div>
            </div>
            <div style={{ background: "linear-gradient(135deg, #0a0a1a, #0d1130)", border: "1px solid #0052ff44", borderRadius: "16px", padding: "24px", marginBottom: "16px", boxShadow: "0 0 40px #0052ff22" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <div style={{ fontSize: "0.9rem", fontWeight: 900 }}>BASE<span style={{ color: "#0052ff" }}>SCOPE</span></div>
                <div style={{ fontSize: "0.6rem", color: "#444" }}>🔵 BASE NETWORK</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#0052ff22", border: "1px solid #0052ff44", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {data.avatar ? <img src={data.avatar} alt="pfp" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "1rem" }}>👤</span>}
                </div>
                <div style={{ fontSize: "0.7rem", color: "#555" }}>@{data.username}</div>
              </div>
              <div style={{ fontSize: "2rem", fontWeight: 900, marginBottom: "4px" }}>{usd(data.currentValue)}</div>
              <div style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "20px", color: pnl >= 0 ? "#00ff87" : "#ff3c5f" }}>
                {pnl >= 0 ? "▲" : "▼"} {usd(Math.abs(pnl))} ({pct(roi)})
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
                <div>
                  <div style={{ fontSize: "0.55rem", color: "#444" }}>ATH</div>
                  <div style={{ color: "#00ff87", fontWeight: 700 }}>{usd(data.ath)}</div>
                  <div style={{ fontSize: "0.55rem", color: "#333" }}>{data.athDate}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.55rem", color: "#444" }}>ATL</div>
                  <div style={{ color: "#ff3c5f", fontWeight: 700 }}>{usd(data.atl)}</div>
                  <div style={{ fontSize: "0.55rem", color: "#333" }}>{data.atlDate}</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "6px" }}>
                {[{ label: "24H", val: data.change24h }, { label: "7D", val: data.change7d }, { label: "30D", val: data.change30d }, { label: "1Y", val: data.change1y }].map(({ label, val }) => (
                  <div key={label} style={{ background: "#ffffff08", borderRadius: "8px", padding: "8px 4px", textAlign: "center" }}>
                    <div style={{ fontSize: "0.5rem", color: "#444", marginBottom: "2px" }}>{label}</div>
                    <div style={{ fontWeight: 900, fontSize: "0.75rem", color: val === 0 ? "#555" : val >= 0 ? "#00ff87" : "#ff3c5f" }}>{val === 0 ? "—" : pct(val)}</div>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={shareOnX} style={{ width: "100%", padding: "16px", background: "#000", border: "1px solid #333", borderRadius: "12px", color: "#fff", fontFamily: "'Courier New', monospace", fontWeight: 900, fontSize: "0.9rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
              𝕏 SHARE ON X
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
