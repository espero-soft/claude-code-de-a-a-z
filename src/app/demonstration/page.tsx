import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LienBouton } from "@/components/Bouton";
import { Carte } from "@/components/Carte";
import {
  IconeCalendrier,
  IconeCarteBancaire,
  IconeFleche,
  IconePersonne,
  IconeSablier,
} from "@/components/icones";

export const metadata: Metadata = {
  title: "Site de démonstration",
  description:
    "Réunéa est un site de démonstration : paiements simulés, réservations non réelles, site temporaire.",
};

// Page « Démonstration » (décision D10 de design/PLAN-PRODUCTION.md : elle
// tient lieu de mentions, ce n'est pas une ouverture commerciale). Liée par le
// bandeau de chaque page et par la navigation. Page sans donnée : simple
// composant serveur, prérendu au build.
const POINTS: { icone: ReactNode; titre: string; texte: ReactNode }[] = [
  {
    icone: <IconeCarteBancaire />,
    titre: "Les paiements sont simulés",
    texte: (
      <>
        Le paiement passe par Stripe en mode test : aucune somme n&apos;est jamais prélevée.
        N&apos;indiquez pas votre vraie carte. Utilisez la carte de test{" "}
        <strong className="whitespace-nowrap">4242 4242 4242 4242</strong>, avec une date
        d&apos;expiration à venir et trois chiffres quelconques au dos.
      </>
    ),
  },
  {
    icone: <IconeCalendrier />,
    titre: "Les réservations ne sont pas réelles",
    texte:
      "Les salles et le centre d'affaires sont fictifs. Une réservation confirmée bloque le créneau sur ce site seulement : aucune salle ne vous attend.",
  },
  {
    icone: <IconePersonne />,
    titre: "Vos données",
    texte: (
      <>
        Votre adresse e-mail sert à vous envoyer le code de connexion, et votre nom à
        identifier vos réservations. Pour la sécurité, les connexions sont enregistrées
        (date, adresse IP, navigateur) et effacées au bout de 90 jours. Vous pouvez supprimer
        votre compte à tout moment depuis « Mon profil ».
      </>
    ),
  },
  {
    icone: <IconeSablier />,
    titre: "Un site temporaire",
    texte:
      "Réunéa est le projet fil rouge d'une formation. Le serveur et toutes ses données seront supprimés à la fin du tournage.",
  },
];

export default function DemonstrationPage() {
  return (
    <main id="contenu" className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 md:py-16">
      <h1 className="text-titre-1 text-marine">Site de démonstration</h1>
      <span aria-hidden="true" className="mt-4 block h-1 w-16 rounded-full bg-cuivre" />
      <p className="mt-4 max-w-2xl text-lg leading-7 text-encre-douce">
        Vous pouvez tout essayer : chercher une salle, réserver un créneau, payer et suivre
        vos réservations. Rien n&apos;est facturé, et rien n&apos;est réservé pour de vrai.
      </p>

      <ul className="mt-10 space-y-4">
        {POINTS.map((point) => (
          <Carte as="li" key={point.titre} className="flex flex-col gap-4 sm:flex-row sm:gap-5">
            <span
              aria-hidden="true"
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-marine-clair text-marine"
            >
              {point.icone}
            </span>
            <div className="min-w-0">
              <h2 className="text-titre-3 text-marine">{point.titre}</h2>
              <p className="mt-2 leading-7 text-encre">{point.texte}</p>
            </div>
          </Carte>
        ))}
      </ul>

      <div className="mt-10 flex flex-col items-start gap-4 rounded-arrondi-m bg-marine-clair p-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-titres text-titre-3 text-marine">Envie d&apos;essayer ?</p>
        <LienBouton href="/salles" className="w-full sm:w-auto">
          Voir nos salles
          <IconeFleche />
        </LienBouton>
      </div>
    </main>
  );
}
