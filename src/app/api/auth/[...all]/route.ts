import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// Toutes les routes de Better Auth (/api/auth/...) : envoi et vérification du
// code, session, déconnexion. Débit limité et origine vérifiée (CSRF) par la
// bibliothèque.
export const { GET, POST } = toNextJsHandler(auth);
