import type { Metadata } from "next";
import "./globals.css";
import { WebSocketProviderWrapper } from "./websocket-provider-wrapper";
import { UserStageProviderWrapper } from "./user-stage-provider-wrapper";

export const metadata: Metadata = {
  title: "Molthub - Moltbot Control Plane",
  description: "Self-hosted control plane for Moltbot instances",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        <WebSocketProviderWrapper>
          <UserStageProviderWrapper>{children}</UserStageProviderWrapper>
        </WebSocketProviderWrapper>
      </body>
    </html>
  );
}
