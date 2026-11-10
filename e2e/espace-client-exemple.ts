// Prépare dans dev.db le compte de Claire (adresse vérifiée) et une
// réservation par cas de l'espace client (e2e/compte.spec.ts), plus deux
// réservations faites SANS compte : l'une à l'adresse de Claire (casse et
// espaces différents), à rattacher à sa connexion ; l'autre à une autre
// adresse, qui ne doit pas l'être. Écrit les identifiants en JSON.
// Adresses @roles.example.com, supprimées par e2e/nettoyage.ts.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { calculerMontant } from "../src/lib/montant";
import { dateDemo } from "../src/lib/date-demo";
import { heureDeParis } from "../src/lib/reservation";
import { CLAIRE } from "./roles-exemple";

const JOUR_MS = 86_400_000;
// Un mardi, `semaines` après celui de la démonstration (négatif : passé).
const mardi = (semaines: number) => dateDemo(new Date(Date.now() + semaines * 7 * JOUR_MS));

async function main() {
  const claire = await prisma.user.upsert({
    where: { email: CLAIRE.email },
    create: { id: randomUUID(), email: CLAIRE.email, name: CLAIRE.nom, emailVerified: true },
    update: { name: CLAIRE.nom, emailVerified: true },
    select: { id: true },
  });
  const salles = Object.fromEntries(
    (await prisma.salle.findMany({ select: { id: true, slug: true, prixHeureCentimes: true } })).map(
      (s) => [s.slug, s],
    ),
  );

  async function creer(
    slug: string,
    date: string,
    heures: [string, string],
    statut: "EN_ATTENTE" | "CONFIRMEE" | "ANNULEE",
    titulaire: { utilisateurId: string | null; emailClient: string; nomClient: string },
  ) {
    const salle = salles[slug];
    const debut = heureDeParis(date, heures[0]);
    const fin = heureDeParis(date, heures[1]);
    const { id } = await prisma.reservation.create({
      data: {
        salleId: salle.id,
        debut,
        fin,
        statut,
        montantTotalCentimes: calculerMontant(salle.prixHeureCentimes, debut, fin),
        ...titulaire,
      },
      select: { id: true },
    });
    return id;
  }

  const deClaire = { utilisateurId: claire.id, emailClient: CLAIRE.email, nomClient: CLAIRE.nom };
  const ids = {
    prochaine: await creer("atelier", mardi(1), ["09:00", "11:00"], "CONFIRMEE", deClaire),
    ensuite: await creer("conseil", mardi(2), ["14:00", "16:00"], "CONFIRMEE", deClaire),
    enAttente: await creer("agora", mardi(0), ["15:00", "16:00"], "EN_ATTENTE", deClaire),
    passee: await creer("horizon", mardi(-3), ["10:00", "12:00"], "CONFIRMEE", deClaire),
    annulee: await creer("agora", mardi(1), ["16:00", "17:00"], "ANNULEE", deClaire),
    // Faite sans compte, à l'adresse de Claire écrite autrement.
    sansCompte: await creer("conseil", mardi(3), ["08:00", "09:00"], "CONFIRMEE", {
      utilisateurId: null,
      emailClient: `  ${CLAIRE.email.toUpperCase()}`,
      nomClient: "Claire (sans compte)",
    }),
    // Faite sans compte par quelqu'un d'autre : jamais rattachée à Claire.
    autreAdresse: await creer("atelier", mardi(3), ["08:00", "09:00"], "CONFIRMEE", {
      utilisateurId: null,
      emailClient: "autre-personne@roles.example.com",
      nomClient: "Autre personne",
    }),
  };
  process.stdout.write(JSON.stringify(ids));
}

main().finally(() => prisma.$disconnect());
