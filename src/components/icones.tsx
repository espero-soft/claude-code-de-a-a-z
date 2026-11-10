import type { SVGProps } from "react";

// Icônes au trait (charte : 1,5 à 2 px, coins arrondis), tracés repris du
// style Lucide, en SVG en ligne pour ne pas ajouter de dépendance.
// Décoratives par défaut (aria-hidden) : le sens est toujours porté par un mot.
type PropsIcone = SVGProps<SVGSVGElement>;

function Icone({ children, className = "size-5", ...props }: PropsIcone) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconeMenu(props: PropsIcone) {
  return (
    <Icone {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Icone>
  );
}

export function IconeFermer(props: PropsIcone) {
  return (
    <Icone {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icone>
  );
}

export function IconeFleche(props: PropsIcone) {
  return (
    <Icone {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icone>
  );
}

// Retour (lien « ← Nos salles » de la fiche sur mobile).
export function IconeRetour(props: PropsIcone) {
  return (
    <Icone {...props}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </Icone>
  );
}

// Séparateur du fil d'Ariane.
export function IconeChevron(props: PropsIcone) {
  return (
    <Icone {...props}>
      <path d="m9 18 6-6-6-6" />
    </Icone>
  );
}

// Coche simple (liste des équipements d'une salle).
export function IconeCoche(props: PropsIcone) {
  return (
    <Icone {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Icone>
  );
}

export function IconeInfo(props: PropsIcone) {
  return (
    <Icone {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </Icone>
  );
}

export function IconeAlerte(props: PropsIcone) {
  return (
    <Icone {...props}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </Icone>
  );
}

export function IconeErreur(props: PropsIcone) {
  return (
    <Icone {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </Icone>
  );
}

export function IconeSucces(props: PropsIcone) {
  return (
    <Icone {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m8 12 3 3 5-6" />
    </Icone>
  );
}

export function IconeAnnule(props: PropsIcone) {
  return (
    <Icone {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6M9 9l6 6" />
    </Icone>
  );
}

export function IconeHorloge(props: PropsIcone) {
  return (
    <Icone {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </Icone>
  );
}

export function IconeCalendrier(props: PropsIcone) {
  return (
    <Icone {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </Icone>
  );
}

export function IconePersonnes(props: PropsIcone) {
  return (
    <Icone {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </Icone>
  );
}

// Étiquette de prix (devant un tarif, à la place de l'icône d'écran des maquettes).
export function IconeEtiquette(props: PropsIcone) {
  return (
    <Icone {...props}>
      <path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4Z" />
      <circle cx="7.5" cy="7.5" r="1" />
    </Icone>
  );
}

export function IconeCarteBancaire(props: PropsIcone) {
  return (
    <Icone {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </Icone>
  );
}

// Écran de présentation (salles équipées).
export function IconeEcran(props: PropsIcone) {
  return (
    <Icone {...props}>
      <path d="M2 3h20M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3M7 21l5-5 5 5" />
    </Icone>
  );
}

export function IconeMallette(props: PropsIcone) {
  return (
    <Icone {...props}>
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect x="2" y="6" width="20" height="14" rx="2" />
    </Icone>
  );
}

// Indicateur tournant du bouton « en cours » (animation coupée si l'usager
// a demandé moins de mouvement).
export function IconeChargement({ className = "size-5", ...props }: PropsIcone) {
  return (
    <Icone className={`animate-spin motion-reduce:animate-none ${className}`} {...props}>
      <path d="M21 12a9 9 0 1 1-6.2-8.6" />
    </Icone>
  );
}
