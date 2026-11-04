import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { Providers } from "./provider";

export const metadata: Metadata = {
  applicationName: "ReMarket",

  title: {
    default: "ReMarket | Find it nearby",
    template: "%s | ReMarket",
  },

  description: "Find it nearby",

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
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}