import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Badge, type TonBadge } from "@/components/Badge";
import { Carte } from "@/components/Carte";
import { Encadre } from "@/components/Encadre";
import {
  IconeAlerte,
  IconeEnveloppe,
  IconeHorloge,
  IconePersonne,
} from "@/components/icones";
import { lireUtilisateur } from "@/lib/acces";
import { ordonnerTickets } from "@/lib/admin-tickets";
import { adresseConnexion } from "@/lib/connexion";
import { formaterHeure, formaterPlage, formaterPrix } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { FUSEAU_CENTRE } from "@/lib/reservation";
import { peut } from "@/lib/roles";
import { BoutonValider } from "./BoutonValider";

// Titre neutre : la page répond 404 à qui n'est pas du personnel.
export const metadata: Metadata = {
  title: "Administration",
  robots: { index: false },
};

const formatJour = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU_CENTRE,
  day: "numeric",
  month: "long",
  year: "numeric",
});

const formatJourComplet = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU_CENTRE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

// « 10 novembre 2026 à 14 h 05 » (charte : heures « 14 h 05 », pas « 14:05 »).
function formaterMoment(date: Date): string {
  return `${formatJour.format(date)} à ${formaterHeure(date)}`;
}

const libelleCategorie = {
  reservation: "Réservation",
  paiement: "Paiement",
  annulation: "Annulation",
  autre: "Autre",
} as const;

// Plan de refonte : urgence haute en `erreur`, normale en `attente`, basse
// neutre ; toujours écrite en toutes lettres.
const urgences: Record<"haute" | "normale" | "basse", { libelle: string; ton: TonBadge; icone: ReactNode }> = {
  haute: { libelle: "Urgence haute", ton: "erreur", icone: <IconeAlerte className="size-4" /> },
  normale: { libelle: "Urgence normale", ton: "attente", icone: null },
  basse: { libelle: "Urgence basse", ton: "neutre", icone: null },
};

const libelleStatutReservation = {
  EN_ATTENTE: "en attente de paiement",
  CONFIRMEE: "confirmée",
  ANNULEE: "annulée",
} as const;

// Maquette 05, sans ce qui n'existe pas (plan de refonte) : ni filtres, ni
// menu « Clients » ou « Administration », ni numéro de ticket inventé, ni nom
// de client (un ticket n'a qu'un e-mail), ni brouillon modifiable.
// Réservé à l'employé et à l'administrateur (capacité « tickets »). Tout le
// contenu, titre compris, est derrière le contrôle : la coquille statique ne
// contient que le <main>. Le proxy renvoie déjà ailleurs les visiteurs sans
// cookie et les comptes sans rôle ; on revérifie ici (src/lib/acces.ts).
export default function TicketsPage() {
  return (
    <main id="contenu" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 md:py-16">
      <Suspense fallback={<p className="text-encre-douce">Chargement…</p>}>
        <EcranTickets />
      </Suspense>
    </main>
  );
}

async function EcranTickets() {
  await connection();
  const utilisateur = await lireUtilisateur();
  if (!utilisateur) {
    redirect(adresseConnexion("/admin/tickets"));
  }
  // Un client reçoit la même réponse qu'une page inexistante.
  if (!peut(utilisateur.role, "tickets")) {
    notFound();
  }

  return (
    <>
      <p className="sur-titre text-encre-douce">Administration</p>
      <h1 className="mt-2 text-titre-1 text-marine">Tickets du support</h1>
      <span aria-hidden="true" className="mt-4 block h-1 w-16 rounded-full bg-cuivre" />
      <p className="mt-4 max-w-2xl text-lg leading-7 text-encre-douce">
        Les messages des clients, triés par le modèle, les plus urgents d&apos;abord. Chaque
        brouillon est à relire : le valider ne l&apos;envoie pas au client.
      </p>

      <Suspense fallback={<p className="mt-10 text-encre-douce">Chargement des tickets…</p>}>
        <ListeTickets />
      </Suspense>
    </>
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
            fin: true,
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
      <p className="mt-10 text-encre-douce">
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
        const idResume = `resume-${ticket.id}`;
        return (
          <Carte
            as="li"
            key={ticket.id}
            aria-labelledby={idResume}
            avecMarge={false}
            className="grid overflow-hidden md:grid-cols-[15rem_minmax(0,1fr)]"
          >
            {/* Zone de gauche : statut, tri du modèle et date de réception. */}
            <div className="border-b border-bordure bg-fond/60 p-5 md:border-r md:border-b-0 md:p-6">
              <ul aria-label="Tri du ticket" className="flex flex-wrap gap-2 md:flex-col md:items-start">
                <li>
                  {ticket.statut === "VALIDE" ? (
                    <Badge ton="succes">Brouillon validé</Badge>
                  ) : (
                    <Badge ton="contour" icone={<IconeHorloge className="size-4" />}>
                      À traiter
                    </Badge>
                  )}
                </li>
                <li>
                  <Badge ton={urgence.ton} icone={urgence.icone}>
                    {urgence.libelle}
                  </Badge>
                </li>
                <li>
                  <Badge ton="accent" icone={null}>
                    {libelleCategorie[ticket.categorie]}
                  </Badge>
                </li>
                {ticket.aTransmettre && (
                  <li>
                    <Badge ton="neutre" icone={<IconePersonne className="size-4" />}>
                      Conseiller requis
                    </Badge>
                  </li>
                )}
              </ul>
              <p className="mt-4 text-petit text-encre-douce">
                Reçu le {formaterMoment(ticket.createdAt)}
              </p>
            </div>

            {/* Zone de droite : résumé, message, brouillon, action. */}
            <div className="min-w-0 p-5 md:p-6">
              <h2 id={idResume} className="text-titre-3 text-marine">
                {ticket.resume}
              </h2>
              <p className="mt-1 flex items-center gap-2 text-petit text-encre-douce">
                <IconeEnveloppe className="size-4 shrink-0" />
                <span className="break-all">{ticket.email}</span>
              </p>

              {ticket.aTransmettre && ticket.motifTransmission && (
                <Encadre ton="information" titre="À transmettre à un conseiller" className="mt-4">
                  <span className="first-letter:uppercase inline-block">
                    {ticket.motifTransmission}
                  </span>
                </Encadre>
              )}

              <dl className="mt-4 text-petit">
                <dt className="inline text-encre-douce">Réservation : </dt>
                <dd className="inline">
                  {reservation ? (
                    <>
                      <Link
                        href={`/reservations/${reservation.id}`}
                        className="rounded-arrondi-s font-semibold text-marine underline underline-offset-4 hover:text-marine-fonce"
                      >
                        {reservation.salle.nom}
                      </Link>
                      , {formatJourComplet.format(reservation.debut)},{" "}
                      {formaterPlage(reservation.debut, reservation.fin)},{" "}
                      {formaterPrix(reservation.montantTotalCentimes)},{" "}
                      {libelleStatutReservation[reservation.statut]}
                    </>
                  ) : (
                    "aucune"
                  )}
                </dd>
              </dl>

              {/* Des <div> et non des <section> nommées : quatre tickets
                  donneraient quatre repères « Message du client » identiques.
                  Les titres h3 suffisent à la navigation. */}
              <div className="mt-5">
                <h3 className="font-sans text-petit font-bold text-encre">Message du client</h3>
                <p className="mt-2 rounded-arrondi-s bg-fond px-4 py-3 whitespace-pre-line text-encre">
                  {ticket.message}
                </p>
              </div>

              <div className="mt-5">
                <h3 className="font-sans text-petit font-bold text-encre">
                  Brouillon de réponse{" "}
                  <span className="font-normal text-encre-douce">(non envoyé)</span>
                </h3>
                <p className="mt-2 rounded-arrondi-s border border-bordure border-l-4 border-l-marine bg-surface px-4 py-3 leading-7 whitespace-pre-line text-encre">
                  {ticket.brouillon}
                </p>
              </div>

              {ticket.statut === "A_TRAITER" ? (
                <BoutonValider ticketId={ticket.id} />
              ) : (
                <p className="mt-4 text-petit font-semibold text-succes">
                  Validé le {ticket.valideLe ? formaterMoment(ticket.valideLe) : "?"}. Rien
                  n&apos;a été envoyé au client.
                </p>
              )}
            </div>
          </Carte>
        );
      })}
    </ol>
  );
}
