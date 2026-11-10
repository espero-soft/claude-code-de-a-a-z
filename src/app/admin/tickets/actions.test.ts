// La Server Action validerBrouillon se protège seule : appelée directement
// (comme un POST forgé, sans page ni proxy), elle relit la session et le rôle.
// Session (Better Auth) et base simulées ; la couche src/lib/acces.ts est la
// vraie.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, prismaSimule } = vi.hoisted(() => ({
  getSession: vi.fn(),
  prismaSimule: {
    user: { findUnique: vi.fn() },
    session: { findUnique: vi.fn() },
    ticket: { updateMany: vi.fn() },
  },
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaSimule }));

import { validerBrouillon } from "./actions";

// Compte connecté avec ce rôle en base, ou visiteur (null). Par défaut, le
// personnel a enrôlé son application et validé le second facteur il y a une
// minute dans cette session.
function connecter(
  role: string | null,
  facteur: { enrole: boolean; valideLe: Date | null } = {
    enrole: true,
    valideLe: new Date(Date.now() - 60_000),
  },
) {
  if (role === null) {
    getSession.mockResolvedValue(null);
    return;
  }
  getSession.mockResolvedValue({ user: { id: "u1", role: "ADMIN" }, session: { id: "s1" } });
  prismaSimule.user.findUnique.mockResolvedValue({
    id: "u1",
    email: "u@exemple.fr",
    name: "",
    role,
    twofactors: facteur.enrole ? [{ id: "f1" }] : [],
  });
  prismaSimule.session.findUnique.mockResolvedValue({ deuxiemeFacteurLe: facteur.valideLe });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaSimule.ticket.updateMany.mockResolvedValue({ count: 1 });
});

describe("validerBrouillon", () => {
  it.each([
    ["un visiteur", null],
    ["un client", "CLIENT"],
    ["un rôle inconnu", "SUPER_ADMIN"],
  ])("refuse %s sans toucher à la base", async (_, role) => {
    connecter(role);
    expect(await validerBrouillon("t1")).toEqual({ erreur: "Action indisponible." });
    expect(prismaSimule.ticket.updateMany).not.toHaveBeenCalled();
  });

  it("lit le rôle en base, pas dans la session", async () => {
    // La session dit ADMIN (voir connecter), la base dit CLIENT : refusé.
    connecter("CLIENT");
    expect(await validerBrouillon("t1")).toEqual({ erreur: "Action indisponible." });
  });

  it.each(["EMPLOYE", "ADMIN"])("autorise le rôle %s", async (role) => {
    connecter(role);
    expect(await validerBrouillon("t1")).toEqual({});
    expect(prismaSimule.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", statut: "A_TRAITER" },
      data: { statut: "VALIDE", valideLe: expect.any(Date) },
    });
  });

  it.each([
    ["sans application configurée", { enrole: false, valideLe: null }],
    ["sans code saisi dans cette session", { enrole: true, valideLe: null }],
    ["avec un code saisi il y a plus de 12 heures", { enrole: true, valideLe: new Date(Date.now() - 13 * 3_600_000) }],
  ])("refuse un employé %s (second facteur non validé)", async (_, facteur) => {
    connecter("EMPLOYE", facteur);
    expect(await validerBrouillon("t1")).toEqual({ erreur: "Action indisponible." });
    expect(prismaSimule.ticket.updateMany).not.toHaveBeenCalled();
  });

  it("refuse aussi l'administrateur sans second facteur validé", async () => {
    connecter("ADMIN", { enrole: true, valideLe: null });
    expect(await validerBrouillon("t1")).toEqual({ erreur: "Action indisponible." });
    expect(prismaSimule.ticket.updateMany).not.toHaveBeenCalled();
  });
});
