import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// La fiche d'une salle est envoyée en flux : une fois la réponse partie, Next
// ne peut plus changer son code HTTP. Le proxy vérifie donc la salle avant,
// pour qu'une salle inconnue ou désactivée reçoive un vrai 404. Même chose pour
// la page de réservation.
export const config = {
  matcher: ["/salles/:id", "/salles/:id/reserver"],
};

export async function proxy(request: NextRequest) {
  const id = request.nextUrl.pathname.split("/")[2];
  const salle = await prisma.salle.findFirst({
    where: { id, active: true },
    select: { id: true },
  });

  if (!salle) {
    return NextResponse.rewrite(new URL("/salles/introuvable", request.url));
  }
}
