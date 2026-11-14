import type { Metadata } from "next";
import "./globals.css";
import "@/components/lime/styles.css";
import { LimePortalProvider } from "@/lib/lime/portal";

export const metadata: Metadata = {
  title: "BCup",
  description: "A new web product for working adults.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="lime">
        <LimePortalProvider>{children}</LimePortalProvider>
      </body>
    </html>
  );
}
