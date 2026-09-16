import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clipflow — idea in, video out",
  description:
    "idea in, video out. Clipflow turns a rough idea into a vertical marketing video.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased"
        style={{ backgroundColor: "var(--background)", color: "var(--foreground)" }}
      >
        {children}
      </body>
    </html>
  );
}
