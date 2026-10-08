"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

const links = [
  ["/state", "Your space"],
  ["/documents", "Documents"],
  ["/inbox", "Inbox"],
  ["/", "Talk to Sahaay"],
  ["/connect/telegram", "Connect Telegram"],
] as const;
export function AppHeader() {
  const pathname = usePathname();
  return (
    <header className="app-header">
      <Link href="/" className="app-brand" aria-label="Sahaay home">
        <Logo />
      </Link>
      <nav aria-label="Sahaay navigation">
        {links.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            prefetch={false}
            aria-current={pathname === href ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <ThemeToggle />
    </header>
  );
}
