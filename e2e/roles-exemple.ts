// Comptes de test, un par rôle (voir e2e/comptes-roles.ts). Domaine
// @roles.example.com : supprimés par e2e/nettoyage.ts.
export const DOMAINE_ROLES = "@roles.example.com";

export const COMPTES_ROLES = {
  clientA: { email: `client-a${DOMAINE_ROLES}`, role: "CLIENT", nom: "Titulaire Test Rôles" },
  clientB: { email: `client-b${DOMAINE_ROLES}`, role: "CLIENT", nom: "" },
  employe: { email: `employe${DOMAINE_ROLES}`, role: "EMPLOYE", nom: "" },
  admin: { email: `admin${DOMAINE_ROLES}`, role: "ADMIN", nom: "" },
} as const;

// Cliente de l'espace client (e2e/espace-client-exemple.ts), adresse vérifiée.
export const CLAIRE = { email: `claire${DOMAINE_ROLES}`, nom: "Claire Dubois" } as const;

// Client de la page « Mon profil » (e2e/profil-exemple.ts) : il change de
// nom, déconnecte un appareil, puis supprime son compte.
export const PAUL = { email: `paul${DOMAINE_ROLES}`, nom: "Paul Martin" } as const;
