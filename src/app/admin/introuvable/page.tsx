import { notFound } from "next/navigation";

// Cible de la réécriture faite par src/proxy.ts quand un compte sans rôle du
// personnel ouvre /admin : la même réponse qu'une page inexistante, avec un
// vrai code 404. notFound() est appelé dès le build : la page reste statique.
export default function Introuvable() {
  notFound();
}
