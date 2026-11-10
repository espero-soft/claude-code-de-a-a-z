import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { listerSallesActives } from "@/lib/salles";

export const metadata: Metadata = {
  title: "Nos salles de réunion",
  description: "Les salles de réunion du centre d'affaires, louées à l'heure.",
};

const formatPrix = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export default function SallesPage() {
  return (
    <main className="flex-1 bg-slate-50 px-6 py-16 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="text-sm font-medium text-orange-600 hover:text-orange-700"
        >
          ← Accueil
        </Link>
        <h1 className="mt-4 text-4xl font-bold tracking-tight">
          Nos salles de réunion
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          Choisissez la salle adaptée à votre réunion. Toutes se louent à
          l&apos;heure, du lundi au vendredi, de 8 h à 20 h.
        </p>

        {/* La lecture en base se fait à chaque requête : le titre part tout
            de suite, la liste arrive dès que la requête est terminée. */}
        <Suspense
          fallback={<p className="mt-10 text-slate-500">Chargement des salles…</p>}
        >
          <ListeSalles />
        </Suspense>
      </div>
    </main>
  );
}

async function ListeSalles() {
  // better-sqlite3 répond de façon synchrone : sans connection(), Next
  // exécuterait la requête au build et figerait la liste dans la page.
  await connection();

  const salles = await listerSallesActives();

  if (salles.length === 0) {
    return (
      <p className="mt-10 text-slate-600">
        Aucune salle n&apos;est disponible pour le moment.
      </p>
    );
  }

  return (
    <ul className="mt-10 grid gap-6 sm:grid-cols-2">
      {salles.map((salle) => (
        <li
          key={salle.id}
          className="relative flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-orange-300 hover:shadow-md"
        >
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-semibold">
              {/* Le ::after du lien couvre toute la carte : un clic n'importe
                  où mène à la fiche, et le lecteur d'écran n'annonce que le nom. */}
              <Link
                href={`/salles/${salle.id}`}
                className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-orange-500"
              >
                {salle.nom}
              </Link>
            </h2>
            <p className="shrink-0 text-lg font-semibold text-orange-600">
              {formatPrix.format(salle.prixHeureCentimes / 100)}
              <span className="text-sm font-normal text-slate-500">
                {" "}
                / heure
              </span>
            </p>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Jusqu&apos;à {salle.capacite} personnes
          </p>
          <p className="mt-4 text-slate-700">{salle.description}</p>
          <ul aria-label="Équipements" className="mt-6 flex flex-wrap gap-2">
            {salle.equipements.map((equipement) => (
              <li
                key={equipement.id}
                className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
              >
                {equipement.nom}
              </li>
            ))}
          </ul>
          {/* relative z-10 : au-dessus du lien de la carte */}
          <div className="mt-auto pt-6">
            <Link
              href={`/salles/${salle.id}/reserver`}
              aria-label={`Réserver ${salle.nom}`}
              className="relative z-10 inline-flex items-center rounded-full bg-orange-600 px-5 py-2 font-semibold text-white shadow-sm transition hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            >
              Réserver
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
