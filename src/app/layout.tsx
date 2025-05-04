import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./infinite-carousel.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PRIMOS",
  description: "Earn and use Primateria",
  metadataBase: new URL(
    process.env.NODE_ENV === 'production'
      ? 'https://app.primos.games'
      : 'http://localhost:3002'
  ),
  icons: {
    icon: '/images/favicon.png',
    apple: '/images/apple.png',
  },
  openGraph: {
    title: 'PRIMOS',
    description: 'Earn and use Primateria',
    images: ['/images/dailycheckin.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} antialiased`}
      >
        {children}
       
      </body>
    </html>
  );
}
