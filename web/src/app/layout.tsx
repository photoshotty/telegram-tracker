import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { Radar } from "lucide-react";
import { HeaderActions } from "@/components/header-actions";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Telegram Tracker",
  description: "Online / last-seen history for tracked Telegram accounts",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-neutral-950 text-neutral-100">
        <header className="sticky top-0 z-50 border-b border-neutral-800/60 bg-neutral-950/85 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 rounded-lg text-sm font-semibold tracking-tight text-neutral-100 outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-sky-500/25 bg-sky-500/10">
                <Radar className="h-4 w-4 text-sky-400" />
              </span>
              Telegram Tracker
            </Link>
            <div className="ml-auto">
              <HeaderActions />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      </body>
    </html>
  );
}
