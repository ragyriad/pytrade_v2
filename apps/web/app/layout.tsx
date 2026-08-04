import type { Metadata } from "next";
import localFont from "next/font/local";
import { ClerkProvider } from "@clerk/nextjs";
import { TopNav } from "./components/navigation/topNav";
import { getCurrentApplicationUser } from "./lib/clerkAdmin";
import { AppStateProvider } from "./state/appStateProvider";
import "./assets/styles/globals.css";

const geistSans = localFont({
  src: "./assets/fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./assets/fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "PyTrade",
  description: "Portfolio dashboard",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const currentUser = await getCurrentApplicationUser();
  const isAdmin = currentUser?.localUser?.role === "admin"
    && currentUser.localUser.status === "active";

  return (
    <ClerkProvider>
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <AppStateProvider>
            <TopNav isAdmin={isAdmin} />
            {children}
          </AppStateProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
