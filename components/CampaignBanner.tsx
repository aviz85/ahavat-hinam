"use client";

const CAMPAIGN_START = new Date("2026-07-29T00:00:00+03:00");
const CAMPAIGN_END = new Date("2026-07-30T04:00:00+03:00");

export default function CampaignBanner() {
  const now = new Date();
  if (now < CAMPAIGN_START || now >= CAMPAIGN_END) return null;

  return (
    <div className="card px-5 py-4 mb-5 text-center bg-gradient-to-l from-rose/10 to-transparent">
      <p className="font-black text-rose-deep text-lg">💕 מבצע ט״ו באב — ניקוד כפול!</p>
      <p className="text-sm text-foreground/70 leading-relaxed mt-1">
        היום כל חיבוק שווה כפול — <b>גם עם בן/בת הזוג שלכם</b>. הזוגיות היא
        הגרעין של האהבה, ומשם היא מתפשטת החוצה. חבקו את מי שהכי קרוב אליכם,
        ותפיצו אהבה וחיוביות 🤗❤️
      </p>
    </div>
  );
}
