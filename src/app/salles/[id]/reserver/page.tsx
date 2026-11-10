import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache, Suspense } from "react";
import { Carte } from "@/components/Carte";
import { Encadre } from "@/components/Encadre";
import { IconeEtiquette, IconePersonnes, IconeRetour } from "@/components/icones";
import { PhotoSalle } from "@/components/PhotoSalle";
import { formaterPrix } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { FUSEAU_CENTRE } from "@/lib/reservation";
import { FormulaireReservation } from "./FormulaireReservation";

// "en-CA" écrit les dates au format AAAA-MM-JJ, celui des champs de date.
const formatJour = new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU_CENTRE });

const lireSalle = cache(async (id: string) => {
  await connection();
  return prisma.salle.findFirst({
    where: { id, active: true },
    select: { id: true, nom: true, photo: true, capacite: true, prixHeureCentimes: true },
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
    <main id="contenu" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 md:py-10">
      <Suspense fallback={<p className="text-encre-douce">Chargement de la salle…</p>}>
        {params.then(({ id }) => (
          <Reservation id={id} />
        ))}
      </Suspense>
    </main>
  );
}

// Formulaire (maquettes 03 et 04, plan de refonte) : titre à trait cuivre,
// formulaire dans une carte blanche, et en plus des maquettes un
// récapitulatif de la salle (photo, nom, capacité, prix lus en base) avec le
// rappel des règles. Un seul bouton cuivre : l'envoi.
async function Reservation({ id }: { id: string }) {
  const salle = await lireSalle(id);
  // Le proxy a déjà répondu 404 pour une salle inconnue (voir src/proxy.ts).
  if (!salle) {
    notFound();
  }

  return (
    <>
      <nav aria-label="Retour">
        <Link
          href={`/salles/${salle.id}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-arrondi-s font-semibold text-encre-douce underline-offset-4 hover:text-marine hover:underline"
        >
          <IconeRetour className="size-5" />
          Retour à la salle
        </Link>
      </nav>

      <header className="mt-2">
        <h1 className="text-titre-1 text-marine">Réserver {salle.nom}</h1>
        <span aria-hidden="true" className="mt-3 block h-1 w-16 rounded-full bg-cuivre" />
        <p className="mt-4 text-encre-douce">
          Complétez le formulaire ci-dessous pour réserver la salle.
        </p>
      </header>

      {/* Mobile : récapitulatif compact au-dessus du formulaire. Ordinateur :
          formulaire à gauche, récapitulatif à droite. */}
      <div className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start lg:gap-10">
        <aside aria-labelledby="titre-recapitulatif" className="space-y-4 lg:col-start-2 lg:row-start-1">
          <Carte grande avecMarge={false} className="flex items-center gap-4 p-3 lg:block lg:p-0">
            <PhotoSalle
              photo={salle.photo}
              nom={salle.nom}
              sizes="(min-width: 1024px) 352px, 112px"
              enPriorite
              decorative
              className="aspect-[4/3] w-28 shrink-0 rounded-arrondi-m lg:aspect-[3/2] lg:w-full lg:rounded-none"
            />
            <div className="min-w-0 lg:p-6">
              <h2 id="titre-recapitulatif" className="text-titre-3 text-marine">
                {salle.nom}
              </h2>
              <dl className="mt-1 space-y-1 lg:mt-3 lg:space-y-2">
                <div className="flex items-center gap-2 text-petit text-encre lg:text-corps">
                  <dt className="sr-only">Capacité</dt>
                  <IconePersonnes className="size-4 shrink-0 text-encre-douce lg:size-5" />
                  <dd>Jusqu&apos;à {salle.capacite} personnes</dd>
                </div>
                <div className="flex items-center gap-2 font-bold text-cuivre lg:text-lg">
                  <dt className="sr-only">Prix</dt>
                  <IconeEtiquette className="size-4 shrink-0 lg:size-5" />
                  <dd>
                    {formaterPrix(salle.prixHeureCentimes)}
                    <span className="font-semibold"> / heure</span>
                  </dd>
                </div>
              </dl>
            </div>
          </Carte>

          <Encadre ton="information" titre="Avant de réserver">
            Le centre est ouvert du lundi au vendredi, de 8 h à 20 h. Une
            réservation dure au moins 1 heure, par tranches de 30 minutes.
          </Encadre>
        </aside>

        <Carte className="lg:col-start-1 lg:row-start-1 lg:p-8">
          <FormulaireReservation
            salleId={salle.id}
            aujourdhui={formatJour.format(new Date())}
          />
        </Carte>
      </div>
    </>
  );
}
