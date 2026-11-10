import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { envoyerCourriel } from "@/lib/courriel";
import { prisma } from "@/lib/prisma";

// Authentification sans mot de passe (décision du module 12, voir SECURITE.md) :
// un seul écran « Connexion » ; on saisit son e-mail, on reçoit un code à
// 6 chiffres, on le saisit. Le compte est créé au premier code validé, avec
// un e-mail vérifié de fait.

const DUREE_CODE_SECONDES = 5 * 60;

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  // Pas d'e-mail + mot de passe : emailAndPassword reste désactivé (défaut).
  rateLimit: {
    // Compteurs en base plutôt qu'en mémoire : ils survivent à un redémarrage.
    // Actif en production seulement (défaut de Better Auth).
    storage: "database",
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: DUREE_CODE_SECONDES,
      allowedAttempts: 3,
      // Le code n'est jamais stocké en clair (défaut de Better Auth : "plain").
      storeOTP: "hashed",
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "sign-in") return; // seul parcours utilisé pour l'instant
        // Pas d'await : le temps de réponse ne doit pas révéler l'envoi
        // (recommandation de Better Auth contre les attaques temporelles).
        void envoyerCourriel({
          a: email,
          sujet: `Votre code de connexion Réunéa : ${otp}`,
          texte:
            `Votre code de connexion est ${otp}.\n\n` +
            `Il est valable ${DUREE_CODE_SECONDES / 60} minutes et ne sert qu'une fois.\n` +
            "Si vous n'avez rien demandé, ignorez cet e-mail.",
        }).catch((erreur) => {
          console.error("Échec de l'envoi du code de connexion", erreur);
        });
      },
    }),
    // Doit rester le dernier : pose les cookies depuis une Server Action.
    nextCookies(),
  ],
});
