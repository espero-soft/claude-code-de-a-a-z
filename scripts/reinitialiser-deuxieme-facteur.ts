// Réinitialise le second facteur d'un employé ou d'un administrateur qui a
// perdu À LA FOIS son téléphone et ses codes de secours.
//
//   npm run deuxieme-facteur:reinitialiser -- employe@exemple.fr
//
// La route /two-factor/disable est fermée dans l'application (la seule
// session e-mail suffirait à l'appeler) : seule une personne qui a accès au
// serveur peut réinitialiser. L'adresse est passée à la commande, jamais
// écrite dans le code. Toutes les sessions du compte sont fermées : à la
// prochaine connexion, l'écran /double-authentification guide un nouvel
// enrôlement (nouvelle clé, nouveaux codes de secours).
// Vérifier l'identité de la personne AVANT de lancer cette commande.
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { adresseAdmin } from "../src/lib/roles";

async function main(): Promise<number> {
  const adresse = adresseAdmin(process.argv[2]);
  if (!adresse) {
    console.error("Usage : npm run deuxieme-facteur:reinitialiser -- <e-mail>");
    return 1;
  }
  const compte = await prisma.user.findUnique({ where: { email: adresse }, select: { id: true } });
  if (!compte) {
    console.error(`Aucun compte pour ${adresse}.`);
    return 1;
  }
  const [facteurs, sessions] = await prisma.$transaction([
    prisma.twoFactor.deleteMany({ where: { userId: compte.id } }),
    prisma.session.deleteMany({ where: { userId: compte.id } }),
    prisma.user.update({ where: { id: compte.id }, data: { twoFactorEnabled: false } }),
  ]);
  console.log(
    `Second facteur de ${adresse} réinitialisé (${facteurs.count} configuration supprimée, ` +
      `${sessions.count} session(s) fermée(s)). Nouvel enrôlement à la prochaine connexion.`,
  );
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .finally(() => prisma.$disconnect());
