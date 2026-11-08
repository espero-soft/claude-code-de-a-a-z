import type { Metadata } from "next";
import Link from "next/link";
import { salles } from "@/data/salles";

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
  const sallesActives = salles.filter((salle) => salle.active);

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

        <ul className="mt-10 grid gap-6 sm:grid-cols-2">
          {sallesActives.map((salle) => (
            <li
              key={salle.id}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-xl font-semibold">{salle.nom}</h2>
                <p className="shrink-0 text-lg font-semibold text-orange-600">
                  {formatPrix.format(salle.prixParHeure)}
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
              <ul
                aria-label="Équipements"
                className="mt-6 flex flex-wrap gap-2"
              >
                {salle.equipements.map((equipement) => (
                  <li
                    key={equipement}
                    className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
                  >
                    {equipement}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
