// Point d'entrée stdio, lancé par Claude Code d'après .mcp.json (depuis la
// racine du projet, avec DATABASE_URL). Rien ne doit être écrit sur stdout,
// réservé au protocole : les messages de diagnostic vont sur stderr.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { prisma } from "@/lib/prisma";
import { creerServeur } from "./serveur";

const serveur = creerServeur({
  // Une salle inactive est traitée comme inexistante, comme dans l'application.
  chercherSalle: (salle) =>
    prisma.salle.findFirst({
      where: { active: true, OR: [{ slug: salle }, { id: salle }] },
      select: { slug: true, nom: true },
    }),
});

serveur
  .connect(new StdioServerTransport())
  .then(() => console.error("Serveur MCP regles-metier prêt (stdio)."))
  .catch((erreur) => {
    console.error("Échec du démarrage du serveur MCP regles-metier :", erreur);
    process.exit(1);
  });
