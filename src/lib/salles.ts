import { prisma } from "./prisma";

// Salles proposées au public, partagées par l'accueil et /salles : seules
// les salles actives (une salle inactive est traitée comme inexistante),
// par capacité croissante, avec leurs équipements par ordre alphabétique.
export function listerSallesActives() {
  return prisma.salle.findMany({
    where: { active: true },
    include: { equipements: { orderBy: { nom: "asc" } } },
    orderBy: { capacite: "asc" },
  });
}
