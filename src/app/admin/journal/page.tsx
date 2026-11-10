import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Badge, type TonBadge } from "@/components/Badge";
import { Bouton } from "@/components/Bouton";
import { Carte } from "@/components/Carte";
import { Champ } from "@/components/Champ";
import { IconeAlerte, IconeEnveloppe, IconeErreur, IconeSucces } from "@/components/icones";
import { doitValiderDeuxiemeFacteur, lireUtilisateur } from "@/lib/acces";
import { adresseConnexion, adresseDeuxiemeFacteur } from "@/lib/connexion";
import { formaterHeure } from "@/lib/format";
import {
  DUREE_CONSERVATION_JOURS,
  estEchec,
  libelleMotif,
  libelleType,
  normaliserFiltreEmail,
  type TonEvenement,
} from "@/lib/journal";
import { lireJournal, NOMBRE_MAX_LIGNES } from "@/lib/journal-connexions";
import { prisma } from "@/lib/prisma";
import { decrireAppareil } from "@/lib/profil";
import { FUSEAU_CENTRE } from "@/lib/reservation";
import { peut } from "@/lib/roles";

// Titre neutre : la page répond 404 à qui n'est pas administrateur.
export const metadata: Metadata = {
  title: "Administration",
  robots: { index: false },
};

const formatJour = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU_CENTRE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const TONS: Record<TonEvenement, { ton: TonBadge; icone: ReactNode }> = {
  succes: { ton: "succes", icone: <IconeSucces className="size-4" /> },
  echec: { ton: "erreur", icone: <IconeErreur className="size-4" /> },
  alerte: { ton: "attente", icone: <IconeAlerte className="size-4" /> },
  neutre: { ton: "neutre", icone: null },
};

// Journal des connexions (SECURITE.md, section 15) : réservé à
// l'administrateur (capacité « journal »), pas à l'employé. Le proxy répond
// déjà 404 aux autres ; on revérifie ici, sous <Suspense>.
export default function JournalPage({ searchParams }: PageProps<"/admin/journal">) {
  return (
    <main id="contenu" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 md:py-16">
      <Suspense fallback={<p className="text-encre-douce">Chargement…</p>}>
        {searchParams.then(({ email }) => (
          <EcranJournal email={typeof email === "string" ? email : ""} />
        ))}
      </Suspense>
    </main>
  );
}

async function EcranJournal({ email }: { email: string }) {
  await connection();
  const utilisateur = await lireUtilisateur();
  const ici = email ? `/admin/journal?email=${encodeURIComponent(email)}` : "/admin/journal";
  if (!utilisateur) redirect(adresseConnexion(ici));
  if (doitValiderDeuxiemeFacteur(utilisateur)) redirect(adresseDeuxiemeFacteur(ici));
  // Client ou employé : la même réponse qu'une page inexistante.
  if (!peut(utilisateur.role, "journal")) notFound();

  const filtre = normaliserFiltreEmail(email);

  return (
    <>
      <p className="sur-titre text-encre-douce">Administration</p>
      <h1 className="mt-2 text-titre-1 text-marine">Journal des connexions</h1>
      <span aria-hidden="true" className="mt-4 block h-1 w-16 rounded-full bg-cuivre" />
      <p className="mt-4 max-w-2xl text-lg leading-7 text-encre-douce">
        Qui s&apos;est connecté, quand, et ce qui a échoué. Les événements sont effacés au bout
        de {DUREE_CONSERVATION_JOURS} jours ; aucun code, jeton ni secret n&apos;y est enregistré.
      </p>

      <Carte as="search" className="mt-8">
        <form method="get" action="/admin/journal" className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Champ
              id="email"
              type="search"
              libelle="Adresse e-mail"
              aide="Tout ou partie de l'adresse : « dupont », « @exemple.fr »."
              defaultValue={filtre}
              autoComplete="off"
              spellCheck={false}
              icone={<IconeEnveloppe className="size-5" />}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:mb-7">
            <Bouton type="submit">Filtrer</Bouton>
            {filtre && (
              <Link
                href="/admin/journal"
                className="rounded-arrondi-s px-2 py-3 font-semibold text-marine underline underline-offset-4 hover:text-marine-fonce"
              >
                Tout afficher
              </Link>
            )}
          </div>
        </form>
      </Carte>

      <Suspense
        key={filtre}
        fallback={<p className="mt-10 text-encre-douce">Chargement des événements…</p>}
      >
        <ListeEvenements filtre={filtre} />
      </Suspense>
    </>
  );
}

async function ListeEvenements({ filtre }: { filtre: string }) {
  await connection();
  const evenements = await lireJournal(prisma, { email: filtre });
  const echecs = evenements.filter((evenement) => estEchec(evenement.type)).length;

  if (evenements.length === 0) {
    return (
      <p className="mt-10 text-encre-douce" role="status">
        {filtre
          ? `Aucun événement pour « ${filtre} » ces ${DUREE_CONSERVATION_JOURS} derniers jours.`
          : "Aucun événement pour le moment."}
      </p>
    );
  }

  return (
    <section aria-labelledby="titre-evenements" className="mt-10">
      <h2 id="titre-evenements" className="text-titre-3 text-marine">
        {evenements.length} événement{evenements.length > 1 ? "s" : ""}
        {filtre && <> pour « {filtre} »</>}
      </h2>
      <p className="mt-1 text-petit text-encre-douce" role="status">
        Dont {echecs} échec{echecs > 1 ? "s" : ""} ou blocage{echecs > 1 ? "s" : ""}
        {evenements.length === NOMBRE_MAX_LIGNES &&
          ` ; seuls les ${NOMBRE_MAX_LIGNES} plus récents sont affichés, filtrez par adresse pour remonter plus loin`}
        .
      </p>

      {/* Mobile : une carte par événement (un tableau de 5 colonnes défilerait
          de côté et couperait l'adresse). À partir de md : le tableau. */}
      <ol className="mt-4 space-y-3 md:hidden" aria-label="Événements, du plus récent au plus ancien">
        {evenements.map((evenement) => (
          <Carte
            as="li"
            key={evenement.id}
            avecMarge={false}
            className={`p-4 ${estEchec(evenement.type) ? "border-l-4 border-l-erreur" : ""}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <TypeEvenement type={evenement.type} motif={evenement.motif} />
              <Moment date={evenement.createdAt} />
            </div>
            <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-petit">
              <dt className="text-encre-douce">E-mail</dt>
              <dd className="break-all text-encre">
                <Email email={evenement.email} />
              </dd>
              <dt className="text-encre-douce">IP</dt>
              <dd className="text-encre">
                <Ip ip={evenement.ip} />
              </dd>
              <dt className="text-encre-douce">Navigateur</dt>
              <dd className="text-encre">{decrireAppareil(evenement.navigateur)}</dd>
            </dl>
          </Carte>
        ))}
      </ol>

      <Carte avecMarge={false} className="mt-4 hidden overflow-x-auto md:block">
        <table className="w-full text-left text-petit">
          <caption className="sr-only">
            Événements de connexion, du plus récent au plus ancien
          </caption>
          <thead className="border-b border-bordure bg-fond/60 text-encre-douce">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Date</th>
              <th scope="col" className="px-4 py-3 font-semibold">Événement</th>
              <th scope="col" className="px-4 py-3 font-semibold">Adresse e-mail</th>
              <th scope="col" className="px-4 py-3 font-semibold">Adresse IP</th>
              <th scope="col" className="px-4 py-3 font-semibold">Navigateur</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bordure">
            {evenements.map((evenement) => (
              <tr key={evenement.id} className={estEchec(evenement.type) ? "bg-erreur/5" : ""}>
                <td className="px-4 py-3 align-top whitespace-nowrap">
                  <Moment date={evenement.createdAt} />
                </td>
                <td className="px-4 py-3 align-top">
                  <TypeEvenement type={evenement.type} motif={evenement.motif} />
                </td>
                <td className="px-4 py-3 align-top break-all text-encre">
                  <Email email={evenement.email} />
                </td>
                <td className="px-4 py-3 align-top whitespace-nowrap text-encre">
                  <Ip ip={evenement.ip} />
                </td>
                <td className="px-4 py-3 align-top text-encre" title={evenement.navigateur ?? undefined}>
                  {decrireAppareil(evenement.navigateur)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Carte>
    </section>
  );
}

function Moment({ date }: { date: Date }) {
  return (
    <time dateTime={date.toISOString()} className="text-petit text-encre">
      {formatJour.format(date)}
      <br />
      <span className="text-encre-douce">{formaterHeure(date)}</span>
    </time>
  );
}

function TypeEvenement({ type, motif }: { type: string; motif: string | null }) {
  const { libelle, ton } = libelleType(type);
  const texteMotif = libelleMotif(motif);
  return (
    <div>
      <Badge ton={TONS[ton].ton} icone={TONS[ton].icone}>
        {libelle}
      </Badge>
      {texteMotif && (
        <p className="mt-1 text-petit text-encre-douce">
          {texteMotif.charAt(0).toUpperCase() + texteMotif.slice(1)}
        </p>
      )}
    </div>
  );
}

function Email({ email }: { email: string }) {
  return email ? <>{email}</> : <span className="text-encre-douce">inconnue</span>;
}

function Ip({ ip }: { ip: string | null }) {
  return ip ? <span className="font-mono">{ip}</span> : <span className="text-encre-douce">inconnue</span>;
}
