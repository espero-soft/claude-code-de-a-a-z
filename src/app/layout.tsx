import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { BarreNavigation, Navigation } from "./Navigation";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Réservation : projet fil rouge",
  description: "Projet fil rouge de la formation Claude Code de A à Z",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Avec Cache Components, usePathname suspend sur les routes à
            paramètre inconnu au build (/salles/[id]) : la barre sans lien
            actif sert de fallback pendant le prérendu. */}
        <Suspense fallback={<BarreNavigation cheminActif={null} />}>
          <Navigation />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
