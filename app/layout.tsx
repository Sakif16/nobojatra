import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/navbar";

const inter = Inter({
  subsets: ["latin"],
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
    <html lang="en" className="h-full antialiased">
      <body className={`${inter.className} min-h-screen flex flex-col bg-background`}>
        <Navbar />
        {children}
      </body>
    </html>
  );
}
