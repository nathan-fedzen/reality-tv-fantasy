import "./globals.css";
import type { Metadata, Viewport } from "next";
import Providers from "./providers";
import DevModeBanner from "@/components/dev-mode-banner";

export const metadata: Metadata = {
  title: "Reality TV Fantasy",
  description: "Fantasy leagues for reality TV fans.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Reality TV Fantasy",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#ed4f8b",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground">
        <DevModeBanner />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

