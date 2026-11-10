import { connection } from "next/server";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { LienBouton } from "@/components/Bouton";
import { CarteSalle } from "@/components/CarteSalle";
import {
  IconeCalendrier,
  IconeCarteBancaire,
  IconeEcran,
  IconeFleche,
  IconeMallette,
} from "@/components/icones";
import { PhotoSalle } from "@/components/PhotoSalle";
import { listerSallesActives } from "@/lib/salles";

// Accueil (maquettes 01 et 02, plan de refonte) : seules les salles sont lues
// en base ; le reste de la page est une coquille statique. Aucun contenu de
// maquette qui ne soit vrai (pas d'adresse, pas de Wi-Fi, pas d'e-mail de
// confirmation), et un seul bouton cuivre.

// Atouts limités à ce que l'application tient réellement.
const ATOUTS: { icone: ReactNode; texte: string }[] = [
  { icone: <IconeCalendrier className="size-7" />, texte: "Réservation simple et rapide" },
  { icone: <IconeEcran className="size-7" />, texte: "Salles équipées" },
  { icone: <IconeCarteBancaire className="size-7" />, texte: "Paiement en ligne sécurisé" },
  { icone: <IconeMallette className="size-7" />, texte: "Cadre professionnel" },
];

// Le vrai parcours : choisir la salle, saisir le créneau (R1, R2), payer
// sous 15 minutes (R6) ; c'est le paiement qui confirme la réservation.
const ETAPES = [
  {
    titre: "Choisissez la salle",
    texte: "Selon le nombre de personnes et l'équipement dont vous avez besoin.",
  },
  {
    titre: "Indiquez la date et le créneau",
    texte: "Du lundi au vendredi, de 8 h à 20 h, au moins 1 h, par tranches de 30 minutes.",
  },
  {
    titre: "Payez en ligne sous 15 minutes",
    texte: "Et la salle est à vous.",
  },
];

// Largeur affichée des cartes : 1 colonne, puis 2 (sm), puis 4 (lg), dans
// un conteneur de 72 rem au plus.
const TAILLES_CARTE = "(min-width: 1024px) 270px, (min-width: 640px) 50vw, 100vw";

export default function Accueil() {
  return (
    <main className="flex-1">
      <Accroche />
      <Atouts />

      <section aria-labelledby="titre-salles" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
        <div className="text-center">
          <h2 id="titre-salles" className="text-titre-1 text-marine">
            Nos salles de réunion
          </h2>
        </div>
        <Suspense
          fallback={<p className="mt-8 text-center text-encre-douce">Chargement des salles…</p>}
        >
          <SallesAccueil />
        </Suspense>
      </section>

      <Etapes />
      <Horaires />
    </main>
  );
}

function Accroche() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-6 px-4 pt-8 pb-10 sm:px-6 md:grid-cols-2 md:gap-x-12 md:py-16">
      {/* Mobile (maquette 02) : titre, photo, puis bouton. Ordinateur
          (maquette 01) : texte et bouton à gauche, photo à droite. */}
      <div className="md:self-end">
        <h1 className="text-affiche text-marine">Un espace à la hauteur de vos idées</h1>
        <p className="mt-4 text-lg leading-7 text-encre-douce">
          Des salles de réunion équipées, à réserver à l&apos;heure et à payer en ligne.
        </p>
      </div>
      <PhotoSalle
        photo="/salles/conseil.jpg"
        nom="Salle du Conseil"
        sizes="(min-width: 768px) 50vw, 100vw"
        enPriorite
        className="aspect-[3/2] rounded-arrondi-l shadow-carte md:row-span-2"
      />
      <div className="md:col-start-1 md:row-start-2 md:self-start">
        <LienBouton href="/salles" variante="action" className="w-full md:w-auto">
          Découvrir nos salles
          <IconeFleche />
        </LienBouton>
      </div>
    </section>
  );
}

function Atouts() {
  return (
    <section aria-label="Nos atouts" className="border-y border-bordure bg-surface">
      <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-x-4 gap-y-6 px-4 py-6 sm:px-6 lg:grid-cols-4 lg:divide-x lg:divide-bordure">
        {ATOUTS.map(({ icone, texte }) => (
          <li
            key={texte}
            className="flex flex-col items-center gap-2 text-center text-petit font-semibold text-encre lg:flex-row lg:justify-center lg:gap-4 lg:px-4 lg:text-left lg:text-corps text-balance"
          >
            <span className="text-marine">{icone}</span>
            {texte}
          </li>
        ))}
      </ul>
    </section>
  );
}

async function SallesAccueil() {
  // Sans connection(), la requête (synchrone avec better-sqlite3) serait
  // exécutée au build et la liste figée dans la page.
  await connection();
  const salles = await listerSallesActives();

  if (salles.length === 0) {
    return (
      <p className="mt-8 text-center text-encre-douce">
        Aucune salle n&apos;est disponible pour le moment.
      </p>
    );
  }

  return (
    <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {salles.map((salle) => (
        <CarteSalle key={salle.id} salle={salle} sizes={TAILLES_CARTE} />
      ))}
    </ul>
  );
}

function Etapes() {
  return (
    <section aria-labelledby="titre-etapes" className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="rounded-arrondi-l bg-marine-clair px-5 py-10 md:px-10">
        <h2 id="titre-etapes" className="text-center text-titre-1 text-marine">
          Réservez en 3 étapes
        </h2>
        <ol className="mx-auto mt-8 max-w-sm space-y-6 md:grid md:max-w-none md:grid-cols-3 md:gap-10 md:space-y-0">
          {ETAPES.map(({ titre, texte }, index) => (
            <li
              key={titre}
              // Trait cuivre entre deux pastilles : vertical sur mobile,
              // court trait horizontal dans l'espace entre colonnes ensuite.
              className="relative flex gap-4 not-last:before:absolute not-last:before:top-12 not-last:before:-bottom-5 not-last:before:left-5 not-last:before:w-0.5 not-last:before:bg-cuivre/40 md:not-last:before:hidden md:not-last:after:absolute md:not-last:after:top-5 md:not-last:after:-right-8 md:not-last:after:h-0.5 md:not-last:after:w-6 md:not-last:after:bg-cuivre/40"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-cuivre font-titres text-titre-3 text-white">
                {index + 1}
              </span>
              <div>
                <h3 className="text-titre-3 text-marine">{titre}</h3>
                <p className="mt-1 text-petit text-encre-douce">{texte}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Horaires() {
  return (
    <section aria-label="Horaires d'ouverture" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
      <p className="flex items-center justify-center gap-4 rounded-arrondi-m bg-marine px-6 py-6 text-center font-titres text-titre-3 text-white md:text-titre-2">
        <IconeCalendrier className="size-8 shrink-0 text-cuivre-sur-marine" />
        {/* La plage horaire ne se coupe jamais en deux lignes. */}
        <span>
          Du lundi au vendredi, <span className="whitespace-nowrap">de 8 h à 20 h</span>
        </span>
      </p>
    </section>
  );
}
