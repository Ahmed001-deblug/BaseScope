import type { Metadata } from "next";
import "./globals.css";
import RootProvider from "./rootProvider";

export const metadata: Metadata = {
  title: "BaseScope",
  description: "Onchain portfolio tracker for Base wallets and Farcaster users",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}