import type { ElementType, ReactNode } from "react";

// Carte posée sur le fond : surface blanche, bordure, ombre unique.
// `grande` pour les grandes cartes de salle (arrondi-l), sinon arrondi-m.
export function Carte({
  as: Balise = "div",
  grande = false,
  avecMarge = true,
  className = "",
  children,
}: {
  // Élément rendu (section, article, li...) pour garder une structure juste.
  as?: ElementType;
  grande?: boolean;
  // Sans marge intérieure pour une carte à photo pleine largeur en haut.
  avecMarge?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Balise
      className={`border border-bordure bg-surface shadow-carte ${
        grande ? "overflow-hidden rounded-arrondi-l" : "rounded-arrondi-m"
      } ${avecMarge ? "p-6" : ""} ${className}`}
    >
      {children}
    </Balise>
  );
}
