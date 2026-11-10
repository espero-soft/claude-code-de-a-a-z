import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DELAI_PAIEMENT_MS } from "@/lib/expiration";
import { FUSEAU_CENTRE } from "@/lib/reservation";
import {
  actualiserReservation,
  lireReservation,
  type ReservationLue,
} from "@/lib/suivi-paiement";
import { BoutonPayer } from "./BoutonPayer";

export const metadata: Metadata = {
  title: "Votre réservation",
};

const formatPrix = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatDate = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU_CENTRE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const formatHeure = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU_CENTRE,
  hour: "2-digit",
  minute: "2-digit",
});

const libelleStatut = {
  EN_ATTENTE: "En attente de paiement",
  CONFIRMEE: "Confirmée",
  ANNULEE: "Annulée",
} as const;

// Titre et explication affichés selon le statut.
const entete = {
  EN_ATTENTE: {
    surtitre: "Merci !",
    titre: "Demande de réservation enregistrée",
    texte: "Votre réservation sera confirmée dès réception du paiement.",
  },
  CONFIRMEE: {
    surtitre: "Paiement reçu",
    titre: "Réservation confirmée",
    texte: "Votre paiement a bien été reçu : la salle vous est réservée.",
  },
  ANNULEE: {
    surtitre: "Réservation annulée",
    titre: "Réservation annulée",
    texte:
      "Le paiement n'a pas été reçu dans les 15 minutes, ou le créneau a été confirmé entre-temps pour un autre client. Si un paiement a été prélevé, il vous est remboursé.",
  },
} as const;

// Règle R6 : à la consultation, une réservation en attente depuis plus de
// 15 minutes est annulée, et un paiement revenu de Stripe est vérifié puis
// confirmé (R3). Si Stripe ne répond pas, on affiche l'état connu en base.
async function chargerReservation(
  id: string,
): Promise<{ reservation: ReservationLue | null; verifiee: boolean }> {
  try {
    const { reservation } = await actualiserReservation(id, new Date());
    return { reservation, verifiee: true };
  } catch (erreur) {
    console.error("Vérification du paiement impossible", erreur);
    return { reservation: await lireReservation(id), verifiee: false };
  }
}

export default function ConfirmationPage({
  params,
}: PageProps<"/reservations/[id]">) {
  return (
    <main className="flex-1 bg-slate-50 px-6 py-16 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <Suspense
          fallback={<p className="text-slate-500">Chargement de la réservation…</p>}
        >
          {params.then(({ id }) => (
            <Confirmation id={id} />
          ))}
        </Suspense>
      </div>
    </main>
  );
}

async function Confirmation({ id }: { id: string }) {
  await connection();
  const { reservation, verifiee } = await chargerReservation(id);
  if (!reservation) {
    notFound();
  }
  const { surtitre, titre, texte } = entete[reservation.statut];
  const payerAvant = new Date(reservation.createdAt.getTime() + DELAI_PAIEMENT_MS);

  // Seuls les textes générés prennent une majuscule initiale : le nom et
  // l'e-mail saisis par le client s'affichent tels quels.
  const lignes = [
    { libelle: "Salle", valeur: reservation.salle.nom },
    {
      libelle: "Date",
      valeur: formatDate.format(reservation.debut),
      majuscule: true,
    },
    {
      libelle: "Horaire",
      valeur: `de ${formatHeure.format(reservation.debut)} à ${formatHeure.format(reservation.fin)}`,
      majuscule: true,
    },
    {
      libelle: "Montant",
      valeur: formatPrix.format(reservation.montantTotalCentimes / 100),
    },
    { libelle: "Statut", valeur: libelleStatut[reservation.statut] },
    { libelle: "Nom", valeur: reservation.nomClient },
    { libelle: "E-mail", valeur: reservation.emailClient },
  ];

  return (
    <article>
      <p className="text-sm font-semibold text-orange-600">{surtitre}</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight">{titre}</h1>
      <p className="mt-4 text-lg text-slate-600">{texte}</p>
      {reservation.statut === "EN_ATTENTE" && (
        <p className="mt-2 text-slate-600">
          À régler avant {formatHeure.format(payerAvant)}, sans quoi la réservation
          sera annulée.
        </p>
      )}
      {!verifiee && (
        <p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Le paiement n&apos;a pas pu être vérifié pour l&apos;instant. Rechargez la
          page dans quelques instants.
        </p>
      )}

      <dl className="mt-8 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-6 shadow-sm">
        {lignes.map(({ libelle, valeur, majuscule }) => (
          <div key={libelle} className="flex justify-between gap-4 py-4">
            <dt className="text-slate-500">{libelle}</dt>
            <dd
              className={`text-right font-medium ${majuscule ? "first-letter:uppercase" : ""}`}
            >
              {valeur}
            </dd>
          </div>
        ))}
      </dl>

      {reservation.statut === "EN_ATTENTE" ? (
        <BoutonPayer reservationId={reservation.id} />
      ) : (
        <Link
          href="/salles"
          className="mt-8 inline-flex items-center rounded-full bg-orange-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
        >
          Voir toutes les salles
        </Link>
      )}
    </article>
  );
}
