// Point de santé : 200 quand la base répond, 503 sinon, sans jamais laisser
// passer le détail de l'erreur ni être mis en cache.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: queryRaw } }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/sante", () => {
  it("répond 200 quand la base est lisible", async () => {
    queryRaw.mockResolvedValue([{ 1: 1 }]);
    const reponse = await GET();
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual({ ok: true });
    expect(reponse.headers.get("cache-control")).toBe("no-store");
  });

  it("répond 503 sans détail quand la base ne répond pas", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    queryRaw.mockRejectedValue(new Error("SQLITE_CANTOPEN: /var/lib/reunea/reunea.db"));
    const reponse = await GET();
    expect(reponse.status).toBe(503);
    const texte = await reponse.text();
    expect(JSON.parse(texte)).toEqual({ ok: false });
    expect(texte).not.toContain("reunea.db");
    expect(reponse.headers.get("cache-control")).toBe("no-store");
  });
});
