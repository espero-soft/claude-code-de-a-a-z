import type { Metadata } from "next";
import { Introuvable } from "@/components/Introuvable";

export const metadata: Metadata = { title: "Salle introuvable" };

// Affichée pour une salle inconnue ou désactivée : via /salles/introuvable
// (réécriture du proxy) ou quand la fiche appelle notFound().
// Le centre ne loue que des salles de réunion.
export default function SalleIntrouvable() {
  return (
    <Introuvable titre="Salle introuvable" lien={{ href: "/salles", texte: "Voir toutes les salles" }}>
      <p>Cette salle n&apos;existe pas ou n&apos;est plus proposée à la location.</p>
      <p className="text-encre-douce">Découvrez nos autres salles de réunion.</p>
    </Introuvable>
  );
}
