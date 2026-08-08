import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";

// Exposed as a CSS variable so --font-sans in globals.css resolves to this
// self-hosted Inter rather than a system copy that may not exist.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "NoboJatra",
  description: "Travel Planner",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} dark h-full antialiased`}>
      <body className={`${inter.className} min-h-screen flex flex-col bg-background`}>
        {children}
      </body>
    </html>
  );
}
