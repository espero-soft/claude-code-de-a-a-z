import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LienBouton } from "@/components/Bouton";
import { Carte } from "@/components/Carte";
import {
  IconeCalendrier,
  IconeCarteBancaire,
  IconeEtiquette,
  IconeFleche,
  IconeHorloge,
  IconeMallette,
  IconeSablier,
} from "@/components/icones";
import { formaterDuree, formaterPrix } from "@/lib/format";

export const metadata: Metadata = {
  title: "Aide : règles de réservation",
  description:
    "Durée, horaires, tarif et paiement : les règles à connaître avant de réserver une salle.",
};

// Les règles du cahier des charges (R1 à R6), reformulées pour les clients,
// dans l'ordre d'un parcours de réservation. Maquette 03 (plan de refonte) :
// une rangée bordée par règle, icône à gauche, tout le texte visible (pas
// d'accordéon : rien d'important ne doit être caché derrière un clic).
// Page sans donnée : simple composant serveur, prérendu au build.
const REGLES: { icone: ReactNode; titre: string; texte: ReactNode; exemple: ReactNode }[] = [
  {
    // R1
    icone: <IconeHorloge />,
    titre: "Durée d'une réservation",
    texte:
      "Une réservation dure au minimum 1 heure, par tranches de 30 minutes : 1 h, 1 h 30, 2 h, et ainsi de suite. Elle commence et se termine à l'heure pile ou à la demie.",
    exemple: "De 9 h à 10 h 30 : accepté. De 9 h à 9 h 30 : trop court.",
  },
  {
    // R2
    icone: <IconeCalendrier />,
    titre: "Jours et horaires d'ouverture",
    texte: (
      <>
        Le centre est ouvert du lundi au vendredi, de 8 h à 20 h (heure de Paris). Votre
        réservation commence à 8 h au plus tôt et se termine à 20 h au plus tard. Le centre
        est fermé le samedi et le dimanche.
      </>
    ),
    exemple: "De 18 h 30 à 20 h : accepté. De 19 h à 21 h : refusé, le centre ferme à 20 h.",
  },
  {
    // R4
    icone: <IconeSablier />,
    titre: "Pas de réservation dans le passé",
    texte:
      "Vous ne pouvez réserver qu'un créneau à venir : une date ou une heure déjà passée est refusée.",
    exemple: "À 10 h, un créneau qui commence à 9 h 30 le même jour est refusé.",
  },
  {
    // R3
    icone: <IconeMallette />,
    titre: "Une salle, une réservation à la fois",
    texte:
      "Une salle ne peut pas accueillir deux réservations confirmées en même temps. Si le créneau choisi est déjà pris, le formulaire vous l'indique : choisissez un autre horaire ou une autre salle.",
    exemple:
      "Si Horizon est réservée de 14 h à 16 h, un créneau de 15 h à 17 h dans cette salle est refusé ; de 16 h à 17 h reste possible.",
  },
  {
    // R5
    icone: <IconeEtiquette />,
    titre: "Calcul du montant",
    texte:
      "Le montant est le prix horaire de la salle multiplié par la durée. Le prix de chaque salle est affiché sur sa fiche et rappelé avant le paiement.",
    exemple: `${formaterDuree(90)} dans une salle à ${formaterPrix(4000)} / heure : ${formaterPrix(6000)}.`,
  },
  {
    // R6
    icone: <IconeCarteBancaire />,
    titre: "Paiement sous 15 minutes",
    texte:
      "Votre réservation reste en attente jusqu'au paiement par carte. Une réservation en attente de paiement depuis plus de 15 minutes est annulée automatiquement, et le créneau redevient libre. Un paiement reçu trop tard vous est remboursé.",
    exemple:
      "Demande enregistrée à 14 h 10 : le paiement doit être fait avant 14 h 25. L'heure limite est affichée sur votre réservation.",
  },
];

export default function AidePage() {
  return (
    <main id="contenu" className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 md:py-16">
      <h1 className="text-titre-1 text-marine">Règles de réservation</h1>
      <span aria-hidden="true" className="mt-4 block h-1 w-16 rounded-full bg-cuivre" />
      <p className="mt-4 max-w-2xl text-lg leading-7 text-encre-douce">
        Avant de réserver une salle, voici ce qu&apos;il faut savoir. Le formulaire de
        réservation vérifie ces règles et vous signale tout créneau qui ne les respecte pas.
      </p>

      <ol className="mt-10 space-y-4">
        {REGLES.map((regle, index) => (
          <Carte
            as="li"
            key={regle.titre}
            className="flex flex-col gap-4 sm:flex-row sm:gap-5"
          >
            <span
              aria-hidden="true"
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-marine-clair text-marine"
            >
              {regle.icone}
            </span>
            <div className="min-w-0">
              <p className="sur-titre text-encre-douce">Règle {index + 1}</p>
              <h2 className="mt-1 text-titre-3 text-marine">{regle.titre}</h2>
              <p className="mt-2 leading-7 text-encre">{regle.texte}</p>
              <p className="mt-3 rounded-arrondi-s bg-fond px-4 py-3 text-petit text-encre">
                <span className="font-bold">Exemple : </span>
                {regle.exemple}
              </p>
            </div>
          </Carte>
        ))}
      </ol>

      <div className="mt-10 flex flex-col items-start gap-4 rounded-arrondi-m bg-marine-clair p-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-titres text-titre-3 text-marine">Prêt à réserver ?</p>
        <LienBouton href="/salles" className="w-full sm:w-auto">
          Voir nos salles
          <IconeFleche />
        </LienBouton>
      </div>
    </main>
  );
}
