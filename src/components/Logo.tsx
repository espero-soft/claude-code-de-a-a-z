// Logo Réunéa redessiné en SVG d'après design/logo/ : monogramme R à
// empattements traversé d'un trait cuivre, filet vertical cuivre, puis le
// mot « RÉUNÉA » (Playfair Display) et « CENTRE DE DÉMONSTRATION » (Manrope).
// Deux versions : « marine » sur fond clair, « clair » sur l'en-tête marine.

// Tracés du monogramme, dans une boîte de 100 × 100. Partagés avec le
// favicon (src/app/icon.svg reprend les mêmes chemins).
export const TRACE_R =
  "M14 12H54C72 12 82 21 82 35C82 47 74 55 61 57C68 67 76 80 84 84C86 85 89 86 92 86V88H74C64 82 56 70 47 58H39V82C39 85 41 86 45 86V88H14V86C18 86 22 85 22 82V18C22 15 18 14 14 14ZM39 16V54H51C61 54 65 46 65 35C65 23 59 16 50 16Z";
export const TRACE_TRAIT =
  "M6 90C16 70 40 60 62 54C72 51 80 47 84 40C81 50 71 55 59 59C39 65 20 72 6 90Z";

const COULEURS = {
  marine: { lettre: "#1B3A5C", trait: "#A8501A", texte: "#1B3A5C", filet: "#A8501A" },
  // Sur marine, le cuivre de la charte manque de contraste (2 pour 1) : on
  // prend cuivre-sur-marine (globals.css), comme sur la planche de marque.
  clair: {
    lettre: "#FFFFFF",
    trait: "var(--color-cuivre-sur-marine)",
    texte: "#FFFFFF",
    filet: "var(--color-cuivre-sur-marine)",
  },
};

export function Monogramme({
  variante = "marine",
  className,
}: {
  variante?: keyof typeof COULEURS;
  className?: string;
}) {
  const c = COULEURS[variante];
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className={className}>
      <path d={TRACE_R} style={{ fill: c.lettre }} />
      <path d={TRACE_TRAIT} style={{ fill: c.trait }} />
    </svg>
  );
}

export function Logo({
  variante = "marine",
  className = "h-10 w-auto",
}: {
  variante?: keyof typeof COULEURS;
  className?: string;
}) {
  const c = COULEURS[variante];
  // textLength fixe la largeur des deux lignes, quelle que soit la police
  // réellement chargée (ou sa police de secours) : le logo ne bouge pas.
  return (
    <svg
      viewBox="0 0 372 100"
      role="img"
      aria-label="Réunéa, centre de démonstration"
      className={className}
    >
      <path d={TRACE_R} style={{ fill: c.lettre }} />
      <path d={TRACE_TRAIT} style={{ fill: c.trait }} />
      <rect x="112" y="14" width="3.5" height="72" style={{ fill: c.filet }} />
      <text
        x="134"
        y="62"
        textLength="232"
        lengthAdjust="spacingAndGlyphs"
        style={{ fill: c.texte, fontFamily: "var(--font-titres)", fontWeight: 700, fontSize: 54 }}
      >
        RÉUNÉA
      </text>
      <text
        x="136"
        y="84"
        textLength="228"
        lengthAdjust="spacingAndGlyphs"
        style={{ fill: c.texte, fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 12.5 }}
      >
        CENTRE DE DÉMONSTRATION
      </text>
    </svg>
  );
}
