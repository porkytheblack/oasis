import type { Metadata } from "next";
import { Sora, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AuthenticatedLayout } from "@/components/authenticated-layout";

/**
 * Sora - Primary font family
 * A geometric sans-serif with distinctive rounded letterforms
 * Weights: 300 (light), 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
 */
const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

/**
 * IBM Plex Mono - Monospace font for code and technical content
 * Complements Sora with a clean, technical aesthetic
 */
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Oasis Admin Dashboard",
  description: "Admin dashboard for the Oasis Tauri Update Server",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${sora.variable} ${ibmPlexMono.variable} font-sans antialiased`}
      >
        <Providers>
          <AuthenticatedLayout>{children}</AuthenticatedLayout>
        </Providers>
      </body>
    </html>
  );
}
