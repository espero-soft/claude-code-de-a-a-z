// Données fictives en attendant la base de données (Prisma, module 2).
// Les champs suivent l'entité « Salle » du cahier des charges.

export type Salle = {
  id: string;
  nom: string;
  description: string;
  capacite: number;
  prixParHeure: number; // en euros
  equipements: string[];
  photo?: string;
  active: boolean;
};

export const salles: Salle[] = [
  {
    id: "atelier",
    nom: "L'Atelier",
    description:
      "Petite salle chaleureuse, idéale pour un entretien ou un point d'équipe.",
    capacite: 4,
    prixParHeure: 25,
    equipements: ["Écran", "Tableau blanc"],
    active: true,
  },
  {
    id: "horizon",
    nom: "Horizon",
    description:
      "Salle lumineuse avec vue dégagée, pensée pour les réunions de travail.",
    capacite: 8,
    prixParHeure: 40,
    equipements: ["Écran", "Visio", "Tableau blanc"],
    active: true,
  },
  {
    id: "agora",
    nom: "Agora",
    description:
      "Grande salle modulable pour les ateliers, formations et présentations.",
    capacite: 20,
    prixParHeure: 75,
    equipements: ["Vidéoprojecteur", "Visio", "Micro", "Paperboard"],
    active: true,
  },
  {
    id: "conseil",
    nom: "Salle du Conseil",
    description:
      "Salle de direction au mobilier haut de gamme, pour vos rendez-vous importants.",
    capacite: 12,
    prixParHeure: 60,
    equipements: ["Écran", "Visio", "Machine à café"],
    active: true,
  },
];
