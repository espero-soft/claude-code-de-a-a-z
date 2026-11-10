import type { Metadata } from "next";
import { LienBouton } from "@/components/Bouton";
import { Encadre } from "@/components/Encadre";

export const metadata: Metadata = {
  title: "Compte supprimé",
  description: "Votre compte Réunéa est supprimé.",
  robots: { index: false },
};

// Arrivée après la suppression d'un compte (src/app/profil/actions.ts).
// Page statique, sans rien de personnel : elle dit la même chose à tous.
export default function CompteSupprimePage() {
  return (
    <main id="contenu" className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 md:py-12">
      <header className="border-l-4 border-cuivre pl-4">
        <h1 className="text-titre-1 text-marine">Votre compte est supprimé</h1>
      </header>
      <Encadre ton="information" className="mt-6">
        Votre nom, votre adresse e-mail et vos connexions sont effacés, sur tous vos appareils. Vos
        réservations payées restent dans notre comptabilité, anonymisées. Un dernier e-mail vous le
        confirme.
      </Encadre>
      <p className="mt-6 text-encre">
        Merci d&apos;avoir choisi Réunéa. Vous pourrez toujours réserver avec un nouveau compte.
      </p>
      <LienBouton href="/" variante="principal" className="mt-6">
        Retour à l&apos;accueil
      </LienBouton>
    </main>
  );
}
