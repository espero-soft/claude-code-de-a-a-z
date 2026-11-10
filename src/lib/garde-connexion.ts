import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import {
  cleLimite,
  deciderLimite,
  LIMITE_ENVOIS,
  LIMITE_ESSAIS,
  type DecisionLimite,
  type RegleLimite,
} from "@/lib/limite-connexion";
import { entetesDe, noterEvenement } from "@/lib/garde-journal";
import type { Motif } from "@/lib/journal";
import { prisma } from "@/lib/prisma";

// Garde de la connexion par code (SECURITE.md, section 10), branchée sur
// Better Auth par ses crochets : ils passent avant chaque route, qu'elle soit
// appelée en HTTP (/api/auth/...) ou par auth.api depuis le serveur.
//   - limite par adresse e-mail des envois de codes et des essais de code ;
//   - seul le type « sign-in » peut être demandé (les autres ne servent pas).

const ROUTE_ENVOI = "/email-otp/send-verification-otp";
const ROUTE_CONNEXION = "/sign-in/email-otp";

// Routes de l'extension emailOTP que l'application n'utilise pas. Ouvertes,
// elles laissaient deviner qu'un compte existe : pour une adresse inconnue,
// un code « forget-password » est effacé aussitôt, pour un compte il reste ;
// trois faux codes sur /email-otp/check-verification-otp donnaient alors
// 403 TOO_MANY_ATTEMPTS au 4e pour un compte, 400 pour une adresse inconnue.
// À passer dans l'option disabledPaths (réponse 404).
export const ROUTES_CODE_FERMEES = [
  "/email-otp/check-verification-otp",
  "/email-otp/verify-email",
  "/email-otp/request-password-reset",
  "/email-otp/reset-password",
  "/forget-password/email-otp",
  "/email-otp/request-email-change",
  "/email-otp/change-email",
];

// Messages lus par messageErreurConnexion (src/lib/connexion.ts).
export const CODE_TROP_D_ENVOIS = "TROP_DE_CODES_DEMANDES";
export const CODE_TROP_D_ESSAIS = "TROP_D_ESSAIS_SUR_CETTE_ADRESSE";

// Compte une demande, sans course possible entre deux requêtes simultanées :
// on écrit seulement si la ligne n'a pas changé depuis sa lecture, sinon on
// relit et on recommence. Après plusieurs collisions, on refuse (en cas de
// doute, on ne laisse pas passer).
export async function consommerLimite(
  cle: string,
  regle: RegleLimite,
  maintenant = new Date(),
): Promise<DecisionLimite> {
  for (let tentative = 0; tentative < 5; tentative++) {
    const ligne = await prisma.limiteConnexion.findUnique({ where: { cle } });
    const decision = deciderLimite(ligne, regle, maintenant);
    if (!decision.autorise) return decision;
    if (!ligne) {
      try {
        await prisma.limiteConnexion.create({ data: { cle, ...decision.suivant } });
        return decision;
      } catch {
        continue; // créée entre-temps par une autre requête : on relit
      }
    }
    const { count } = await prisma.limiteConnexion.updateMany({
      where: { cle, nombre: ligne.nombre, debut: ligne.debut },
      data: decision.suivant,
    });
    if (count === 1) return decision;
  }
  return { autorise: false, reessayerDansSecondes: 1 };
}

type Contexte = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

const MOTIF_BLOCAGE: Record<"envoi" | "essai", Motif> = {
  envoi: "trop-de-codes-demandes",
  essai: "trop-d-essais-de-code",
};

async function exigerLimite(
  contexte: Contexte,
  type: "envoi" | "essai",
  regle: RegleLimite,
  code: string,
) {
  const email: unknown = contexte.body?.email;
  // Sans adresse valable, la route refusera la requête d'elle-même.
  if (typeof email !== "string") return;
  const decision = await consommerLimite(cleLimite(type, email), regle);
  if (decision.autorise) return;
  // Refus levé ici, avant la route : les crochets « after » du journal ne
  // passeront pas, on journalise donc le blocage nous-mêmes.
  await noterEvenement(
    { type: "COMPTE_BLOQUE", email, motif: MOTIF_BLOCAGE[type] },
    entetesDe(contexte),
  );
  throw new APIError(
    "TOO_MANY_REQUESTS",
    {
      code,
      message: "Too many requests for this email address",
      reessayerDansSecondes: decision.reessayerDansSecondes,
    },
    { "Retry-After": String(decision.reessayerDansSecondes) },
  );
}

export function gardeConnexion() {
  return {
    id: "garde-connexion",
    hooks: {
      before: [
        {
          matcher: (contexte) => contexte.path === ROUTE_ENVOI,
          handler: createAuthMiddleware(async (contexte) => {
            if (contexte.body?.type !== "sign-in") {
              throw APIError.from("BAD_REQUEST", {
                code: "INVALID_OTP_TYPE",
                message: "Invalid OTP type",
              });
            }
            await exigerLimite(contexte, "envoi", LIMITE_ENVOIS, CODE_TROP_D_ENVOIS);
          }),
        },
        {
          // Compté avant la vérification : un essai, bon ou faux, compte.
          matcher: (contexte) => contexte.path === ROUTE_CONNEXION,
          handler: createAuthMiddleware(async (contexte) => {
            await exigerLimite(contexte, "essai", LIMITE_ESSAIS, CODE_TROP_D_ESSAIS);
          }),
        },
      ],
      after: [
        {
          // Connexion réussie : les fautes de frappe d'avant sont oubliées.
          matcher: (contexte) => contexte.path === ROUTE_CONNEXION,
          handler: createAuthMiddleware(async (contexte) => {
            const email = contexte.body?.email;
            if (typeof email !== "string" || isAPIError(contexte.context.returned)) return;
            await prisma.limiteConnexion.deleteMany({ where: { cle: cleLimite("essai", email) } });
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
