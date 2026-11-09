import Link from "next/link";

// Affichée pour une salle inconnue ou désactivée : via /salles/introuvable
// (réécriture du proxy) ou quand la fiche appelle notFound().
export default function SalleIntrouvable() {
  return (
    <main className="flex-1 bg-slate-50 px-6 py-16 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold text-orange-600">Erreur 404</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">
          Salle introuvable
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          Cette salle n&apos;existe pas ou n&apos;est plus proposée à la
          location.
        </p>
        <Link
          href="/salles"
          className="mt-8 inline-flex items-center rounded-full bg-orange-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
        >
          Voir toutes les salles
        </Link>
      </div>
    </main>
  );
}
