
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { Providers } from "./provider";
import { Public_Sans } from "next/font/google";

const publicSans = Public_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-public-sans",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  applicationName: "ReMarket",

  title: {
    default: "ReMarket | Find it nearby",
    template: "%s | ReMarket",
  },

  description:
    "Discover products from local businesses on ReMarket. Search by product and category, and explore listings from nearby sellers.",

  openGraph: {
    type: "website",
    siteName: "ReMarket",
    title: "ReMarket | Find it nearby",
    description:
      "Discover products from local businesses and explore nearby product listings.",
  },

  icons: {
    icon: [
      {
        url: "/icon.jpg",
        type: "image/jpeg",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FFF7ED",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={publicSans.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
