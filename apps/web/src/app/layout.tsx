import type { Metadata } from "next";
import "./globals.css";

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
        {children}
      </body>
    </html>
  );
}
