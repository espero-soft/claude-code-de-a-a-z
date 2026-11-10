import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache, Suspense } from "react";
import { LienBouton } from "@/components/Bouton";
import {
  IconeCalendrier,
  IconeChevron,
  IconeCoche,
  IconeEtiquette,
  IconePersonnes,
  IconeRetour,
} from "@/components/icones";
import { PhotoSalle } from "@/components/PhotoSalle";
import { formaterPrix } from "@/lib/format";
import { prisma } from "@/lib/prisma";

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
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 md:py-10">
      {/* L'identifiant n'est connu qu'à la requête : la coquille part tout
          de suite, la fiche arrive dès que la salle est lue. */}
      <Suspense fallback={<p className="text-encre-douce">Chargement de la salle…</p>}>
        {params.then(({ id }) => (
          <FicheSalle id={id} />
        ))}
      </Suspense>
    </main>
  );
}

// Fiche (maquettes 03 et 04, plan de refonte) : tout vient de la base (nom,
// photo, capacité, prix, description, équipements). Une seule photo par
// salle (pas de galerie), un seul bouton cuivre.
async function FicheSalle({ id }: { id: string }) {
  const salle = await lireSalle(id);
  // Le proxy a déjà répondu 404 pour une salle inconnue. Ce contrôle couvre
  // le cas rare d'une salle désactivée entre le proxy et cette lecture.
  if (!salle) {
    notFound();
  }

  return (
    <>
      <FilAriane nomSalle={salle.nom} />

      {/* Mobile : titre, photo, puis le reste. Ordinateur : photo à gauche
          sur deux rangées, titre et informations à droite ; la seconde
          rangée (1fr) prend la hauteur restante de la photo, pour ne pas
          ouvrir de vide entre le prix et la description. */}
      <article className="mt-4 grid gap-6 md:mt-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:grid-rows-[auto_1fr] lg:gap-x-10 lg:gap-y-6">
        <header className="lg:col-start-2 lg:row-start-1">
          <h1 className="text-titre-1 text-marine lg:text-affiche">{salle.nom}</h1>
          <span aria-hidden="true" className="mt-3 block h-1 w-16 rounded-full bg-cuivre lg:hidden" />

          {/* Mobile : deux pastilles. Ordinateur : capacité en ligne, prix en grand. */}
          <dl className="mt-5 flex flex-wrap gap-3 lg:mt-3 lg:flex-col lg:gap-2">
            <div className="flex items-center gap-2 rounded-arrondi-m border border-bordure bg-surface px-4 py-2 lg:order-1 lg:border-0 lg:bg-transparent lg:p-0">
              <dt className="sr-only">Capacité</dt>
              <IconePersonnes className="size-5 shrink-0 text-encre-douce" />
              <dd className="text-lg">Jusqu&apos;à {salle.capacite} personnes</dd>
            </div>
            <div className="flex items-center gap-2 rounded-arrondi-m border border-bordure bg-surface px-4 py-2 lg:order-2 lg:border-0 lg:bg-transparent lg:p-0">
              <dt className="sr-only">Prix</dt>
              <IconeEtiquette className="size-5 shrink-0 text-cuivre lg:hidden" />
              <dd className="text-lg font-bold text-cuivre lg:text-titre-2">
                {formaterPrix(salle.prixHeureCentimes)}
                <span className="font-semibold"> / heure</span>
              </dd>
            </div>
          </dl>
        </header>

        <PhotoSalle
          photo={salle.photo}
          nom={salle.nom}
          sizes="(min-width: 1152px) 660px, (min-width: 1024px) 58vw, 100vw"
          enPriorite
          className="aspect-[3/2] rounded-arrondi-l shadow-carte lg:col-start-1 lg:row-span-2 lg:row-start-1"
        />

        <div className="lg:col-start-2 lg:row-start-2">
          <p className="leading-7 text-encre">{salle.description}</p>

          <section aria-labelledby="titre-equipements" className="mt-6 border-t border-bordure pt-6 lg:border-0 lg:pt-0">
            <h2 id="titre-equipements" className="text-titre-3 text-marine">
              Équipements inclus
            </h2>
            {salle.equipements.length === 0 ? (
              <p className="mt-3 text-encre-douce">
                Cette salle n&apos;a pas d&apos;équipement particulier.
              </p>
            ) : (
              // Mobile : liste cochée. Ordinateur : badges cuivre-clair.
              <ul className="mt-3 space-y-2 lg:flex lg:flex-wrap lg:gap-2 lg:space-y-0">
                {salle.equipements.map((equipement) => (
                  <li
                    key={equipement.id}
                    className="flex items-center gap-2 lg:rounded-arrondi-pilule lg:bg-cuivre-clair lg:px-3 lg:py-1 lg:text-petit lg:font-semibold lg:text-cuivre-fonce"
                  >
                    <IconeCoche className="size-4 shrink-0 text-cuivre lg:text-cuivre-fonce" />
                    {equipement.nom}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <LienBouton
            href={`/salles/${salle.id}/reserver`}
            variante="action"
            pleineLargeur
            className="mt-8"
          >
            <IconeCalendrier />
            Réserver cette salle
          </LienBouton>
        </div>
      </article>
    </>
  );
}

// Ordinateur : Accueil > Nos salles > nom (maquette 03). Mobile : simple
// lien « ← Nos salles » (maquette 04). Un seul des deux est rendu visible,
// l'autre est en display: none, donc absent de l'arbre d'accessibilité.
function FilAriane({ nomSalle }: { nomSalle: string }) {
  const lien = "rounded-arrondi-s text-encre-douce underline-offset-4 hover:text-marine hover:underline";
  return (
    <>
      <nav aria-label="Fil d'Ariane" className="hidden text-petit md:block">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className={lien}>
              Accueil
            </Link>
          </li>
          <li aria-hidden="true">
            <IconeChevron className="size-4 text-encre-douce" />
          </li>
          <li>
            <Link href="/salles" className={lien}>
              Nos salles
            </Link>
          </li>
          <li aria-hidden="true">
            <IconeChevron className="size-4 text-encre-douce" />
          </li>
          <li aria-current="page" className="font-semibold text-encre">
            {nomSalle}
          </li>
        </ol>
      </nav>
      <nav aria-label="Retour" className="md:hidden">
        <Link
          href="/salles"
          className={`inline-flex min-h-11 items-center gap-2 font-semibold ${lien}`}
        >
          <IconeRetour className="size-5" />
          Nos salles
        </Link>
      </nav>
    </>
  );
}
