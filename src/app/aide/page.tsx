import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Aide : règles de réservation",
  description:
    "Durée, horaires, tarif et paiement : les règles à connaître avant de réserver une salle.",
};

// Les règles du cahier des charges (R1 à R6), reformulées pour les clients.
// Page sans donnée : simple composant serveur, prérendu au build.
const REGLES = [
  {
    titre: "Durée d'une réservation",
    texte:
      "Une réservation dure au minimum 1 heure, par tranches de 30 minutes : 1 h, 1 h 30, 2 h, et ainsi de suite. Elle commence et se termine à l'heure pile ou à la demie (9 h, 9 h 30…).",
  },
  {
    titre: "Jours et horaires d'ouverture",
    texte:
      "Le centre est ouvert du lundi au vendredi, de 8 h à 20 h (heure de Paris). Votre réservation doit commencer à 8 h au plus tôt et se terminer à 20 h au plus tard. Le centre est fermé le samedi et le dimanche.",
  },
  {
    titre: "Pas de réservation dans le passé",
    texte:
      "Vous ne pouvez réserver qu'un créneau à venir : une date ou une heure déjà passée est refusée.",
  },
  {
    titre: "Une salle, une réservation à la fois",
    texte:
      "Une salle ne peut pas accueillir deux réservations confirmées en même temps. Si le créneau choisi est déjà pris, le formulaire vous l'indique : choisissez un autre horaire ou une autre salle.",
  },
  {
    titre: "Calcul du montant",
    texte:
      "Le montant est le prix horaire de la salle multiplié par la durée. Par exemple, 1 h 30 dans une salle à 40 € de l'heure coûte 60 €. Le prix de chaque salle est affiché sur sa fiche.",
  },
  {
    titre: "Paiement sous 15 minutes",
    texte:
      "Votre réservation reste en attente jusqu'au paiement. Une réservation en attente de paiement depuis plus de 15 minutes est annulée automatiquement, et le créneau redevient libre.",
  },
];

export default function AidePage() {
  return (
    <main className="flex-1 bg-slate-50 px-6 py-16 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-bold tracking-tight">
          Règles de réservation
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          Avant de réserver une salle, voici ce qu&apos;il faut savoir. Le
          formulaire de réservation vérifie ces règles et vous signale tout
          créneau qui ne les respecte pas.
        </p>

        <ol className="mt-10 space-y-6">
          {REGLES.map((regle, index) => (
            <li
              key={regle.titre}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-semibold">
                <span className="text-orange-600">{index + 1}.</span>{" "}
                {regle.titre}
              </h2>
              <p className="mt-2 text-slate-700">{regle.texte}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10">
          <Link
            href="/salles"
            className="inline-flex items-center rounded-full bg-orange-600 px-5 py-2 font-semibold text-white shadow-sm transition hover:bg-orange-700"
          >
            Voir les salles
          </Link>
        </div>
      </div>
    </main>
  );
}
