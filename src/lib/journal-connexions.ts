import type { PrismaClient } from "@/generated/prisma/client";
import {
  limiteConservation,
  normaliserFiltreEmail,
  preparerEvenement,
  type Evenement,
} from "@/lib/journal";

// Écriture, purge et lecture du journal des connexions (table
// EvenementConnexion). Le client Prisma est passé en paramètre : testé sur
// une vraie base SQLite temporaire (journal-connexions.test.ts).

type Client = Pick<PrismaClient, "evenementConnexion" | "$queryRaw">;

// Efface ce qui a plus de 90 jours. Renvoie le nombre de lignes effacées.
export async function purgerJournal(client: Client, maintenant = new Date()): Promise<number> {
  const { count } = await client.evenementConnexion.deleteMany({
    where: { createdAt: { lt: limiteConservation(maintenant) } },
  });
  return count;
}

// Enregistre un événement, puis efface les lignes trop anciennes : la
// conservation est tenue à chaque écriture, sans tâche planifiée.
// Ne fait JAMAIS échouer l'opération journalisée (une connexion ne doit pas
// être refusée parce que le journal est indisponible) : renvoie false.
export async function journaliser(
  client: Client,
  evenement: Evenement,
  maintenant = new Date(),
): Promise<boolean> {
  try {
    const ligne = preparerEvenement(evenement, maintenant);
    if (!ligne) return false;
    await client.evenementConnexion.create({ data: ligne });
    await purgerJournal(client, maintenant);
    return true;
  } catch (erreur) {
    console.error("Journal des connexions : écriture impossible", erreur);
    return false;
  }
}

export const NOMBRE_MAX_LIGNES = 200;

// Les événements les plus récents, filtrés sur une partie de l'adresse
// e-mail. Purge d'abord : la page n'affiche jamais une ligne de plus de 90 jours,
// même si personne ne s'est connecté depuis.
export async function lireJournal(
  client: Client,
  filtre: { email?: unknown },
  maintenant = new Date(),
) {
  await purgerJournal(client, maintenant);
  const email = normaliserFiltreEmail(filtre.email);
  // Sous SQLite, `contains` de Prisma devient un LIKE sans échappement : « % »
  // et « _ » y seraient des jokers (« % » afficherait tout). instr() cherche
  // la sous-chaîne telle quelle ; valeur passée en paramètre, jamais collée.
  let ids: string[] | undefined;
  if (email) {
    const lignes = await client.$queryRaw<{ id: string }[]>`
      SELECT id FROM EvenementConnexion WHERE instr(email, ${email}) > 0`;
    ids = lignes.map((ligne) => ligne.id);
  }
  return client.evenementConnexion.findMany({
    where: ids ? { id: { in: ids } } : {},
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: NOMBRE_MAX_LIGNES,
    select: {
      id: true,
      type: true,
      email: true,
      motif: true,
      ip: true,
      navigateur: true,
      createdAt: true,
    },
  });
}
