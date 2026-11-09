import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Réserver une salle",
};

// Le formulaire de réservation viendra à l'étape suivante.
export default function ReserverPage() {
  return (
    <main className="flex-1 bg-slate-50 px-6 py-16 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-bold tracking-tight">
          Réserver une salle
        </h1>
      </div>
    </main>
  );
}
