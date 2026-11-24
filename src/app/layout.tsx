import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed, Cairo, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

// Barlow and Barlow Condensed are the typefaces on arenadbayeh.com.
const barlow = Barlow({ variable: "--font-barlow", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  style: ["normal", "italic"],
});
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Arabic text falls back to Cairo (Barlow has no Arabic letters).
const cairo = Cairo({ variable: "--font-cairo", subsets: ["arabic"], weight: ["400", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Arena OS",
  // Client demo: reachable by link, kept out of search engines.
  robots: { index: false, follow: false },
  description:
    "Tasks, events, walk-ins and reports for the Arena Dbayeh team. Built by Brains AI Solutions.",
};

export const viewport: Viewport = { themeColor: "#070908" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${barlow.variable} ${barlowCondensed.variable} ${geistMono.variable} ${cairo.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
