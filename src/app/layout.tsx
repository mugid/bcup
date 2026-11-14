import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BCup",
  description: "A new web product for working adults.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
