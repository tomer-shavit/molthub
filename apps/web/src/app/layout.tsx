import type { Metadata } from "next";
import "./globals.css";
import { AuthProviderWrapper } from "./auth-provider-wrapper";
import { WebSocketProviderWrapper } from "./websocket-provider-wrapper";
import { UserStageProviderWrapper } from "./user-stage-provider-wrapper";

export const metadata: Metadata = {
  title: "Molthub - OpenClaw Control Plane",
  description: "Self-hosted control plane for OpenClaw instances",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        <AuthProviderWrapper>
          <WebSocketProviderWrapper>
            <UserStageProviderWrapper>{children}</UserStageProviderWrapper>
          </WebSocketProviderWrapper>
        </AuthProviderWrapper>
      </body>
    </html>
  );
}
