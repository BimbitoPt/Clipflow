import type { Metadata } from "next";
import { Archivo_Black, Inter } from "next/font/google";
import "./globals.css";

const archivo = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Clipflow — idea in, video out",
  description:
    "Clipflow writes the script, records the voice, cuts the captions and renders the b-roll. You type one line. You get a finished short. Join the waitlist.",
  icons: { icon: "/brand/mark.png" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${archivo.variable} ${inter.variable}`}>
        {children}
      </body>
    </html>
  );
}
