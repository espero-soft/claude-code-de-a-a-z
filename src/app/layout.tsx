import type { Metadata } from "next";
import { Manrope, Playfair_Display } from "next/font/google";
import { Suspense } from "react";
import { BarreEnTete, EnTete } from "@/components/EnTete";
import { PiedDePage } from "@/components/PiedDePage";
import "./globals.css";

// Polices de la charte, auto-hébergées par next/font (aucune requête vers
// Google depuis le navigateur). Les variables sont reprises par @theme
// (globals.css) dans font-titres et font-sans.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Réunéa : salles de réunion à l'heure",
  description:
    "Réservez une salle de réunion à l'heure et payez en ligne. Centre de démonstration : projet de formation.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${playfair.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Avec Cache Components, usePathname suspend sur les routes à
            paramètre inconnu au build (/salles/[id]) : la barre sans lien
            actif sert de fallback pendant le prérendu. */}
        <Suspense fallback={<BarreEnTete cheminActif={null} />}>
          <EnTete />
        </Suspense>
        {children}
        <PiedDePage />
      </body>
    </html>
  );
}
