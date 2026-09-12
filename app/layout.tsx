import "./globals.css";
import { Providers } from "./provider";


export default function RootLayout({ children }:{ children:React.ReactNode}) {
  return (
    <html
      lang="en"
    ><head>
      
      <link rel="stylesheet" href = "https://cdn.jsdelivr.net/npm@tabler/icons-webfont@latest/tabler-icons.min.css"/>
    </head>
      <body>
        
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
