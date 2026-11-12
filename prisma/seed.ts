// Insère les 4 salles du centre d'affaires (photos optimisées dans
// public/salles, d'après design/photos) et, hors production seulement
// (reservationDemoAutorisee), une réservation confirmée de démonstration. Relançable sans créer de doublon : chaque salle est retrouvée
// par son slug, la réservation par son identifiant fixe, puis mise à jour.
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { calculerMontant } from "../src/lib/montant";
import { reservationDemoAutorisee } from "../src/lib/configuration";
import { dateDemo } from "../src/lib/date-demo";
import { heureDeParis } from "../src/lib/reservation";

const salles = [
  {
    slug: "atelier",
    photo: "/salles/atelier.jpg",
    nom: "L'Atelier",
    description:
      "Petite salle chaleureuse, idéale pour un entretien ou un point d'équipe.",
    capacite: 4,
    prixHeureCentimes: 2500,
    equipements: ["Écran", "Tableau blanc"],
  },
  {
    slug: "horizon",
    photo: "/salles/horizon.jpg",
    nom: "Horizon",
    description:
      "Salle lumineuse avec vue dégagée, pensée pour les réunions de travail.",
    capacite: 8,
    prixHeureCentimes: 4000,
    equipements: ["Écran", "Visio", "Tableau blanc"],
  },
  {
    slug: "agora",
    photo: "/salles/agora.jpg",
    nom: "Agora",
    description:
      "Grande salle modulable pour les ateliers, formations et présentations.",
    capacite: 20,
    prixHeureCentimes: 7500,
    equipements: ["Vidéoprojecteur", "Visio", "Micro", "Paperboard"],
  },
  {
    slug: "conseil",
    photo: "/salles/conseil.jpg",
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

  // Jamais en production : elle bloquerait un vrai créneau (R3).
  if (reservationDemoAutorisee(process.env)) {
    await insererReservationDemo();
  } else {
    console.log("Production : pas de réservation de démonstration.");
  }

  console.log(`Seed terminé : ${await prisma.salle.count()} salles en base.`);
}

// Réservation CONFIRMÉE de démonstration, pour voir R3 dans le navigateur :
// réserver Horizon un mardi à venir (dateDemo) entre 10 h et 12 h doit être refusé.
// Identifiant fixe : relancer le seed la remet à jour au lieu de la dupliquer.
async function insererReservationDemo() {
  const horizon = await prisma.salle.findUniqueOrThrow({
    where: { slug: "horizon" },
  });
  const debut = heureDeParis(dateDemo(), "10:00");
  const fin = heureDeParis(dateDemo(), "12:00");
  const reservation = {
    salleId: horizon.id,
    debut,
    fin,
    nomClient: "Client de démonstration",
    emailClient: "demo@example.com",
    statut: "CONFIRMEE" as const,
    montantTotalCentimes: calculerMontant(horizon.prixHeureCentimes, debut, fin),
  };

  await prisma.reservation.upsert({
    where: { id: "demo-r3-horizon" },
    create: { id: "demo-r3-horizon", ...reservation },
    update: reservation,
  });
}

main()
  .catch((erreur) => {
    console.error(erreur);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
