import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CLIPFLOW Remotion Studio",
  description: "Local studio for planning, reviewing and rendering branded short videos.",
  icons: { icon: "/brand/mark.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
