import { createHash } from "node:crypto";
import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
  isAPIError,
} from "better-auth/api";
import { consommerLimite } from "@/lib/garde-connexion";
import { cleLimite, LIMITE_DEUXIEME_FACTEUR } from "@/lib/limite-connexion";
import { prisma } from "@/lib/prisma";
import { exigeDeuxiemeFacteur, lireRole } from "@/lib/roles";

// Second facteur (TOTP) du personnel, branché sur le module twoFactor de
// Better Auth (SECURITE.md, section 13).
//
// Le module ne s'enclenche seul qu'après une connexion par MOT DE PASSE : son
// crochet ne regarde que /sign-in/email, /sign-in/username et
// /sign-in/phone-number. Après /sign-in/email-otp, la session est ouverte
// sans lui. On garde donc la session du code e-mail, et on la MARQUE
// (Session.deuxiemeFacteurLe) quand le second facteur est validé ; la couche
// d'accès (src/lib/acces.ts) refuse les droits du personnel à une session non
// marquée. Cette garde fait ce que le module ne fait pas dans ce mode :
//
//   - réserve les routes /two-factor/* au personnel, session ouverte ;
//   - ferme celles qui, sans mot de passe, donneraient le second facteur à
//     quiconque tient la seule session e-mail (relire le secret, désactiver,
//     régénérer les codes de secours) ;
//   - compte les essais par compte : le module ne les compte que pendant une
//     connexion par mot de passe, pas quand une session est déjà ouverte ;
//   - refuse un code TOTP déjà accepté (anti-rejeu, RFC 6238 § 5.2), ce que
//     le module ne fait pas ;
//   - marque la session après un code correct.
//
// Crochets « before » et « after » : ils passent en HTTP (/api/auth/...) comme
// par auth.api depuis une Server Action.

// Nom affiché dans l'application d'authentification.
export const NOM_EMETTEUR_TOTP = "Réunéa";

const ROUTE_ENROLEMENT = "/two-factor/enable";
const ROUTE_TOTP = "/two-factor/verify-totp";
const ROUTE_SECOURS = "/two-factor/verify-backup-code";

// Routes du module fermées (404), à passer dans disabledPaths. Avec
// allowPasswordless, elles ne demandent que la session : la session ouverte
// par le seul code e-mail suffirait à lire le secret TOTP, à désactiver le
// second facteur ou à obtenir de nouveaux codes de secours. Les codes par
// e-mail ou SMS (send-otp, verify-otp) ne sont pas un second facteur ici :
// c'est déjà le premier.
export const ROUTES_DEUXIEME_FACTEUR_FERMEES = [
  "/two-factor/get-totp-uri",
  "/two-factor/disable",
  "/two-factor/generate-backup-codes",
  "/two-factor/send-otp",
  "/two-factor/verify-otp",
];

// Codes renvoyés au client (traduits par messageDeuxiemeFacteur).
export const CODE_RESERVE_AU_PERSONNEL = "DEUXIEME_FACTEUR_RESERVE_AU_PERSONNEL";
export const CODE_TROP_D_ESSAIS_DEUXIEME_FACTEUR = "TROP_D_ESSAIS_DE_DEUXIEME_FACTEUR";
export const CODE_DEJA_UTILISE = "CODE_DEJA_UTILISE";

// Un code TOTP reste accepté par le module pendant au plus 90 s (pas de 30 s,
// ±1 pas). On garde sa trace un peu plus longtemps.
const DUREE_ANTI_REJEU_MS = 3 * 60_000;

function empreinteCode(utilisateurId: string, code: string): string {
  return createHash("sha256").update(`${utilisateurId}:${code.trim()}`).digest("hex");
}

type Contexte = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

// Compte du personnel, session ouverte : sinon, refus.
async function exigerPersonnel(contexte: Contexte) {
  const session = await getSessionFromCtx(contexte);
  if (!session) throw APIError.from("UNAUTHORIZED", { code: "UNAUTHORIZED", message: "Session required" });
  const compte = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, role: true },
  });
  if (!compte || !exigeDeuxiemeFacteur(lireRole(compte.role))) {
    throw APIError.from("FORBIDDEN", {
      code: CODE_RESERVE_AU_PERSONNEL,
      message: "Two-factor authentication is reserved to staff",
    });
  }
  return compte;
}

export function gardeDeuxiemeFacteur() {
  return {
    id: "garde-deuxieme-facteur",
    hooks: {
      before: [
        {
          matcher: (contexte) => contexte.path?.startsWith("/two-factor/") ?? false,
          handler: createAuthMiddleware(async (contexte) => {
            const compte = await exigerPersonnel(contexte);

            // Enrôlement : application d'authentification seulement.
            if (contexte.path === ROUTE_ENROLEMENT && contexte.body?.method === "otp") {
              throw APIError.from("BAD_REQUEST", { code: "TOTP_SEULEMENT", message: "TOTP only" });
            }

            if (contexte.path === ROUTE_TOTP || contexte.path === ROUTE_SECOURS) {
              // Compté avant la vérification : un essai, bon ou faux, compte.
              const decision = await consommerLimite(
                cleLimite("deuxieme-facteur", compte.email),
                LIMITE_DEUXIEME_FACTEUR,
              );
              if (!decision.autorise) {
                throw new APIError(
                  "TOO_MANY_REQUESTS",
                  {
                    code: CODE_TROP_D_ESSAIS_DEUXIEME_FACTEUR,
                    message: "Too many two-factor attempts",
                    reessayerDansSecondes: decision.reessayerDansSecondes,
                  },
                  { "Retry-After": String(decision.reessayerDansSecondes) },
                );
              }
            }

            if (contexte.path === ROUTE_TOTP && typeof contexte.body?.code === "string") {
              const deja = await prisma.codeDeuxiemeFacteurUtilise.findUnique({
                where: { empreinte: empreinteCode(compte.id, contexte.body.code) },
              });
              if (deja && deja.expireLe > new Date()) {
                throw APIError.from("UNAUTHORIZED", {
                  code: CODE_DEJA_UTILISE,
                  message: "This code has already been used",
                });
              }
            }
          }),
        },
      ],
      after: [
        {
          matcher: (contexte) => contexte.path === ROUTE_TOTP || contexte.path === ROUTE_SECOURS,
          handler: createAuthMiddleware(async (contexte) => {
            if (isAPIError(contexte.context.returned)) return;

            // À l'enrôlement, le module remplace la session (nouveau jeton) :
            // c'est la nouvelle qu'il faut marquer.
            const session = contexte.context.newSession ?? contexte.context.session;
            if (!session) return;
            const utilisateurId = session.user.id;

            // Seulement si l'application est bien enrôlée et confirmée : un
            // code de secours d'un enrôlement inachevé ne valide rien.
            const facteur = await prisma.twoFactor.findFirst({
              where: { userId: utilisateurId, verified: true },
              select: { id: true },
            });
            if (!facteur) return;

            const maintenant = new Date();
            await prisma.session.update({
              where: { token: session.session.token },
              data: { deuxiemeFacteurLe: maintenant },
            });

            if (contexte.path === ROUTE_TOTP && typeof contexte.body?.code === "string") {
              await prisma.codeDeuxiemeFacteurUtilise.deleteMany({
                where: { expireLe: { lt: maintenant } },
              });
              await prisma.codeDeuxiemeFacteurUtilise.upsert({
                where: { empreinte: empreinteCode(utilisateurId, contexte.body.code) },
                create: {
                  empreinte: empreinteCode(utilisateurId, contexte.body.code),
                  expireLe: new Date(maintenant.getTime() + DUREE_ANTI_REJEU_MS),
                },
                update: { expireLe: new Date(maintenant.getTime() + DUREE_ANTI_REJEU_MS) },
              });
            }

            // Code correct : les fautes de frappe d'avant sont oubliées.
            const compte = await prisma.user.findUnique({
              where: { id: utilisateurId },
              select: { email: true },
            });
            if (compte) {
              await prisma.limiteConnexion.deleteMany({
                where: { cle: cleLimite("deuxieme-facteur", compte.email) },
              });
            }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
