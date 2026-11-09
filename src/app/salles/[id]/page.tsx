import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache, Suspense } from "react";
import { prisma } from "@/lib/prisma";

const formatPrix = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// cache() évite de lire deux fois la même salle : generateMetadata et la
// page la demandent pendant le même rendu.
const lireSalle = cache(async (id: string) => {
  await connection();
  return prisma.salle.findFirst({
    where: { id, active: true },
    include: { equipements: { orderBy: { nom: "asc" } } },
  });
});

export async function generateMetadata({
  params,
}: PageProps<"/salles/[id]">): Promise<Metadata> {
  const { id } = await params;
  const salle = await lireSalle(id);
  if (!salle) {
    return { title: "Salle introuvable" };
  }
  return { title: salle.nom, description: salle.description };
}

export default function SallePage({ params }: PageProps<"/salles/[id]">) {
  return (
    <main className="flex-1 bg-slate-50 px-6 py-16 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/salles"
          className="text-sm font-medium text-orange-600 hover:text-orange-700"
        >
          ← Toutes les salles
        </Link>

        {/* L'identifiant n'est connu qu'à la requête : le lien de retour part
            tout de suite, la fiche arrive dès que la salle est lue. */}
        <Suspense
          fallback={<p className="mt-10 text-slate-500">Chargement de la salle…</p>}
        >
          {params.then(({ id }) => (
            <FicheSalle id={id} />
          ))}
        </Suspense>
      </div>
    </main>
  );
}

async function FicheSalle({ id }: { id: string }) {
  const salle = await lireSalle(id);
  if (!salle) {
    notFound();
  }

  return (
    <article className="mt-4">
      <h1 className="text-4xl font-bold tracking-tight">{salle.nom}</h1>

      <dl className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <dt className="text-sm text-slate-500">Capacité</dt>
          <dd className="mt-1 text-2xl font-semibold">
            Jusqu&apos;à {salle.capacite} personnes
          </dd>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <dt className="text-sm text-slate-500">Prix</dt>
          <dd className="mt-1 text-4xl font-bold tracking-tight text-orange-600">
            {formatPrix.format(salle.prixHeureCentimes / 100)}
            <span className="text-base font-normal tracking-normal text-slate-500">
              {" "}
              / heure
            </span>
          </dd>
        </div>
      </dl>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Description</h2>
        <p className="mt-3 text-lg text-slate-700">{salle.description}</p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Équipements</h2>
        {salle.equipements.length === 0 ? (
          <p className="mt-3 text-slate-600">
            Cette salle n&apos;a pas d&apos;équipement particulier.
          </p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {salle.equipements.map((equipement) => (
              <li
                key={equipement.id}
                className="inline-flex items-center rounded-full bg-orange-50 px-3 py-1 text-sm font-medium text-orange-700 ring-1 ring-inset ring-orange-200"
              >
                {equipement.nom}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
