import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { lireIp, motifRefusCode, type Evenement } from "@/lib/journal";
import { journaliser } from "@/lib/journal-connexions";
import { prisma } from "@/lib/prisma";

// Journal des connexions (SECURITE.md, section 15) branché sur Better Auth.
// Les crochets « after » voient le résultat de la route : réussite ou refus.
// Un refus levé par un crochet « before » (limites de gardeConnexion et de
// gardeDeuxiemeFacteur, rejeu d'un code) arrête tout, crochets « after »
// compris : ces gardes journalisent elles-mêmes avant de refuser.
//
// Jamais le corps de la requête dans le journal : il contient le code. Seuls
// l'adresse e-mail, le compte, l'adresse IP et le navigateur sont repris.

const ROUTE_ENVOI = "/email-otp/send-verification-otp";
const ROUTE_CONNEXION = "/sign-in/email-otp";
const ROUTE_TOTP = "/two-factor/verify-totp";
const ROUTE_SECOURS = "/two-factor/verify-backup-code";
const ROUTE_DECONNEXION = "/sign-out";

// Enregistre un événement avec l'adresse IP et le navigateur de la requête.
// N'échoue jamais (voir journaliser).
export function noterEvenement(
  evenement: Omit<Evenement, "ip" | "navigateur">,
  entetes: Headers | null | undefined,
): Promise<boolean> {
  return journaliser(prisma, {
    ...evenement,
    ip: lireIp(entetes),
    navigateur: entetes?.get("user-agent") ?? null,
  });
}

type Contexte = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

export function entetesDe(contexte: Contexte): Headers | undefined {
  return contexte.headers ?? contexte.request?.headers;
}

function codeErreur(contexte: Contexte): unknown {
  const retour = contexte.context.returned;
  return isAPIError(retour) ? (retour.body as { code?: unknown } | undefined)?.code : undefined;
}

export function journalConnexions() {
  return {
    id: "journal-connexions",
    hooks: {
      before: [
        {
          // Avant la route : après, la session n'existe plus.
          matcher: (contexte) => contexte.path === ROUTE_DECONNEXION,
          handler: createAuthMiddleware(async (contexte) => {
            const session = await getSessionFromCtx(contexte).catch(() => null);
            if (!session) return;
            await noterEvenement(
              { type: "DECONNEXION", email: session.user.email, utilisateurId: session.user.id },
              entetesDe(contexte),
            );
          }),
        },
      ],
      after: [
        {
          matcher: (contexte) => contexte.path === ROUTE_ENVOI,
          handler: createAuthMiddleware(async (contexte) => {
            if (isAPIError(contexte.context.returned)) return;
            await noterEvenement(
              { type: "CODE_DEMANDE", email: contexte.body?.email },
              entetesDe(contexte),
            );
          }),
        },
        {
          matcher: (contexte) => contexte.path === ROUTE_CONNEXION,
          handler: createAuthMiddleware(async (contexte) => {
            const entetes = entetesDe(contexte);
            if (isAPIError(contexte.context.returned)) {
              await noterEvenement(
                {
                  type: "CODE_REFUSE",
                  email: contexte.body?.email,
                  motif: motifRefusCode(codeErreur(contexte)),
                },
                entetes,
              );
              return;
            }
            const utilisateur = contexte.context.newSession?.user;
            await noterEvenement(
              {
                type: "CONNEXION_REUSSIE",
                email: utilisateur?.email ?? contexte.body?.email,
                utilisateurId: utilisateur?.id,
              },
              entetes,
            );
          }),
        },
        {
          matcher: (contexte) => contexte.path === ROUTE_TOTP || contexte.path === ROUTE_SECOURS,
          handler: createAuthMiddleware(async (contexte) => {
            const session = contexte.context.newSession ?? contexte.context.session;
            const motif = contexte.path === ROUTE_TOTP ? "application" : "code-de-secours";
            await noterEvenement(
              {
                type: isAPIError(contexte.context.returned)
                  ? "DEUXIEME_FACTEUR_REFUSE"
                  : "DEUXIEME_FACTEUR_VALIDE",
                email: session?.user.email,
                utilisateurId: session?.user.id,
                motif,
              },
              entetesDe(contexte),
            );
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
