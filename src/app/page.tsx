import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center bg-white px-6 py-24 text-slate-900">
      <div className="max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-orange-600">
          Projet fil rouge
        </p>
        <h1 className="mt-4 text-5xl font-bold tracking-tight">
          Application de réservation
        </h1>
        <p className="mt-6 text-lg leading-8 text-slate-600">
          Le point de départ est prêt. Dans le module 2 de la formation, nous
          allons construire cette application pas à pas avec Claude Code.
        </p>
        <div className="mt-8">
          <Link
            href="/salles"
            className="inline-block rounded-full bg-orange-600 px-6 py-3 font-semibold text-white hover:bg-orange-700"
          >
            Voir les salles
          </Link>
        </div>
        <p className="mt-10 inline-block rounded-full bg-slate-100 px-5 py-2 font-mono text-sm text-slate-700">
          Formation : Claude Code de A à Z
        </p>
      </div>
    </main>
  );
}
