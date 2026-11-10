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

// Indicateur tournant du bouton « en cours » (animation coupée si l'usager
// a demandé moins de mouvement).
export function IconeChargement({ className = "size-5", ...props }: PropsIcone) {
  return (
    <Icone className={`animate-spin motion-reduce:animate-none ${className}`} {...props}>
      <path d="M21 12a9 9 0 1 1-6.2-8.6" />
    </Icone>
  );
}
