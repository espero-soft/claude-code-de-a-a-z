import type { Metadata } from "next";
import { Manrope, Playfair_Display } from "next/font/google";
import { Suspense } from "react";
import { BarreEnTete, EnTete } from "@/components/EnTete";
import { PiedDePage } from "@/components/PiedDePage";
import { ZoneCompte } from "@/components/ZoneCompte";
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
        {/* Lien d'évitement : premier arrêt du clavier, visible au focus.
            Chaque page porte id="contenu" sur son <main>. */}
        <nav aria-label="Accès rapide">
          <a
            href="#contenu"
            className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-arrondi-s focus:bg-surface focus:px-4 focus:font-semibold focus:text-marine focus:shadow-carte"
          >
            Aller au contenu
          </a>
        </nav>
        {/* Avec Cache Components, usePathname suspend sur les routes à
            paramètre inconnu au build (/salles/[id]) : la barre sans lien
            actif sert de fallback pendant le prérendu. */}
        <Suspense fallback={<BarreEnTete cheminActif={null} />}>
          <EnTete
            liensCompte={<ZoneCompte disposition="liens" />}
            compteOrdinateur={<ZoneCompte disposition="ordinateur" />}
            compteMobile={<ZoneCompte disposition="mobile" />}
            compteMenu={<ZoneCompte disposition="menu" />}
          />
        </Suspense>
        {children}
        <PiedDePage />
      </body>
    </html>
  );
}
