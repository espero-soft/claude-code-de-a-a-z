import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CarteSalle, TAILLES_CARTE_SALLE } from "@/components/CarteSalle";
import { listerSallesActives } from "@/lib/salles";

export const metadata: Metadata = {
  title: "Nos salles de réunion",
  description: "Les salles de réunion du centre d'affaires, louées à l'heure.",
};

// Liste des salles (maquettes 03 et 04, plan de refonte) : cartes de salle
// lues en base, avec leurs équipements réels. Aucun bouton cuivre ici : la
// carte entière mène à la fiche, où se trouve « Réserver cette salle ».
export default function SallesPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 md:py-16">
      <h1 className="text-titre-1 text-marine">Nos salles de réunion</h1>
      <span aria-hidden="true" className="mt-4 block h-1 w-16 rounded-full bg-cuivre" />
      <p className="mt-4 max-w-2xl text-lg leading-7 text-encre-douce">
        Choisissez la salle adaptée à votre réunion. Toutes se louent à
        l&apos;heure, du lundi au vendredi, <span className="whitespace-nowrap">de 8 h à 20 h</span>.
      </p>

      {/* La lecture en base se fait à chaque requête : le titre part tout
          de suite, la liste arrive dès que la requête est terminée. */}
      <Suspense fallback={<p className="mt-10 text-encre-douce">Chargement des salles…</p>}>
        <ListeSalles />
      </Suspense>
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
      <p className="mt-10 text-encre-douce">
        Aucune salle n&apos;est disponible pour le moment.
      </p>
    );
  }

  return (
    <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {salles.map((salle) => (
        <CarteSalle
          key={salle.id}
          salle={salle}
          equipements={salle.equipements}
          niveauTitre="h2"
          sizes={TAILLES_CARTE_SALLE}
        />
      ))}
    </ul>
  );
}
