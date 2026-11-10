// Crée le premier administrateur, ou promeut un compte existant.
//
// L'adresse est passée à la commande, jamais écrite dans le code :
//   npm run admin:creer -- responsable@exemple.fr
//   ADMIN_EMAIL=responsable@exemple.fr npm run admin:creer
// Aucun secret : il n'y a pas de mot de passe. L'administrateur se connecte
// ensuite sur /connexion avec un code reçu à cette adresse, ce qui prouve
// qu'il en est bien le titulaire.
//
// Ne nomme que le PREMIER administrateur : refuse s'il en existe déjà un autre
// (decisionPremierAdmin, src/lib/roles.ts). À lancer sur le serveur, par
// quelqu'un qui a accès à la base.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { adresseAdmin, decisionPremierAdmin, lireRole } from "../src/lib/roles";

async function main(): Promise<number> {
  const adresse = adresseAdmin(process.argv[2] ?? process.env.ADMIN_EMAIL);
  if (!adresse) {
    console.error(
      "Adresse e-mail manquante ou invalide.\n" +
        "Usage : npm run admin:creer -- <e-mail>   (ou ADMIN_EMAIL=<e-mail>)",
    );
    return 1;
  }

  const compte = await prisma.user.findUnique({
    where: { email: adresse },
    select: { id: true, role: true },
  });
  const administrateurs = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { email: true },
  });
  const decision = decisionPremierAdmin(
    adresse,
    compte && { role: lireRole(compte.role) },
    administrateurs.map(({ email }) => email),
  );

  switch (decision.action) {
    case "refuser":
      console.error(
        `Refusé : un administrateur existe déjà (${decision.administrateurs.join(", ")}).\n` +
          "Cette commande ne nomme que le premier ; les suivants le seront depuis l'application.",
      );
      return 1;
    case "rien":
      console.log(`${adresse} est déjà administrateur : rien à faire.`);
      return 0;
    case "promouvoir":
      await prisma.user.update({ where: { email: adresse }, data: { role: "ADMIN" } });
      console.log(`${adresse} est désormais administrateur.`);
      return 0;
    case "creer":
      // E-mail non vérifié : il le sera au premier code de connexion.
      await prisma.user.create({
        data: { id: randomUUID(), email: adresse, name: "", emailVerified: false, role: "ADMIN" },
      });
      console.log(
        `Compte administrateur créé pour ${adresse}.\n` +
          "Connectez-vous sur /connexion avec le code reçu à cette adresse.",
      );
      return 0;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .finally(() => prisma.$disconnect());
