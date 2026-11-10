import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache, Suspense } from "react";
import { lireUtilisateur } from "@/lib/acces";
import { adresseConnexion, cheminDeRetour } from "@/lib/connexion";
import { Enrolement } from "./Enrolement";
import { Verification } from "./Verification";

// Le titre est décidé après le contrôle (comme /reservations/[id]) : un
// client reçoit celui de la page introuvable, pas « Double authentification ».
export async function generateMetadata(): Promise<Metadata> {
  const utilisateur = await lireCompteConnecte();
  if (utilisateur?.deuxiemeFacteur === "inutile") notFound();
  return { title: "Double authentification", robots: { index: false } };
}

const lireCompteConnecte = cache(async () => {
  await connection();
  return lireUtilisateur();
});

// Second facteur du personnel (SECURITE.md, section 13) : au premier passage,
// enrôlement de l'application d'authentification (QR code, clé et codes de
// secours montrés une seule fois) ; ensuite, un code à chaque session.
// Clients : page inexistante. Coquille statique sans rien de personnel.
export default function DoubleAuthentificationPage({
  searchParams,
}: PageProps<"/double-authentification">) {
  return (
    <main id="contenu" className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 md:py-12">
      <Suspense fallback={<p className="text-encre-douce">Chargement…</p>}>
        {searchParams.then(({ retour }) => (
          <Contenu retour={retour} />
        ))}
      </Suspense>
    </main>
  );
}

async function Contenu({ retour }: { retour: string | string[] | undefined }) {
  await connection();
  // Après le second facteur, on va là où l'on voulait aller ; par défaut, aux
  // tickets (le personnel arrive ici pour l'administration).
  const chemin = cheminDeRetour(retour);
  const destination = chemin === "/" ? "/admin/tickets" : chemin;

  const utilisateur = await lireCompteConnecte();
  // Visiteur : connexion d'abord, puis retour ici avec la même destination.
  if (!utilisateur) {
    redirect(adresseConnexion(`/double-authentification?retour=${encodeURIComponent(destination)}`));
  }
  // Client : page inexistante (même réponse que generateMetadata).
  if (utilisateur.deuxiemeFacteur === "inutile") notFound();
  if (utilisateur.deuxiemeFacteur === "valide") redirect(destination);

  const enrolement = utilisateur.deuxiemeFacteur === "a-enroler";
  return (
    <>
      <header className="border-l-4 border-cuivre pl-4">
        <p className="sur-titre text-encre-douce">Espace du personnel</p>
        <h1 className="mt-1 text-titre-1 text-marine">Double authentification</h1>
        <p className="mt-2 text-encre-douce">
          {enrolement
            ? "Vous accédez aux données de tous les clients : en plus du code reçu par e-mail, un code de votre application d'authentification est obligatoire. Configurez-la une fois, ici."
            : "En plus du code reçu par e-mail, saisissez le code affiché par votre application d'authentification."}
        </p>
      </header>
      {enrolement ? (
        <Enrolement retour={destination} email={utilisateur.email} />
      ) : (
        <Verification retour={destination} />
      )}
    </>
  );
}
