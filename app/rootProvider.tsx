"use client";

import { MiniKitProvider } from "@coinbase/onchainkit/minikit";

export default function RootProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MiniKitProvider>
      {children}
    </MiniKitProvider>
  );
}