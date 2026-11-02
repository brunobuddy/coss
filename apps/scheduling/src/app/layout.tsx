import "./globals.css";
import { fontMono, fontSans } from "@coss/ui/fonts";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Scheduling", template: "%s" },
  // These pages are reached by their own link only.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      className={`${fontSans.variable} ${fontMono.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        {/* What an embedding page's iframe fits (`reportHeight`): the content, not the viewport. */}
        <div data-embed-content="">{children}</div>
      </body>
    </html>
  );
}
