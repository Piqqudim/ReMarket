import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./provider";

export const metadata: Metadata = {
  title: "ReMarket",
  description: "Find it nearby",
  icons: {
    icon: "/icon.jpg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm@tabler/icons-webfont@latest/tabler-icons.min.css"
        />
      </head>

      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}