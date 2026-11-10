import type { Metadata } from "next";
import { Introuvable } from "@/components/Introuvable";
import { TITRE_INTROUVABLE } from "@/lib/introuvable";

export const metadata: Metadata = { title: TITRE_INTROUVABLE };

// Page introuvable générale, en français et au design Réunéa : adresse
// inconnue, ou notFound() appelé par une page (par exemple une réservation
// inexistante ou celle d'un autre client : même réponse, volontairement).
// Le texte ne dit jamais si la page existe.
export default function PageIntrouvable() {
  return (
    <Introuvable titre={TITRE_INTROUVABLE} lien={{ href: "/", texte: "Retour à l'accueil" }}>
      <p>Cette page n&apos;existe pas, ou vous n&apos;y avez pas accès.</p>
      <p className="text-encre-douce">
        Vérifiez l&apos;adresse, et que vous êtes connecté avec le bon compte.
      </p>
    </Introuvable>
  );
}
