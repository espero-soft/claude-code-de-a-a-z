import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache, Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { FUSEAU_CENTRE } from "@/lib/reservation";
import { FormulaireReservation } from "./FormulaireReservation";

const formatPrix = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// "en-CA" écrit les dates au format AAAA-MM-JJ, celui des champs de date.
const formatJour = new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU_CENTRE });

const lireSalle = cache(async (id: string) => {
  await connection();
  return prisma.salle.findFirst({
    where: { id, active: true },
    select: { id: true, nom: true, prixHeureCentimes: true },
  });
});

export async function generateMetadata({
  params,
}: PageProps<"/salles/[id]/reserver">): Promise<Metadata> {
  const { id } = await params;
  const salle = await lireSalle(id);
  if (!salle) {
    return { title: "Salle introuvable" };
  }
  return { title: `Réserver : ${salle.nom}` };
}

export default function ReserverPage({
  params,
}: PageProps<"/salles/[id]/reserver">) {
  return (
    <main className="flex-1 bg-slate-50 px-6 py-16 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <Suspense
          fallback={<p className="text-slate-500">Chargement de la salle…</p>}
        >
          {params.then(({ id }) => (
            <Reservation id={id} />
          ))}
        </Suspense>
      </div>
    </main>
  );
}

async function Reservation({ id }: { id: string }) {
  const salle = await lireSalle(id);
  // Le proxy a déjà répondu 404 pour une salle inconnue (voir src/proxy.ts).
  if (!salle) {
    notFound();
  }

  return (
    <>
      <Link
        href={`/salles/${salle.id}`}
        className="text-sm font-medium text-orange-600 hover:text-orange-700"
      >
        ← Retour à la salle
      </Link>

      <h1 className="mt-4 text-4xl font-bold tracking-tight">
        Réserver {salle.nom}
      </h1>
      <p className="mt-2 text-lg text-slate-600">
        {formatPrix.format(salle.prixHeureCentimes / 100)} / heure
      </p>
      <p className="mt-4 text-slate-600">
        Le centre est ouvert du lundi au vendredi, de 8 h à 20 h. Une
        réservation dure au moins 1 heure, par tranches de 30 minutes.
      </p>

      <FormulaireReservation
        salleId={salle.id}
        aujourdhui={formatJour.format(new Date())}
      />
    </>
  );
}
