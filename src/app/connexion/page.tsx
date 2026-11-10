import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Encadre } from "@/components/Encadre";
import { lireCompte } from "@/lib/compte";
import { cheminDeRetour } from "@/lib/connexion";
import { FormulaireConnexion } from "./FormulaireConnexion";

export const metadata: Metadata = {
  title: "Connexion",
  description:
    "Connectez-vous à Réunéa avec un code reçu par e-mail, sans mot de passe.",
};

// Connexion sans mot de passe (SECURITE.md, section 7), d'après les
// maquettes 01 et 02 du module 12 : on en reprend le style (photo de salle,
// titre à trait cuivre, carte blanche), pas le contenu, dessiné pour un
// mot de passe. Un seul écran sert aussi d'inscription : le compte est créé
// au premier code validé.
// Coquille statique (photo, titre, texte) ; la session est lue en flux sous
// <Suspense> pour rediriger une personne déjà connectée.
export default function ConnexionPage({ searchParams }: PageProps<"/connexion">) {
  return (
    <main id="contenu" className="flex-1">
      <div className="mx-auto grid max-w-6xl lg:grid-cols-2 lg:items-center lg:gap-12 lg:px-6 lg:py-10">
        {/* Mobile (maquette 02) : bandeau photo, puis titre et carte.
            Ordinateur (maquette 01) : photo à gauche avec le titre posé
            dessus (dégradé clair pour le contraste), carte à droite. */}
        <div className="relative lg:min-h-[38rem] lg:overflow-hidden lg:rounded-arrondi-l lg:shadow-carte">
          <div className="relative aspect-[16/7] lg:absolute lg:inset-0 lg:aspect-auto">
            <Image
              src="/salles/conseil.jpg"
              alt=""
              fill
              priority
              sizes="(min-width: 1152px) 552px, (min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 hidden h-3/4 bg-gradient-to-b from-fond via-fond/90 to-transparent lg:block"
            />
          </div>
          <header className="relative mx-4 mt-6 border-l-4 border-cuivre pl-4 sm:mx-6 lg:m-0 lg:mx-10 lg:mt-10">
            <p className="hidden font-semibold text-encre lg:block">
              Centre de démonstration : projet de formation
            </p>
            <h1 className="text-titre-1 text-marine lg:mt-2 lg:text-affiche">
              Bienvenue chez Réunéa
            </h1>
            <p className="mt-2 text-encre-douce lg:text-encre">
              Pas de mot de passe : recevez un code par{" "}
              <span className="whitespace-nowrap">e-mail</span> pour vous connecter.
            </p>
          </header>
        </div>

        <div className="px-4 pt-6 pb-12 sm:px-6 lg:px-0 lg:py-0">
          <section
            aria-labelledby="titre-formulaire"
            className="rounded-arrondi-l border border-bordure bg-surface p-6 shadow-carte sm:p-8"
          >
            <Suspense fallback={<p className="text-encre-douce">Chargement du formulaire…</p>}>
              {searchParams.then(({ retour }) => (
                <Formulaire retour={cheminDeRetour(retour)} />
              ))}
            </Suspense>
          </section>

          <Encadre ton="information" titre="Première connexion ?" className="mt-6">
            Votre compte est créé dès que vous saisissez votre premier code. Le
            code est valable 5 minutes et ne sert qu&apos;une fois.
          </Encadre>
        </div>
      </div>
    </main>
  );
}

// Déjà connecté : rien à faire ici, on repart vers la page demandée.
async function Formulaire({ retour }: { retour: string }) {
  if (await lireCompte()) {
    redirect(retour);
  }
  return <FormulaireConnexion retour={retour} />;
}
