import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { FUSEAU_CENTRE } from "@/lib/reservation";

export const metadata: Metadata = {
  title: "Demande de réservation enregistrée",
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
  EN_ATTENTE: "En attente de confirmation",
  CONFIRMEE: "Confirmée",
  ANNULEE: "Annulée",
} as const;

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
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: { salle: { select: { id: true, nom: true } } },
  });
  if (!reservation) {
    notFound();
  }

  const lignes = [
    { libelle: "Salle", valeur: reservation.salle.nom },
    { libelle: "Date", valeur: formatDate.format(reservation.debut) },
    {
      libelle: "Horaire",
      valeur: `de ${formatHeure.format(reservation.debut)} à ${formatHeure.format(reservation.fin)}`,
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
      <p className="text-sm font-semibold text-orange-600">Merci !</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight">
        Demande de réservation enregistrée
      </h1>
      <p className="mt-4 text-lg text-slate-600">
        Votre demande est en attente de confirmation par le centre.
      </p>

      <dl className="mt-8 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-6 shadow-sm">
        {lignes.map(({ libelle, valeur }) => (
          <div key={libelle} className="flex justify-between gap-4 py-4">
            <dt className="text-slate-500">{libelle}</dt>
            <dd className="text-right font-medium first-letter:uppercase">{valeur}</dd>
          </div>
        ))}
      </dl>

      <Link
        href="/salles"
        className="mt-8 inline-flex items-center rounded-full bg-orange-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
      >
        Voir toutes les salles
      </Link>
    </article>
  );
}
