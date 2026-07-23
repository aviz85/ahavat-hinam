"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BottomNav() {
  const path = usePathname();
  const item = (href: string, label: string, icon: string) => (
    <Link
      href={href}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 font-bold text-sm ${
        path === href ? "text-rose-deep" : "text-foreground/50"
      }`}
    >
      <span className="text-2xl">{icon}</span>
      {label}
    </Link>
  );
  return (
    <nav className="sticky bottom-0 flex card !rounded-b-none !rounded-t-3xl mx-2">
      {item("/mission", "המשימה", "🎯")}
      {item("/feed", "הפיד", "❤️")}
    </nav>
  );
}
