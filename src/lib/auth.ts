import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { twoFactor } from "better-auth/plugins/two-factor";
import { envoyerCourriel } from "@/lib/courriel";
import { gardeConnexion, ROUTES_CODE_FERMEES } from "@/lib/garde-connexion";
import {
  gardeDeuxiemeFacteur,
  NOM_EMETTEUR_TOTP,
  ROUTES_DEUXIEME_FACTEUR_FERMEES,
} from "@/lib/garde-deuxieme-facteur";
import { journalConnexions } from "@/lib/garde-journal";
import { prisma } from "@/lib/prisma";
import { rattacherReservationsSansCompte } from "@/lib/rattachement";
import { ROLE_PAR_DEFAUT } from "@/lib/roles";

// Authentification sans mot de passe (décision du module 12, voir SECURITE.md) :
// un seul écran « Connexion » ; on saisit son e-mail, on reçoit un code à
// 6 chiffres, on le saisit. Le compte est créé au premier code validé, avec
// un e-mail vérifié de fait.

const DUREE_CODE_SECONDES = 5 * 60;

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  // Pas d'e-mail + mot de passe : emailAndPassword reste désactivé (défaut).
  // Routes de code inutilisées fermées (404) : elles trahissaient l'existence
  // d'un compte (voir garde-connexion.ts).
  disabledPaths: [...ROUTES_CODE_FERMEES, ...ROUTES_DEUXIEME_FACTEUR_FERMEES],
  session: {
    additionalFields: {
      // Date de validation du second facteur dans CETTE session (personnel
      // seulement), posée par gardeDeuxiemeFacteur après un code correct.
      // Jamais modifiable depuis le navigateur (input: false).
      deuxiemeFacteurLe: { type: "date", required: false, input: false },
    },
  },
  user: {
    additionalFields: {
      // Rôle du compte (src/lib/roles.ts) : CLIENT à la création, EMPLOYE ou
      // ADMIN attribué côté serveur seulement (`npm run admin:creer`).
      // input: false : ni l'inscription ni /update-user n'acceptent ce champ
      // venant du navigateur.
      role: {
        type: "string",
        required: false,
        defaultValue: ROLE_PAR_DEFAUT,
        input: false,
      },
    },
  },
  databaseHooks: {
    session: {
      create: {
        // À chaque connexion : réservations faites sans compte rattachées par
        // l'e-mail, si l'adresse est vérifiée (src/lib/rattachement.ts). Ne
        // fait jamais échouer la connexion ; l'espace client réessaie.
        async after(session) {
          try {
            await rattacherReservationsSansCompte(session.userId);
          } catch (erreur) {
            console.error("Rattachement des réservations impossible", erreur);
          }
        },
      },
    },
  },
  rateLimit: {
    // Compteurs en base plutôt qu'en mémoire : ils survivent à un redémarrage.
    // Actif en production seulement (défaut de Better Auth). Limite par IP,
    // lue dans X-Forwarded-For : contournable si le proxy de production ne
    // réécrit pas cet en-tête. La limite par adresse e-mail de gardeConnexion
    // ne dépend pas de l'IP et reste active partout.
    storage: "database",
  },
  plugins: [
    // Journal des connexions (SECURITE.md, section 15) : réussites et refus
    // des routes ; les blocages des gardes sont journalisés par elles.
    journalConnexions(),
    gardeConnexion(),
    // Avant twoFactor : ses crochets passent avant les routes /two-factor/*.
    gardeDeuxiemeFacteur(),
    // Second facteur du personnel (SECURITE.md, section 13). Le module ne
    // s'enclenche seul qu'après un mot de passe : ici, il sert à créer le
    // secret et les codes de secours (chiffrés en base) et à vérifier un
    // code ; c'est gardeDeuxiemeFacteur qui l'impose au personnel.
    twoFactor({
      issuer: NOM_EMETTEUR_TOTP,
      // Pas de mot de passe dans l'application : sans cette option, chaque
      // route exigerait un mot de passe que personne n'a. Les routes qui en
      // deviendraient dangereuses sont fermées (ROUTES_DEUXIEME_FACTEUR_FERMEES).
      allowPasswordless: true,
      // Codes de secours : 10, chiffrés en base, à usage unique (défauts).
      backupCodeOptions: { amount: 10, length: 10, storeBackupCodes: "encrypted" },
    }),
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
