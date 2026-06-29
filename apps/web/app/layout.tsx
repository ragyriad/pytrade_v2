import type { Metadata } from "next";
import localFont from "next/font/local";
import { TopNav } from "./components/navigation/top-nav";
import "./visuals/globals.css";

const geistSans = localFont({
  src: "./visuals/fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./visuals/fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "PyTrade",
  description: "Portfolio dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <TopNav />
        {children}
      </body>
    </html>
  );
}
