import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import { headers } from "next/headers";
import { ThemeProvider } from "next-themes";
import { appUrl } from "@/lib/notify";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Documents only — memos, docs and LP letters read like documents.
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

// Mirrors --chrome in globals.css (the browser bar can't read a CSS variable).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f6" },
    { media: "(prefers-color-scheme: dark)", color: "#090a0c" },
  ],
};

/**
 * Site-wide defaults. `metadataBase` is this deployment's own URL, so the
 * canonical link and the share image point at the club's copy rather than at
 * a hard-coded host. Open Graph and Twitter deliberately carry no title or
 * description here: each page's own are used, so a shared /apply link reads
 * as the club's form and not as the landing page. Icons, the share image, the
 * manifest, robots.txt and the sitemap are the files next to this one.
 * Indexing is decided per route group: the signed-in app, sign-in and
 * onboarding opt out in their own layouts.
 */
export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: { default: "OpenVenture", template: "%s · OpenVenture" },
  description:
    "The open-source operating system for student-run venture funds and grant programs.",
  applicationName: "OpenVenture",
  openGraph: { type: "website", siteName: "OpenVenture", locale: "en_US" },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: "OpenVenture", statusBarStyle: "default" },
  formatDetection: { telephone: false, email: false, address: false },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The proxy issues a per-request CSP nonce; next-themes' pre-paint script
  // is the one inline script in the document and has to carry it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable}`}
    >
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          <div className="print:hidden">
            <Toaster position="bottom-right" />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
