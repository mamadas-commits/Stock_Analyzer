import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stocks Analyzer",
  description: "Lokální analýza akcií z dat SEC EDGAR a denní historie cen.",
};

/*
 * Applies a saved light/dark choice before the first paint. Done inline rather
 * than in the toggle's effect, which runs only after hydration — by then a
 * dark-mode user has already seen a white page. Key matches THEME_KEY in
 * ThemeToggle.tsx.
 */
const THEME_BOOT = `try{var t=localStorage.getItem("stocksanalyzer.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The boot script sets data-theme before React hydrates; that difference is expected.
    <html lang="cs" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
