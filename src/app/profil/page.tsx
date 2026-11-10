import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Badge } from "@/components/Badge";
import { Carte } from "@/components/Carte";
import { IconeEnveloppe } from "@/components/icones";
import { lireUtilisateur } from "@/lib/acces";
import { adresseConnexion } from "@/lib/connexion";
import { formaterHeure } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { listerAppareils, type Appareil } from "@/lib/profil";
import { FUSEAU_CENTRE } from "@/lib/reservation";
import { MESSAGES_REFUS, refusSuppression } from "@/lib/suppression-compte";
import { BoutonDeconnecterAppareil, BoutonDeconnecterAutres } from "./BoutonsAppareils";
import { FormulaireNom } from "./FormulaireNom";
import { SuppressionCompte } from "./SuppressionCompte";

export const metadata: Metadata = {
  title: "Mon profil",
  description: "Votre nom, vos appareils connectés et la suppression de votre compte.",
  robots: { index: false },
};

const formatJour = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU_CENTRE,
  day: "numeric",
  month: "long",
  year: "numeric",
});

// « le 10 novembre 2026 à 22 h 40 », à l'heure du centre.
function formaterMoment(date: Date): string {
  return `le ${formatJour.format(date)} à ${formaterHeure(date)}`;
}

// Mon profil : chacun garde la main sur son compte. Tout est personnel :
// coquille statique, données lues en flux sous <Suspense> (Cache Components).
// Le proxy renvoie les visiteurs sans cookie ; la page et chaque action
// (actions.ts) revérifient la session.
export default function ProfilPage() {
  return (
    <main id="contenu" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 md:py-12">
      <header className="border-l-4 border-cuivre pl-4">
        <p className="sur-titre text-encre-douce">Votre compte</p>
        <h1 className="mt-1 text-titre-1 text-marine">Mon profil</h1>
      </header>
      <Suspense fallback={<p className="mt-8 text-encre-douce">Chargement de votre profil…</p>}>
        <Profil />
      </Suspense>
    </main>
  );
}

async function Profil() {
  await connection();
  const utilisateur = await lireUtilisateur();
  if (!utilisateur) redirect(adresseConnexion("/profil"));

  const [sessions, administrateurs] = await Promise.all([
    // Jamais le jeton : seul l'identifiant de session part vers le navigateur.
    prisma.session.findMany({
      where: { userId: utilisateur.id },
      select: { id: true, userAgent: true, createdAt: true, updatedAt: true, expiresAt: true },
    }),
    prisma.user.count({ where: { role: "ADMIN" } }),
  ]);
  const appareils = listerAppareils(sessions, utilisateur.sessionId, new Date());
  const autres = appareils.filter((a) => !a.courant).length;
  const refus = refusSuppression(utilisateur, administrateurs);

  return (
    <div className="mt-8 space-y-8">
      <Carte as="section" aria-labelledby="titre-identite">
        <h2 id="titre-identite" className="text-titre-2 text-marine">
          Vos informations
        </h2>
        <p className="mt-3 flex items-center gap-2 text-encre">
          <IconeEnveloppe className="size-5 shrink-0 text-encre-douce" />
          <span className="sr-only">Adresse e-mail :</span>
          <span className="break-all">{utilisateur.email}</span>
        </p>
        <p className="mt-1 text-petit text-encre-douce">
          Votre adresse sert à vous connecter : elle ne se modifie pas ici.
        </p>
        <div className="mt-6">
          <FormulaireNom nom={utilisateur.nom} />
        </div>
      </Carte>

      <Carte as="section" aria-labelledby="titre-appareils">
        <h2 id="titre-appareils" className="text-titre-2 text-marine">
          Appareils connectés
        </h2>
        <p className="mt-2 text-encre-douce">
          Un appareil que vous ne reconnaissez pas&nbsp;? Déconnectez-le&nbsp;: il devra recevoir un nouveau
          code par e-mail pour revenir.
        </p>
        <ul className="mt-4 divide-y divide-bordure">
          {appareils.map((appareil) => (
            <LigneAppareil key={appareil.id} appareil={appareil} />
          ))}
        </ul>
        {autres > 0 && (
          <div className="mt-4 border-t border-bordure pt-4">
            <BoutonDeconnecterAutres nombre={autres} />
          </div>
        )}
      </Carte>

      <Carte as="section" aria-labelledby="titre-suppression" className="border-erreur/40">
        <h2 id="titre-suppression" className="text-titre-2 text-marine">
          Supprimer mon compte
        </h2>
        <div className="mt-2 space-y-2 text-encre">
          <p>La suppression est définitive. Elle efface&nbsp;:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>votre compte, votre nom et votre adresse e-mail&nbsp;;</li>
            <li>vos connexions sur tous vos appareils&nbsp;;</li>
            <li>vos réservations jamais payées et vos messages au support.</li>
          </ul>
          <p>
            Vos réservations payées restent dans notre comptabilité, comme la loi l&apos;exige,
            mais <strong>anonymisées</strong> : sans votre nom ni votre adresse. Une réservation à
            venir déjà payée reste réservée, sans remboursement automatique.
          </p>
        </div>
        <div className="mt-6">
          <SuppressionCompte refus={refus ? MESSAGES_REFUS[refus] : null} />
        </div>
      </Carte>
    </div>
  );
}

function LigneAppareil({ appareil }: { appareil: Appareil }) {
  return (
    <li
      aria-label={appareil.courant ? `${appareil.libelle}, cet appareil` : appareil.libelle}
      className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-semibold text-encre">
          {appareil.libelle}
          {appareil.courant && (
            <Badge ton="contour" icone={null}>
              Cet appareil
            </Badge>
          )}
        </p>
        <p className="mt-1 text-petit text-encre-douce">
          Connecté {formaterMoment(appareil.connecteLe)}
          {appareil.actifLe.getTime() - appareil.connecteLe.getTime() > 60_000 &&
            ` · dernière activité ${formaterMoment(appareil.actifLe)}`}
        </p>
      </div>
      {!appareil.courant && (
        <BoutonDeconnecterAppareil sessionId={appareil.id} libelle={appareil.libelle} />
      )}
    </li>
  );
}
