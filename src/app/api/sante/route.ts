import { connection } from "next/server";
import { prisma } from "@/lib/prisma";

// Point de santé (design/PLAN-PRODUCTION.md) : le serveur répond et la base
// SQLite est lisible. Lu par scripts/fumee.sh après chaque livraison, et par
// scripts/deployer.sh pour décider d'un retour arrière automatique.
// Ne révèle rien d'autre : ni version, ni chemin, ni message d'erreur.
//
// connection() : avec Cache Components, un GET qui ne lit rien de la requête
// serait prérendu au build (docs 01-getting-started/15-route-handlers.md) ;
// la santé doit être mesurée à chaque appel.
const SANS_CACHE = { "Cache-Control": "no-store" };

export async function GET() {
  await connection();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: SANS_CACHE });
  } catch (erreur) {
    console.error("Santé : base illisible", erreur);
    return Response.json({ ok: false }, { status: 503, headers: SANS_CACHE });
  }
}
