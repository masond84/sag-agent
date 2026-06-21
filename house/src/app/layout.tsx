import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAG House",
  description: "SAG agent home — skill tree, presence, and live activity",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
