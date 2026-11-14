import type { Metadata } from "next";
import "./globals.css";
import "@/components/lime/styles.css";
import { LimePortalProvider } from "@/lib/lime/portal";
import { ConvexClientProvider } from "./convex-provider";

export const metadata: Metadata = {
  title: "Blobe",
  description: "A new web product for working adults.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="lime">
        <ConvexClientProvider>
          <LimePortalProvider>{children}</LimePortalProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
