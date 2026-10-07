import type { Metadata } from "next";
import "./globals.css";
import { PwaProvider } from "@/components/pwa/pwa-provider";
import { AppAlertProvider } from "@/components/ui/app-alert-provider";

export const metadata: Metadata = {
  title: "ThinkSales Pro",
  description: "Run sales, inventory, accounting, and your team from one workspace.",
  icons: {
    icon: [
      { url: "/thinksales-logo.svg", type: "image/svg+xml" },
      { url: "/thinksales-logo.jpeg", type: "image/jpeg" },
    ],
    apple: "/thinksales-logo.jpeg",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b3b91",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body">
        <AppAlertProvider>{children}</AppAlertProvider>
        <PwaProvider />
      </body>
    </html>
  );
}
