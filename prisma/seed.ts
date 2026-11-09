// Insère les 4 salles du centre d'affaires. Relançable sans créer de doublon :
// chaque salle est retrouvée par son slug puis mise à jour.
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const salles = [
  {
    slug: "atelier",
    nom: "L'Atelier",
    description:
      "Petite salle chaleureuse, idéale pour un entretien ou un point d'équipe.",
    capacite: 4,
    prixHeureCentimes: 2500,
    equipements: ["Écran", "Tableau blanc"],
  },
  {
    slug: "horizon",
    nom: "Horizon",
    description:
      "Salle lumineuse avec vue dégagée, pensée pour les réunions de travail.",
    capacite: 8,
    prixHeureCentimes: 4000,
    equipements: ["Écran", "Visio", "Tableau blanc"],
  },
  {
    slug: "agora",
    nom: "Agora",
    description:
      "Grande salle modulable pour les ateliers, formations et présentations.",
    capacite: 20,
    prixHeureCentimes: 7500,
    equipements: ["Vidéoprojecteur", "Visio", "Micro", "Paperboard"],
  },
  {
    slug: "conseil",
    nom: "Salle du Conseil",
    description:
      "Salle de direction au mobilier haut de gamme, pour vos rendez-vous importants.",
    capacite: 12,
    prixHeureCentimes: 6000,
    equipements: ["Écran", "Visio", "Machine à café"],
  },
];

async function main() {
  for (const { equipements, ...salle } of salles) {
    const liens = equipements.map((nom) => ({
      where: { nom },
      create: { nom },
    }));

    await prisma.salle.upsert({
      where: { slug: salle.slug },
      create: { ...salle, active: true, equipements: { connectOrCreate: liens } },
      update: {
        ...salle,
        active: true,
        equipements: { set: [], connectOrCreate: liens },
      },
    });
  }

  console.log(`Seed terminé : ${await prisma.salle.count()} salles en base.`);
}

main()
  .catch((erreur) => {
    console.error(erreur);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
