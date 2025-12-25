import "./globals.css";
import Providers from "./providers";
import DevModeBanner from "@/components/dev-mode-banner";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <DevModeBanner />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
