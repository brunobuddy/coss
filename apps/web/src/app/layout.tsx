import "@coss/ui/globals.css";
import { fontMono, fontSans } from "@coss/ui/fonts";
import type { Metadata } from "next";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: { default: "coss.com", template: "%s · coss.com" },
  description: "One API key and one SDK for email and more.",
  // Only the sign-in and sign-up pages are for search engines (src/lib/public-metadata.ts).
  robots: { index: false, follow: false },
  // Served by the site (it owns coss.com's root files, see ZONE_ROUTES in @coss/auth/slugs).
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // next-themes sets the `dark` class before hydration.
    <html
      className={`${fontSans.variable} ${fontMono.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-sidebar font-sans text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
