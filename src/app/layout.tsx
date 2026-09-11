import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cadence — the typing coach that learns you",
  description:
    "A keyboard-first typing test that studies your stats and mistakes, then curates the next test to attack your weak keys. Fully local: no account, no cloud.",
  keywords: ["typing test", "wpm", "typing coach", "adaptive practice", "monkeytype alternative", "local-first"],
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%230c0d0f'/><rect x='20' y='30' width='14' height='14' rx='3' fill='%23a3e635'/><rect x='40' y='30' width='14' height='14' rx='3' fill='%23a3e635'/><rect x='60' y='30' width='14' height='14' rx='3' fill='%23a3e635'/><rect x='30' y='50' width='40' height='14' rx='3' fill='%23a3e635' opacity='0.5'/></svg>",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
