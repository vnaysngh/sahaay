import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Sahaay — a little help, every day",
  description: "Your everyday personal assistant.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
