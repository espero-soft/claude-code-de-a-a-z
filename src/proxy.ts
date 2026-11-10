import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { adresseConnexion } from "@/lib/connexion";
import { prisma } from "@/lib/prisma";
import { estPersonnel, lireRole } from "@/lib/roles";

// Trois contrôles, avant le rendu :
//
// 1. Salles. La fiche d'une salle est envoyée en flux : une fois la réponse
//    partie, Next ne peut plus changer son code HTTP. Le proxy vérifie donc la
//    salle avant, pour qu'une salle inconnue ou désactivée reçoive un vrai 404.
//    Même chose pour la page de réservation.
//    `[^/.]+` : un identifiant (cuid) ne contient jamais de point, alors que
//    les photos de public/salles en ont un (/salles/atelier.jpg) ; sans cette
//    exclusion, le proxy les prendrait pour des salles inconnues (404).
//
// 2. Pages réservées aux comptes (réserver, une réservation, /admin) : un
//    visiteur SANS cookie de session est renvoyé vers /connexion, avec un vrai
//    code 307. Contrôle optimiste seulement (le cookie n'est ni vérifié ni
//    relu en base) : la page et chaque Server Action revérifient la session et
//    le rôle (src/lib/acces.ts). Ne jamais compter sur le proxy pour protéger.
//
// 3. /admin : la session et le rôle sont lus pour qu'un client reçoive un vrai
//    404 (la page, envoyée en flux, ne peut plus changer son code HTTP). Ce
//    n'est qu'un doublon : la page et ses Server Actions revérifient.
export const config = {
  matcher: [
    "/salles/:id([^/.]+)",
    "/salles/:id([^/.]+)/reserver",
    "/reservations/:id([^/.]+)",
    "/admin",
    // Sauf /admin/introuvable, la page du 404 elle-même.
    "/admin/:chemin((?!introuvable$).*)",
  ],
};

function exigeCompte(chemin: string): boolean {
  return (
    chemin.endsWith("/reserver") ||
    chemin.startsWith("/reservations/") ||
    chemin === "/admin" ||
    chemin.startsWith("/admin/")
  );
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (exigeCompte(pathname) && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL(adresseConnexion(pathname + search), request.url));
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.redirect(new URL(adresseConnexion(pathname + search), request.url));
    }
    if (!estPersonnel(lireRole(session.user.role))) {
      return NextResponse.rewrite(new URL("/admin/introuvable", request.url));
    }
    return;
  }

  if (pathname.startsWith("/salles/")) {
    const id = pathname.split("/")[2];
    const salle = await prisma.salle.findFirst({
      where: { id, active: true },
      select: { id: true },
    });

    if (!salle) {
      return NextResponse.rewrite(new URL("/salles/introuvable", request.url));
    }
  }
}
