import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import SessionProvider from "@/components/SessionProvider";

export const metadata: Metadata = {
  title: "ZeonCloud | Oracle VPS Vitals & Neon-Style Postgres Cloud",
  description: "Open-source control plane for monitoring Oracle Linux Ampere VPS, provisioning isolated PostgreSQL databases, and tracking Uptime Kuma heartbeats.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full antialiased selection:bg-white/20 selection:text-white">
      <head>
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="min-h-full flex flex-col bg-[#09090b] text-zinc-100 bg-grid-pattern">
        <SessionProvider>
          {/* Subtle monochrome ambient light */}
          <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[200px] bg-white/[0.02] blur-3xl pointer-events-none -z-10" />

          <Navbar />

          <main className="flex-1 w-full flex flex-col">
            {children}
          </main>
        </SessionProvider>

        <footer className="border-t border-zinc-850/80 bg-zinc-950/60 py-6 mt-12 text-xs text-zinc-500">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-300">ZeonCloud</span>
              <span>•</span>
              <span>Open-Source Oracle Linux Ampere Telemetry & DB Manager</span>
            </div>
            <div className="flex items-center gap-4 text-zinc-400">
              <span className="font-mono text-[11px] text-zinc-500">v1.0.0</span>
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="hover:text-white transition-colors"
              >
                GitHub
              </a>
              <a
                href="https://dokploy.mindzed.tech"
                target="_blank"
                rel="noreferrer"
                className="hover:text-white transition-colors"
              >
                Dokploy
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
