import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { BadgeStatut } from "@/components/Badge";
import { LienBouton } from "@/components/Bouton";
import { Carte } from "@/components/Carte";
import { Encadre } from "@/components/Encadre";
import {
  IconeCalendrier,
  IconeCoche,
  IconeEnveloppe,
  IconeFermer,
  IconeFleche,
  IconeHorloge,
  IconeMallette,
  IconePersonne,
  IconePersonnes,
  IconeSablier,
} from "@/components/icones";
import { PhotoSalle } from "@/components/PhotoSalle";
import { DELAI_PAIEMENT_MS } from "@/lib/expiration";
import { formaterDuree, formaterHeure, formaterPlage, formaterPrix } from "@/lib/format";
import { motifAnnulation, type MotifAnnulation } from "@/lib/motif-annulation";
import { FUSEAU_CENTRE } from "@/lib/reservation";
import { obtenirStripe } from "@/lib/stripe";
import {
  actualiserReservation,
  lireReservation,
  type ReservationLue,
} from "@/lib/suivi-paiement";
import { BoutonPayer } from "./BoutonPayer";
import { DelaiRestant } from "./DelaiRestant";

export const metadata: Metadata = {
  title: "Votre réservation",
};

const formatDate = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU_CENTRE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

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

// Réservation annulée : relit sa session Checkout (lecture seule, rien n'est
// modifié) pour savoir si un paiement a été encaissé puis remboursé.
async function chargerMotif(reservation: ReservationLue): Promise<MotifAnnulation> {
  if (!reservation.stripeSessionId) return motifAnnulation(reservation, null);
  try {
    const session = await obtenirStripe().checkout.sessions.retrieve(
      reservation.stripeSessionId,
      { expand: ["payment_intent.latest_charge"] },
    );
    return motifAnnulation(reservation, session);
  } catch (erreur) {
    console.error("Lecture du paiement impossible", erreur);
    return motifAnnulation(reservation, "indisponible");
  }
}

export default function ReservationPage({ params }: PageProps<"/reservations/[id]">) {
  return (
    <main id="contenu" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 md:py-12">
      <Suspense fallback={<p className="text-encre-douce">Chargement de la réservation…</p>}>
        {params.then(({ id }) => (
          <SuiviReservation id={id} />
        ))}
      </Suspense>
    </main>
  );
}

async function SuiviReservation({ id }: { id: string }) {
  await connection();
  const { reservation, verifiee } = await chargerReservation(id);
  if (!reservation) {
    notFound();
  }

  if (reservation.statut === "EN_ATTENTE") {
    return <EnAttente reservation={reservation} verifiee={verifiee} />;
  }
  if (reservation.statut === "CONFIRMEE") {
    return <Confirmee reservation={reservation} />;
  }
  return <Annulee reservation={reservation} motif={await chargerMotif(reservation)} />;
}

// --- Les trois statuts (maquettes 03 et 05, plan de refonte) ---

function EnAttente({
  reservation,
  verifiee,
}: {
  reservation: ReservationLue;
  verifiee: boolean;
}) {
  // Heure limite exacte (R6 : 15 minutes après la demande), et non un compte
  // à rebours de 15 minutes qui repartirait à chaque rechargement.
  const limite = reservation.createdAt.getTime() + DELAI_PAIEMENT_MS;
  const montant = formaterPrix(reservation.montantTotalCentimes);

  return (
    <article>
      <EnTeteStatut
        icone={<IconeSablier className="size-8" />}
        ton="bg-attente/10 text-attente ring-attente/30"
        titre="Demande de réservation enregistrée"
        statut="EN_ATTENTE"
      >
        Votre réservation sera confirmée dès réception du paiement.
      </EnTeteStatut>

      {verifiee ? (
        <Encadre ton="alerte" titre={`À payer avant ${formaterHeure(new Date(limite))}`} className="mt-8">
          Passé ce délai, la réservation est annulée automatiquement.{" "}
          <DelaiRestant limite={limite} />
        </Encadre>
      ) : (
        <PaiementNonVerifie />
      )}

      <Detail reservation={reservation}>
        <Montant reservation={reservation} libelle="Montant à payer" />
      </Detail>

      <BoutonPayer reservationId={reservation.id} montant={montant} />
      <p className="mt-3 text-center text-petit text-encre-douce">
        Paiement par carte sur la page sécurisée de Stripe.
      </p>
    </article>
  );
}

function Confirmee({ reservation }: { reservation: ReservationLue }) {
  return (
    <article>
      <EnTeteStatut
        icone={<IconeCoche className="size-8" />}
        ton="bg-succes/10 text-succes ring-succes/30"
        titre="Réservation confirmée"
        statut="CONFIRMEE"
      >
        Votre paiement a bien été reçu : la salle vous est réservée.
      </EnTeteStatut>

      <Detail
        reservation={reservation}
        photo={
          <PhotoSalle
            photo={reservation.salle.photo}
            nom={reservation.salle.nom}
            sizes="(min-width: 768px) 260px, 100vw"
            enPriorite
            className="aspect-[3/2] rounded-arrondi-m"
          />
        }
      >
        <Montant reservation={reservation} libelle="Montant payé" />
      </Detail>

      <div className="mt-8 flex justify-center">
        <LienBouton href="/salles" className="w-full sm:w-auto">
          Voir toutes les salles
          <IconeFleche />
        </LienBouton>
      </div>
    </article>
  );
}

function Annulee({
  reservation,
  motif,
}: {
  reservation: ReservationLue;
  motif: MotifAnnulation;
}) {
  // Une salle retirée entre-temps n'a plus de formulaire (404) : on renvoie
  // alors vers la liste.
  const lien = reservation.salle.active
    ? { href: `/salles/${reservation.salle.id}/reserver`, texte: "Choisir un autre créneau" }
    : { href: "/salles", texte: "Voir toutes les salles" };

  return (
    <article>
      <EnTeteStatut
        icone={<IconeFermer className="size-8" />}
        ton="bg-erreur/10 text-erreur ring-erreur/30"
        titre="Réservation annulée"
        statut="ANNULEE"
      >
        <ExplicationAnnulation motif={motif} reservation={reservation} />
      </EnTeteStatut>

      <Detail reservation={reservation}>
        <Montant reservation={reservation} libelle="Montant de la réservation" attenue />
      </Detail>

      <div className="mt-8 flex flex-col items-center gap-4">
        <LienBouton href={lien.href} variante="action" className="w-full sm:w-auto">
          {lien.texte}
          <IconeFleche />
        </LienBouton>
        <Link
          href="/aide"
          className="inline-flex min-h-11 items-center rounded-arrondi-s font-semibold text-marine underline underline-offset-4 hover:text-marine-fonce"
        >
          Consulter les règles de réservation
        </Link>
      </div>
    </article>
  );
}

// Explication fondée sur le motif réel : rien n'est promis (ni e-mail, ni
// « aucun montant débité » quand un paiement a été encaissé puis remboursé).
function ExplicationAnnulation({
  motif,
  reservation,
}: {
  motif: MotifAnnulation;
  reservation: ReservationLue;
}) {
  if (motif.motif === "delai-depasse") {
    return (
      <>
        Le paiement n&apos;a pas été reçu dans les 15 minutes qui ont suivi votre demande :
        la réservation a été annulée automatiquement. Aucun paiement n&apos;a été encaissé.
      </>
    );
  }

  if (motif.motif === "inconnu") {
    return (
      <>
        Le paiement n&apos;a pas été reçu dans les 15 minutes, ou le créneau a été
        confirmé entre-temps pour un autre client. Si un paiement a été prélevé, il vous
        est remboursé.
      </>
    );
  }

  const paye = formaterPrix(motif.montantPayeCentimes);
  const cause = {
    "paiement-tardif":
      "Votre paiement est arrivé après le délai de 15 minutes qui suivait votre demande.",
    "creneau-pris": "Pendant votre paiement, ce créneau a été confirmé pour un autre client.",
    "montant-different": `Le montant payé (${paye}) ne correspondait pas à celui de la réservation (${formaterPrix(reservation.montantTotalCentimes)}).`,
  };
  return (
    <>
      {motif.cause ? cause[motif.cause] : "Votre paiement n'a pas pu être accepté."} La
      réservation a été annulée et les {paye} payés vous sont remboursés sur la carte
      utilisée.
    </>
  );
}

function PaiementNonVerifie() {
  return (
    <Encadre ton="alerte" role="status" className="mt-8">
      Le paiement n&apos;a pas pu être vérifié pour l&apos;instant. Rechargez la page dans
      quelques instants.
    </Encadre>
  );
}

// --- Éléments communs ---

// Icône ronde, titre centré, badge de statut (mot écrit) et explication.
function EnTeteStatut({
  icone,
  ton,
  titre,
  statut,
  children,
}: {
  icone: ReactNode;
  ton: string;
  titre: string;
  statut: ReservationLue["statut"];
  children: ReactNode;
}) {
  return (
    <header className="flex flex-col items-center text-center">
      <span
        aria-hidden="true"
        className={`flex size-16 items-center justify-center rounded-full ring-2 ${ton}`}
      >
        {icone}
      </span>
      <h1 className="mt-5 text-titre-1 text-marine">{titre}</h1>
      <div className="mt-4">
        <BadgeStatut statut={statut} />
      </div>
      <p className="mt-4 max-w-xl text-encre-douce">{children}</p>
    </header>
  );
}

// Carte « Détail de la réservation » : informations à gauche, montant (et
// photo pour une réservation confirmée) à droite ; empilé sur mobile.
function Detail({
  reservation,
  photo,
  children,
}: {
  reservation: ReservationLue;
  photo?: ReactNode;
  children: ReactNode;
}) {
  // Seuls les textes générés prennent une majuscule initiale : le nom et
  // l'e-mail saisis par le client s'affichent tels quels.
  const lignes = [
    { icone: <IconeMallette />, libelle: "Salle", valeur: reservation.salle.nom },
    {
      icone: <IconeCalendrier />,
      libelle: "Date",
      valeur: formatDate.format(reservation.debut),
      majuscule: true,
    },
    {
      icone: <IconeHorloge />,
      libelle: "Horaire",
      valeur: formaterPlage(reservation.debut, reservation.fin),
      majuscule: true,
    },
    {
      icone: <IconePersonnes />,
      libelle: "Capacité",
      valeur: `Jusqu'à ${reservation.salle.capacite} personnes`,
    },
    { icone: <IconePersonne />, libelle: "Nom", valeur: reservation.nomClient },
    { icone: <IconeEnveloppe />, libelle: "E-mail", valeur: reservation.emailClient },
  ];

  return (
    <Carte as="section" className="mt-8">
      <h2 className="text-titre-3 text-marine">
        Détail de la réservation
      </h2>
      <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_15rem]">
        {/* Chaque <div> du <dl> ne contient qu'un <dt> et un <dd> (structure
            valide pour les lecteurs d'écran) : l'icône est dans le <dt>. */}
        <dl className="space-y-3">
          {lignes.map(({ icone, libelle, valeur, majuscule }) => (
            <div key={libelle} className="sm:flex sm:items-start sm:gap-2">
              <dt className="flex items-center gap-3 text-petit text-encre-douce sm:w-[7.75rem] sm:shrink-0 sm:pt-0.5">
                <span className="shrink-0">{icone}</span>
                {libelle}
              </dt>
              <dd
                className={`min-w-0 pl-8 font-semibold break-words sm:pl-0 ${majuscule ? "first-letter:uppercase" : ""}`}
              >
                {valeur}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-col gap-4 border-t border-bordure pt-5 md:border-t-0 md:border-l md:pt-0 md:pl-6">
          {photo}
          {children}
        </div>
      </div>
    </Carte>
  );
}

// Montant lu en base (R5), avec son calcul. Le prix horaire est déduit du
// montant et de la durée, pour rester juste si le tarif de la salle change
// après la réservation.
function Montant({
  reservation,
  libelle,
  attenue = false,
}: {
  reservation: ReservationLue;
  libelle: string;
  // Réservation annulée : montant en encre, le cuivre invite à l'achat.
  attenue?: boolean;
}) {
  const minutes = Math.round(
    (reservation.fin.getTime() - reservation.debut.getTime()) / 60_000,
  );
  const prixHeure = Math.round((reservation.montantTotalCentimes * 60) / minutes);

  return (
    <div>
      <p className="text-petit text-encre-douce">{libelle}</p>
      <p
        className={`mt-1 font-titres text-titre-2 ${attenue ? "text-encre" : "text-cuivre"}`}
      >
        {formaterPrix(reservation.montantTotalCentimes)}
      </p>
      <p className="mt-1 text-petit text-encre-douce">
        {`${formaterPrix(prixHeure)} / heure × ${formaterDuree(minutes)}`}
      </p>
    </div>
  );
}
