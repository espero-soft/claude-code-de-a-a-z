import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { adminDisponible, ordonnerTickets } from "@/lib/admin-tickets";
import { prisma } from "@/lib/prisma";
import { FUSEAU_CENTRE } from "@/lib/reservation";
import { BoutonValider } from "./BoutonValider";

// En production, le 404 ne doit pas trahir l'écran par son titre.
export const metadata: Metadata = adminDisponible()
  ? {
      title: "Tickets du support",
      description:
        "Messages des clients triés par le modèle, avec un brouillon de réponse à relire.",
      robots: { index: false },
    }
  : {};

const formatPrix = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

const formatDate = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU_CENTRE,
  dateStyle: "full",
  timeStyle: "short",
});

const formatDateCourte = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU_CENTRE,
  dateStyle: "short",
  timeStyle: "short",
});

const libelleCategorie = {
  reservation: "Réservation",
  paiement: "Paiement",
  annulation: "Annulation",
  autre: "Autre",
} as const;

const urgences = {
  haute: { libelle: "Urgence haute", classe: "bg-red-100 text-red-800" },
  normale: { libelle: "Urgence normale", classe: "bg-amber-100 text-amber-800" },
  basse: { libelle: "Urgence basse", classe: "bg-slate-100 text-slate-700" },
} as const;

const libelleStatutReservation = {
  EN_ATTENTE: "en attente de paiement",
  CONFIRMEE: "confirmée",
  ANNULEE: "annulée",
} as const;

export default function TicketsPage() {
  // Pas de connexion dans le projet : en production, la page n'existe pas.
  // Appelé avant tout rendu, notFound() est résolu dès le build : la page
  // reste statique et répond un vrai 404.
  if (!adminDisponible()) {
    notFound();
  }

  return (
    <main className="flex-1 bg-slate-50 px-6 py-16 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold text-orange-600">Administration</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">Tickets du support</h1>
        <p className="mt-4 text-lg text-slate-600">
          Les messages des clients, triés par le modèle, les plus urgents d&apos;abord.
          Chaque brouillon est à relire : le valider ne l&apos;envoie pas au client.
        </p>

        <Suspense fallback={<p className="mt-10 text-slate-500">Chargement des tickets…</p>}>
          <ListeTickets />
        </Suspense>
      </div>
    </main>
  );
}

async function ListeTickets() {
  // better-sqlite3 répond de façon synchrone : sans connection(), Next
  // exécuterait la requête au build et figerait la liste.
  await connection();

  const tickets = ordonnerTickets(
    await prisma.ticket.findMany({
      include: {
        reservation: {
          select: {
            id: true,
            debut: true,
            statut: true,
            montantTotalCentimes: true,
            salle: { select: { nom: true } },
          },
        },
      },
    }),
  );

  if (tickets.length === 0) {
    return (
      <p className="mt-10 text-slate-600">
        Aucun ticket pour le moment. Lancer <code>npm run importer-tickets</code> pour
        importer les exemples.
      </p>
    );
  }

  return (
    <ol className="mt-10 space-y-6">
      {tickets.map((ticket) => {
        const urgence = urgences[ticket.urgence];
        const reservation = ticket.reservation;
        return (
          <li
            key={ticket.id}
            aria-labelledby={`resume-${ticket.id}`}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <ul aria-label="Tri" className="flex flex-wrap gap-2 text-sm font-medium">
              <li className="rounded-full bg-orange-100 px-3 py-1 text-orange-800">
                {libelleCategorie[ticket.categorie]}
              </li>
              <li className={`rounded-full px-3 py-1 ${urgence.classe}`}>{urgence.libelle}</li>
              {ticket.aTransmettre && (
                <li className="rounded-full bg-violet-100 px-3 py-1 text-violet-800">
                  Conseiller requis
                </li>
              )}
              {ticket.statut === "VALIDE" && (
                <li className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">
                  Brouillon validé
                </li>
              )}
            </ul>

            <h2 id={`resume-${ticket.id}`} className="mt-4 text-lg font-semibold">
              {ticket.resume}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {ticket.email} · reçu le {formatDateCourte.format(ticket.createdAt)}
            </p>

            {ticket.aTransmettre && ticket.motifTransmission && (
              <p className="mt-4 rounded-lg bg-violet-50 p-3 text-sm text-violet-900">
                À transmettre à un conseiller : {ticket.motifTransmission}
              </p>
            )}

            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex gap-2">
                <dt className="text-slate-500">Réservation :</dt>
                <dd>
                  {reservation ? (
                    <>
                      <Link
                        href={`/reservations/${reservation.id}`}
                        className="font-medium text-orange-600 hover:text-orange-700"
                      >
                        {reservation.salle.nom}
                      </Link>
                      , <span className="first-letter:uppercase">{formatDate.format(reservation.debut)}</span>,{" "}
                      {formatPrix.format(reservation.montantTotalCentimes / 100)},{" "}
                      {libelleStatutReservation[reservation.statut]}
                    </>
                  ) : (
                    "aucune"
                  )}
                </dd>
              </div>
            </dl>

            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-slate-600">Message du client</summary>
              <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-slate-700">
                {ticket.message}
              </p>
            </details>

            <section aria-label="Brouillon de réponse" className="mt-4">
              <h3 className="text-sm font-semibold text-slate-500">
                Brouillon de réponse (non envoyé)
              </h3>
              <p className="mt-2 whitespace-pre-line rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-800">
                {ticket.brouillon}
              </p>
            </section>

            {ticket.statut === "A_TRAITER" ? (
              <BoutonValider ticketId={ticket.id} />
            ) : (
              <p className="mt-4 text-sm text-emerald-700">
                Validé le {ticket.valideLe ? formatDateCourte.format(ticket.valideLe) : "?"}.
                Rien n&apos;a été envoyé au client.
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
