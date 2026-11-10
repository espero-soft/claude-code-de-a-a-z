import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Badge, BadgeStatut } from "@/components/Badge";
import { LienBouton } from "@/components/Bouton";
import { Carte } from "@/components/Carte";
import { Encadre } from "@/components/Encadre";
import {
  IconeCalendrier,
  IconeCoche,
  IconeEtiquette,
  IconeFleche,
  IconeHorloge,
  IconeSablier,
} from "@/components/icones";
import { PhotoSalle } from "@/components/PhotoSalle";
import { lireUtilisateur } from "@/lib/acces";
import { adresseConnexion } from "@/lib/connexion";
import {
  actionsReservation,
  classerReservations,
  salutation,
  statutAffiche,
} from "@/lib/espace-client";
import { DELAI_PAIEMENT_MS } from "@/lib/expiration";
import { formaterHeure, formaterPlage, formaterPrix } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { rattacherReservationsSansCompte } from "@/lib/rattachement";
import { FUSEAU_CENTRE } from "@/lib/reservation";
import { actualiserReservation } from "@/lib/suivi-paiement";
import { BoutonPayer } from "../reservations/[id]/BoutonPayer";

export const metadata: Metadata = {
  title: "Mes réservations",
  description: "Vos réservations à venir, en attente de paiement et passées.",
  robots: { index: false },
};

const formatDate = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU_CENTRE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

// Espace client, d'après les maquettes 03 (ordinateur) et 04 (mobile) du
// module 12 : le style, pas le contenu. Tout vient de la base (salles,
// dates, montants, statuts). Coquille statique vide : tout est personnel,
// donc lu en flux sous <Suspense> (Cache Components).
export default function ComptePage() {
  return (
    <main id="contenu" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 md:py-12">
      <Suspense fallback={<p className="text-encre-douce">Chargement de vos réservations…</p>}>
        <EspaceClient />
      </Suspense>
    </main>
  );
}

function lireReservations(utilisateurId: string) {
  return prisma.reservation.findMany({
    where: { utilisateurId },
    select: {
      id: true,
      statut: true,
      debut: true,
      fin: true,
      createdAt: true,
      montantTotalCentimes: true,
      salle: { select: { id: true, nom: true, photo: true, active: true } },
    },
  });
}

type ReservationAffichee = Awaited<ReturnType<typeof lireReservations>>[number];

async function EspaceClient() {
  await connection();
  // Le proxy renvoie déjà les visiteurs sans cookie ; on revérifie ici.
  const utilisateur = await lireUtilisateur();
  if (!utilisateur) {
    redirect(adresseConnexion("/compte"));
  }

  // Réservations faites sans compte, à la même adresse vérifiée (déjà fait
  // à la connexion ; refait ici pour une session ouverte avant).
  try {
    await rattacherReservationsSansCompte(utilisateur.id);
  } catch (erreur) {
    console.error("Rattachement des réservations impossible", erreur);
  }

  // Une réservation en attente a peut-être été payée, ou a dépassé ses 15
  // minutes (R6) : on l'actualise comme sa page de détail le fait. Si Stripe
  // ne répond pas, on affiche l'état connu en base.
  let reservations = await lireReservations(utilisateur.id);
  const enAttente = reservations.filter((r) => r.statut === "EN_ATTENTE");
  if (enAttente.length > 0) {
    await Promise.all(
      enAttente.map((r) =>
        actualiserReservation(r.id, new Date()).catch((erreur) => {
          console.error("Vérification du paiement impossible", erreur);
        }),
      ),
    );
    reservations = await lireReservations(utilisateur.id);
  }

  const maintenant = new Date();
  const { enAttente: aPayer, aVenir, passees } = classerReservations(reservations, maintenant);
  const [prochaine, ...suivantes] = aVenir;

  return (
    <>
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="border-l-4 border-cuivre pl-4">
          <p className="sur-titre text-encre-douce">Espace client</p>
          <h1 className="mt-1 text-titre-1 text-marine">{salutation(utilisateur.nom)}</h1>
          <p className="mt-2 text-encre-douce">Voici vos réservations en un coup d&apos;œil.</p>
        </div>
        {/* Seul bouton cuivre de l'écran (charte) : réserver. */}
        <LienBouton href="/salles" variante="action" className="w-full md:w-auto">
          <IconeCalendrier />
          Réserver une salle
        </LienBouton>
      </header>

      <ul aria-label="Vos réservations en chiffres" className="mt-8 grid grid-cols-3 gap-3 md:gap-6">
        <Compteur
          href="#a-venir"
          libelle="À venir"
          nombre={aVenir.length}
          icone={<IconeCalendrier className="size-6" />}
          ton="border border-bordure bg-surface"
        />
        <Compteur
          href="#en-attente"
          libelle="En attente"
          nombre={aPayer.length}
          icone={<IconeSablier className="size-6 text-attente" />}
          ton="border border-attente/30 bg-attente/10"
        />
        <Compteur
          href="#passees"
          libelle="Passées et annulées"
          nombre={passees.length}
          icone={<IconeCoche className="size-6" />}
          ton="border border-marine/10 bg-marine-clair"
        />
      </ul>

      {reservations.length === 0 && (
        <Encadre ton="information" titre="Pas encore de réservation" className="mt-8">
          Choisissez une salle et un créneau : votre réservation apparaîtra ici.
        </Encadre>
      )}

      {prochaine && <Prochaine reservation={prochaine} maintenant={maintenant} />}

      <Rubrique
        id="en-attente"
        titre="En attente de paiement"
        vide="Aucune réservation en attente de paiement."
        reservations={aPayer}
        maintenant={maintenant}
      />
      <Rubrique
        id="a-venir"
        titre={prochaine ? "Ensuite" : "À venir"}
        vide={prochaine ? "Aucune autre réservation à venir." : "Aucune réservation à venir."}
        reservations={suivantes}
        maintenant={maintenant}
      />
      <Rubrique
        id="passees"
        titre="Passées et annulées"
        vide="Aucune réservation passée pour le moment."
        reservations={passees}
        maintenant={maintenant}
      />
    </>
  );
}

function Compteur({
  href,
  libelle,
  nombre,
  icone,
  ton,
}: {
  href: string;
  libelle: string;
  nombre: number;
  icone: ReactNode;
  ton: string;
}) {
  return (
    <li>
      <a
        href={href}
        className={`flex h-full flex-col gap-2 rounded-arrondi-m p-3 text-encre hover:shadow-carte sm:p-4 md:flex-row md:items-center md:gap-4 md:p-5 ${ton}`}
      >
        <span aria-hidden="true" className="text-marine">
          {icone}
        </span>
        <span className="text-petit font-semibold md:flex-1 md:text-corps">{libelle}</span>
        <span className="font-titres text-titre-2 leading-none text-marine">{nombre}</span>
      </a>
    </li>
  );
}

// Statut écrit en toutes lettres (jamais la couleur seule), R6 appliquée.
function Statut({ reservation, maintenant }: { reservation: ReservationAffichee; maintenant: Date }) {
  const statut = statutAffiche(reservation, maintenant);
  if (statut === "TERMINEE") {
    return (
      <Badge ton="neutre" icone={<IconeCoche className="size-4" />}>
        Terminée
      </Badge>
    );
  }
  return <BadgeStatut statut={statut} />;
}

// Date, horaire et montant (lus en base) ; pour une réservation à payer,
// l'heure limite exacte de R6.
function Infos({ reservation, maintenant }: { reservation: ReservationAffichee; maintenant: Date }) {
  const aPayer = actionsReservation(reservation, maintenant).some((a) => a.type === "payer");
  const lignes = [
    { icone: <IconeCalendrier />, libelle: "Date", valeur: formatDate.format(reservation.debut) },
    {
      icone: <IconeHorloge />,
      libelle: "Horaire",
      valeur: formaterPlage(reservation.debut, reservation.fin),
    },
    {
      icone: <IconeEtiquette />,
      libelle: "Montant",
      valeur: formaterPrix(reservation.montantTotalCentimes),
    },
  ];
  return (
    <>
      <dl className="mt-2 space-y-1.5">
        {lignes.map(({ icone, libelle, valeur }) => (
          <div key={libelle} className="flex items-center gap-2">
            <dt className="shrink-0 text-encre-douce">
              {icone}
              <span className="sr-only">{libelle}</span>
            </dt>
            <dd className="min-w-0 first-letter:uppercase">{valeur}</dd>
          </div>
        ))}
      </dl>
      {aPayer && (
        <p className="mt-2 text-petit font-semibold text-attente">
          À payer avant{" "}
          {formaterHeure(new Date(reservation.createdAt.getTime() + DELAI_PAIEMENT_MS))}, sinon
          elle est annulée.
        </p>
      )}
    </>
  );
}

// Boutons selon le statut (actionsReservation). Le texte caché précise la
// réservation : plusieurs « Voir le détail » se distinguent au lecteur d'écran.
function Actions({ reservation, maintenant }: { reservation: ReservationAffichee; maintenant: Date }) {
  const precision = `${reservation.salle.nom}, ${formatDate.format(reservation.debut)}`;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap md:flex-col md:items-stretch [&>*]:whitespace-nowrap">
      {actionsReservation(reservation, maintenant).map((action) => {
        if (action.type === "payer") {
          return (
            <BoutonPayer
              key="payer"
              reservationId={reservation.id}
              montant={formaterPrix(reservation.montantTotalCentimes)}
              variante="principal"
              className=""
            />
          );
        }
        return (
          <LienBouton key={action.type} href={action.href} variante="secondaire">
            {action.type === "detail" ? "Voir le détail" : action.libelle}
            <span className="sr-only"> : {precision}</span>
            <IconeFleche />
          </LienBouton>
        );
      })}
    </div>
  );
}

function Prochaine({ reservation, maintenant }: { reservation: ReservationAffichee; maintenant: Date }) {
  return (
    <section aria-labelledby="titre-prochaine" className="mt-10">
      <Carte grande avecMarge={false} className="grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <PhotoSalle
          photo={reservation.salle.photo}
          nom={reservation.salle.nom}
          sizes="(min-width: 1152px) 560px, (min-width: 768px) 50vw, 100vw"
          enPriorite
          decorative
          className="aspect-[3/2] md:aspect-auto md:min-h-72"
        />
        <div className="flex flex-col p-6 md:p-8">
          <p id="titre-prochaine" className="sur-titre text-encre-douce">
            Prochaine réservation
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h2 className="text-titre-2 text-marine">{reservation.salle.nom}</h2>
            <Statut reservation={reservation} maintenant={maintenant} />
          </div>
          <Infos reservation={reservation} maintenant={maintenant} />
          <div className="mt-6 sm:max-w-72">
            <Actions reservation={reservation} maintenant={maintenant} />
          </div>
        </div>
      </Carte>
    </section>
  );
}

function Rubrique({
  id,
  titre,
  vide,
  reservations,
  maintenant,
}: {
  id: string;
  titre: string;
  vide: string;
  reservations: ReservationAffichee[];
  maintenant: Date;
}) {
  return (
    <section id={id} aria-labelledby={`titre-${id}`} className="mt-10 scroll-mt-6">
      <h2 id={`titre-${id}`} className="border-l-4 border-cuivre pl-3 text-titre-2 text-marine">
        {titre}
      </h2>
      {reservations.length === 0 ? (
        <p className="mt-4 text-encre-douce">{vide}</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {reservations.map((reservation) => (
            <Carte
              as="li"
              key={reservation.id}
              avecMarge={false}
              aria-label={`${reservation.salle.nom}, ${formatDate.format(reservation.debut)}`}
              // Mobile : photo et infos côte à côte, actions sur toute la
              // largeur dessous. Ordinateur : actions dans une colonne à droite.
              className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-4 gap-y-4 p-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:p-4 md:grid-cols-[11rem_minmax(0,1fr)_19rem] md:items-center"
            >
              <PhotoSalle
                photo={reservation.salle.photo}
                nom={reservation.salle.nom}
                sizes="(min-width: 640px) 176px, 96px"
                decorative
                className="aspect-[4/3] self-start rounded-arrondi-s md:self-center"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="text-titre-3 text-marine">{reservation.salle.nom}</h3>
                  <Statut reservation={reservation} maintenant={maintenant} />
                </div>
                <Infos reservation={reservation} maintenant={maintenant} />
              </div>
              <div className="col-span-2 md:col-span-1 md:border-l md:border-bordure md:pl-6">
                <Actions reservation={reservation} maintenant={maintenant} />
              </div>
            </Carte>
          ))}
        </ul>
      )}
    </section>
  );
}
