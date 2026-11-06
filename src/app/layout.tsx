// src/app/layout.tsx
import React from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { GlobalErrorCatcher } from "@/components/GlobalErrorCatcher";
import { Toaster } from "@/components/ui/sonner";
import { TotalumLimitModal } from "@/components/workspace/TotalumLimitModal";
import { BRAND } from "@/lib/brand";

/*
  ⭐ Geist stands in for the reference's licensed grotesk: same neutral voice, a variable
  weight axis (the "medium" of this theme is 480, not 500) and free.
*/
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

/* The favicon is `src/app/icon.svg`, picked up by Next automatically. */
export const metadata: Metadata = {
  title: BRAND.metaTitle,
  description: BRAND.metaDescription,
  applicationName: BRAND.name,
  openGraph: {
    title: BRAND.metaTitle,
    description: BRAND.metaDescription,
    siteName: BRAND.name,
    type: "website",
  },
  twitter: { card: "summary_large_image", title: BRAND.metaTitle, description: BRAND.metaDescription },
};

// SUPER IMPORTANT: NOT EDIT THE FOLLOWING 2 LINES TO FORCE NEXT.JS TO RENDER DYNAMICALLY
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <GlobalErrorCatcher />
        <Toaster position="top-right" richColors />
        {/*
          ⭐ MOUNTED ONCE FOR THE WHOLE APP. A Totalum limit (credits, projects) can hit on any
          screen, and the modal listens for the event the VCaaS client raises rather
          than being wired per page. See `TotalumLimitModal`.
        */}
        <TotalumLimitModal />
        <div className="min-h-screen flex flex-col">
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
