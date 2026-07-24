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

// build-time constant; strict format check so nothing unexpected is inlined
const RAW_GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "";
const GA_ID = /^G-[A-Z0-9]{4,16}$/.test(RAW_GA_ID) ? RAW_GA_ID : null;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${heebo.variable} min-h-full flex flex-col antialiased`}>
        {children}
        {GA_ID && (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`,
              }}
            />
          </>
        )}
      </body>
    </html>
  );
}
