"use client";

import { useSyncExternalStore } from "react";

// Minutes restantes avant l'annulation R6, recalculées toutes les 15 secondes
// dans le navigateur : un nombre écrit par le serveur serait faux après
// quelques minutes passées sur la page. L'heure limite exacte, elle, est
// affichée par le serveur à côté ; ce décompte n'est qu'une aide.
function abonner(rafraichir: () => void) {
  const minuterie = setInterval(rafraichir, 15_000);
  return () => clearInterval(minuterie);
}

export function DelaiRestant({ limite }: { limite: number }) {
  const minutes = useSyncExternalStore(
    abonner,
    () => Math.ceil((limite - Date.now()) / 60_000),
    // Rendu serveur et hydratation : rien, pour ne pas écrire un nombre que
    // l'horloge du navigateur contredirait.
    () => null,
  );

  if (minutes === null) return null;
  if (minutes <= 0) {
    return <>Le délai est dépassé : rechargez la page pour voir le statut.</>;
  }
  if (minutes === 1) return <>Il reste moins d&apos;une minute.</>;
  return <>Il reste environ {minutes} minutes.</>;
}
