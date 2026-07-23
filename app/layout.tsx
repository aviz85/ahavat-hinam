import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
});

export const metadata: Metadata = {
  title: "אהבת חינם ❤️",
  description: "מצאו את מי שהכי הפוך מכם בהשקפה — ותנו לו חיבוק",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "אהבת חינם",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#e85d75",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${heebo.variable} min-h-full flex flex-col antialiased`}>
        {children}
      </body>
    </html>
  );
}
