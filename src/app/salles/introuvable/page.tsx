import { notFound } from "next/navigation";

// Cible de la réécriture faite par src/proxy.ts pour une salle inconnue.
// Ce segment fixe passe avant [id]. notFound() est appelé dès le build : la
// page reste statique et répond un vrai 404, avec le contenu de
// ../not-found.tsx.
export default function Introuvable() {
  notFound();
}
