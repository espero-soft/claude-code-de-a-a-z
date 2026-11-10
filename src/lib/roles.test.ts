import { describe, expect, it } from "vitest";
import {
  adresseAdmin,
  decisionPremierAdmin,
  DUREE_DEUXIEME_FACTEUR_MS,
  etatDeuxiemeFacteur,
  exigeDeuxiemeFacteur,
  roleEffectif,
  estPersonnel,
  lireRole,
  peut,
  peutPayerReservation,
  peutVoirReservation,
  type Capacite,
  type Role,
} from "./roles";

describe("lireRole", () => {
  it("reconnaît les trois rôles", () => {
    expect(lireRole("CLIENT")).toBe("CLIENT");
    expect(lireRole("EMPLOYE")).toBe("EMPLOYE");
    expect(lireRole("ADMIN")).toBe("ADMIN");
  });

  it("ramène toute autre valeur au rôle client (refus par défaut)", () => {
    for (const valeur of [undefined, null, "", "admin", "ADMINISTRATEUR", " ADMIN", 1, {}]) {
      expect(lireRole(valeur)).toBe("CLIENT");
    }
  });
});

describe("peut", () => {
  const attendu: Record<Role, Record<Capacite, boolean>> = {
    CLIENT: { reserver: true, reservations: false, tickets: false, chiffres: false, comptes: false },
    EMPLOYE: { reserver: true, reservations: true, tickets: true, chiffres: false, comptes: false },
    ADMIN: { reserver: true, reservations: true, tickets: true, chiffres: true, comptes: true },
  };

  for (const [role, capacites] of Object.entries(attendu) as [Role, Record<Capacite, boolean>][]) {
    for (const [capacite, autorise] of Object.entries(capacites) as [Capacite, boolean][]) {
      it(`${role} ${autorise ? "peut" : "ne peut pas"} : ${capacite}`, () => {
        expect(peut(role, capacite)).toBe(autorise);
      });
    }
  }

  it("l'employé ne voit ni les chiffres ni les comptes", () => {
    expect(peut("EMPLOYE", "chiffres")).toBe(false);
    expect(peut("EMPLOYE", "comptes")).toBe(false);
  });
});

describe("estPersonnel (accès à /admin)", () => {
  it("ouvre /admin à l'employé et à l'administrateur, pas au client", () => {
    expect(estPersonnel("CLIENT")).toBe(false);
    expect(estPersonnel("EMPLOYE")).toBe(true);
    expect(estPersonnel("ADMIN")).toBe(true);
  });
});

describe("peutVoirReservation", () => {
  const reservation = { utilisateurId: "titulaire" };
  const sansTitulaire = { utilisateurId: null };

  it("refuse un visiteur sans compte", () => {
    expect(peutVoirReservation(null, reservation)).toBe(false);
  });

  it("autorise le titulaire", () => {
    expect(peutVoirReservation({ id: "titulaire", role: "CLIENT" }, reservation)).toBe(true);
  });

  it("refuse un autre client", () => {
    expect(peutVoirReservation({ id: "autre", role: "CLIENT" }, reservation)).toBe(false);
  });

  it("autorise l'employé et l'administrateur", () => {
    expect(peutVoirReservation({ id: "e", role: "EMPLOYE" }, reservation)).toBe(true);
    expect(peutVoirReservation({ id: "a", role: "ADMIN" }, reservation)).toBe(true);
  });

  it("une réservation sans titulaire n'est visible que du personnel", () => {
    expect(peutVoirReservation({ id: "x", role: "CLIENT" }, sansTitulaire)).toBe(false);
    expect(peutVoirReservation({ id: "e", role: "EMPLOYE" }, sansTitulaire)).toBe(true);
  });

  it("le rôle client ne donne pas accès aux réservations des autres, même sans titulaire", () => {
    expect(peutVoirReservation({ id: "", role: "CLIENT" }, sansTitulaire)).toBe(false);
  });
});

describe("peutPayerReservation", () => {
  const reservation = { utilisateurId: "titulaire" };

  it("seul le titulaire paie", () => {
    expect(peutPayerReservation({ id: "titulaire", role: "CLIENT" }, reservation)).toBe(true);
    expect(peutPayerReservation({ id: "autre", role: "CLIENT" }, reservation)).toBe(false);
    expect(peutPayerReservation(null, reservation)).toBe(false);
  });

  it("le personnel consulte mais ne paie pas à la place du client", () => {
    expect(peutPayerReservation({ id: "e", role: "EMPLOYE" }, reservation)).toBe(false);
    expect(peutPayerReservation({ id: "a", role: "ADMIN" }, reservation)).toBe(false);
  });

  it("un administrateur titulaire de sa propre réservation la paie", () => {
    expect(peutPayerReservation({ id: "a", role: "ADMIN" }, { utilisateurId: "a" })).toBe(true);
  });
});

describe("adresseAdmin", () => {
  it("normalise l'adresse passée à la commande", () => {
    expect(adresseAdmin("  Responsable@Centre.Example ")).toBe("responsable@centre.example");
  });

  it("refuse une adresse absente ou mal formée", () => {
    for (const valeur of [undefined, "", "   ", "sans-arobase", "a@b", "@b.fr", "a b@c.fr"]) {
      expect(adresseAdmin(valeur)).toBeNull();
    }
  });
});

describe("decisionPremierAdmin", () => {
  const adresse = "responsable@centre.example";

  it("crée le compte quand l'adresse est inconnue et qu'il n'y a aucun administrateur", () => {
    expect(decisionPremierAdmin(adresse, null, [])).toEqual({ action: "creer" });
  });

  it("promeut un compte existant (client ou employé)", () => {
    expect(decisionPremierAdmin(adresse, { role: "CLIENT" }, [])).toEqual({ action: "promouvoir" });
    expect(decisionPremierAdmin(adresse, { role: "EMPLOYE" }, [])).toEqual({ action: "promouvoir" });
  });

  it("ne change rien si ce compte est déjà l'administrateur (relance sans effet)", () => {
    expect(decisionPremierAdmin(adresse, { role: "ADMIN" }, ["Responsable@Centre.example"])).toEqual({
      action: "rien",
    });
  });

  it("refuse dès qu'un autre administrateur existe", () => {
    expect(decisionPremierAdmin(adresse, null, ["autre@centre.example"])).toEqual({
      action: "refuser",
      administrateurs: ["autre@centre.example"],
    });
    expect(decisionPremierAdmin(adresse, { role: "CLIENT" }, ["autre@centre.example"]).action).toBe(
      "refuser",
    );
  });
});

describe("second facteur du personnel", () => {
  const maintenant = new Date("2026-11-10T10:00:00Z");
  const ilYa = (ms: number) => new Date(maintenant.getTime() - ms);

  it("n'est exigé que de l'employé et de l'administrateur", () => {
    expect(exigeDeuxiemeFacteur("CLIENT")).toBe(false);
    expect(exigeDeuxiemeFacteur("EMPLOYE")).toBe(true);
    expect(exigeDeuxiemeFacteur("ADMIN")).toBe(true);
  });

  it("guide l'enrôlement, puis demande un code à chaque session", () => {
    expect(etatDeuxiemeFacteur("CLIENT", { enrole: false, valideLe: null }, maintenant)).toBe("inutile");
    expect(etatDeuxiemeFacteur("EMPLOYE", { enrole: false, valideLe: null }, maintenant)).toBe("a-enroler");
    expect(etatDeuxiemeFacteur("EMPLOYE", { enrole: true, valideLe: null }, maintenant)).toBe("a-verifier");
    expect(etatDeuxiemeFacteur("ADMIN", { enrole: true, valideLe: ilYa(60_000) }, maintenant)).toBe("valide");
  });

  it("une validation ne vaut que 12 heures, et jamais pour une date future", () => {
    const juste = ilYa(DUREE_DEUXIEME_FACTEUR_MS - 1);
    const perimee = ilYa(DUREE_DEUXIEME_FACTEUR_MS);
    expect(etatDeuxiemeFacteur("EMPLOYE", { enrole: true, valideLe: juste }, maintenant)).toBe("valide");
    expect(etatDeuxiemeFacteur("EMPLOYE", { enrole: true, valideLe: perimee }, maintenant)).toBe("a-verifier");
    expect(etatDeuxiemeFacteur("EMPLOYE", { enrole: true, valideLe: ilYa(-60_000) }, maintenant)).toBe(
      "a-verifier",
    );
  });

  it("une validation sans enrôlement ne compte pas", () => {
    expect(etatDeuxiemeFacteur("ADMIN", { enrole: false, valideLe: ilYa(1000) }, maintenant)).toBe("a-enroler");
  });

  it("tant que le second facteur n'est pas validé, le personnel n'a que les droits d'un client", () => {
    for (const role of ["EMPLOYE", "ADMIN"] as const) {
      for (const etat of ["a-enroler", "a-verifier"] as const) {
        const effectif = roleEffectif(role, etat);
        expect(effectif).toBe("CLIENT");
        expect(peut(effectif, "tickets")).toBe(false);
        expect(peut(effectif, "reservations")).toBe(false);
        expect(estPersonnel(effectif)).toBe(false);
        expect(peutVoirReservation({ id: "p", role: effectif }, { utilisateurId: "client" })).toBe(false);
      }
    }
    expect(roleEffectif("EMPLOYE", "valide")).toBe("EMPLOYE");
    expect(roleEffectif("ADMIN", "valide")).toBe("ADMIN");
    expect(roleEffectif("CLIENT", "inutile")).toBe("CLIENT");
  });
});
