import type { Metadata } from "next";
import localFont from "next/font/local";
import { AppHeader } from "../src/components/app-header";
import "./globals.css";

const openSans = localFont({
  src: "./fonts/OpenSans-Variable.ttf",
  variable: "--font-open-sans",
  weight: "300 800",
  display: "swap",
});
const initializeTheme = `(function(){try{var t=localStorage.getItem('sahaay-theme');document.documentElement.dataset.theme=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}})();`;
export const metadata: Metadata = {
  title: "Sahaay — a little help, every day",
  description: "Your everyday personal assistant.",
  icons: {
    icon: [
      {
        url: "/brand/logo-black-transparent.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/brand/logo-white-transparent.png",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    apple: "/brand/logo-black-on-white-bg.png",
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={openSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: initializeTheme }} />
      </head>
      <body>
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
