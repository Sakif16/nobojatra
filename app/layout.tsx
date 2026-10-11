import type { Metadata } from "next";
import localFont from "next/font/local";
import { connection } from "next/server";
import "./globals.css";
import "leaflet/dist/leaflet.css";

// Inter's Latin variable font, kept in the repository (app/fonts, with its
// licence) instead of fetched from Google Fonts. next/font/google downloads the
// file during `next build`, so a build with no route to Google failed.
//
// Exposed as a CSS variable so --font-sans in globals.css resolves to this
// self-hosted Inter rather than a system copy that may not exist.
const inter = localFont({
  src: "./fonts/inter-latin-variable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "NoboJatra",
  description: "Travel Planner",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Every page is rendered per request. The content security policy only runs
  // scripts that carry that response's nonce (see proxy.ts), and a page built
  // once at build time has no request to take a nonce from — its scripts would
  // all be refused.
  await connection();

  return (
    <html lang="en" className={`${inter.variable} dark h-full antialiased`}>
      <body className={`${inter.className} min-h-screen flex flex-col bg-background`}>
        {children}
      </body>
    </html>
  );
}
