// Journal des connexions : logique pure (SECURITE.md, section 15).
// Règle d'or prouvée ici : rien d'autre que les champs prévus n'entre dans le
// journal, et chacun est nettoyé ; jamais un code, un jeton ni un secret.
import { describe, expect, it } from "vitest";
import {
  DUREE_CONSERVATION_JOURS,
  estEchec,
  LIBELLES_MOTIF,
  LIBELLES_TYPE,
  libelleMotif,
  libelleType,
  limiteConservation,
  lireIp,
  LONGUEUR_MAX_NAVIGATEUR,
  MOTIFS,
  motifRefusCode,
  normaliserEmail,
  normaliserFiltreEmail,
  normaliserIp,
  normaliserNavigateur,
  preparerEvenement,
  TYPES_EVENEMENT,
  type Evenement,
} from "./journal";

const maintenant = new Date("2026-11-10T10:00:00Z");

describe("preparerEvenement : jamais un code, un jeton ni un secret", () => {
  it("ne garde que les champs prévus, même si on lui passe un corps de requête entier", () => {
    const corps = {
      type: "CONNEXION_REUSSIE",
      email: "Dupont@Exemple.fr",
      utilisateurId: "u1",
      ip: "203.0.113.7",
      navigateur: "Mozilla/5.0",
      otp: "123456",
      code: "654321",
      token: "jeton-de-session-secret",
      secret: "JBSWY3DPEHPK3PXP",
      backupCodes: ["abcde-fghij"],
    } as unknown as Evenement;

    const ligne = preparerEvenement(corps, maintenant);

    expect(ligne).toEqual({
      type: "CONNEXION_REUSSIE",
      email: "dupont@exemple.fr",
      utilisateurId: "u1",
      motif: null,
      ip: "203.0.113.7",
      navigateur: "Mozilla/5.0",
      createdAt: maintenant,
    });
    const texte = JSON.stringify(ligne);
    for (const secret of ["123456", "654321", "jeton-de-session-secret", "JBSWY3DPEHPK3PXP", "abcde"]) {
      expect(texte).not.toContain(secret);
    }
  });

  it("n'accepte pas un code collé à la place de l'adresse e-mail", () => {
    expect(preparerEvenement({ type: "CODE_REFUSE", email: "123456" }, maintenant)?.email).toBe("");
  });

  it("remplace un motif inconnu (texte libre) par « autre »", () => {
    const ligne = preparerEvenement(
      { type: "CODE_REFUSE", motif: "le code 123456 est faux" as never },
      maintenant,
    );
    expect(ligne?.motif).toBe("autre");
  });

  it("refuse un type inconnu", () => {
    expect(preparerEvenement({ type: "MOT_DE_PASSE" as never }, maintenant)).toBeNull();
  });

  it("écarte un identifiant de compte qui n'en a pas la forme", () => {
    for (const valeur of ["", "a b", "x".repeat(65), "u1;DROP TABLE", 42]) {
      expect(
        preparerEvenement({ type: "DECONNEXION", utilisateurId: valeur as never }, maintenant)
          ?.utilisateurId,
      ).toBeNull();
    }
  });

  it("date la ligne avec l'heure donnée", () => {
    expect(preparerEvenement({ type: "CODE_DEMANDE" }, maintenant)?.createdAt).toBe(maintenant);
  });
});

describe("adresse e-mail", () => {
  it("passe en minuscules et retire les espaces autour (comme les limites)", () => {
    expect(normaliserEmail("  Paul.Martin@Exemple.FR ")).toBe("paul.martin@exemple.fr");
  });

  it("rejette ce qui n'est pas une adresse", () => {
    for (const valeur of [undefined, null, 12, "", "sans-arobase", "a b@c.fr", "a@b\n.fr", `${"a".repeat(250)}@b.fr`]) {
      expect(normaliserEmail(valeur)).toBe("");
    }
  });
});

describe("adresse IP", () => {
  it("accepte IPv4 et IPv6", () => {
    expect(normaliserIp("203.0.113.7")).toBe("203.0.113.7");
    expect(normaliserIp("2001:DB8::1")).toBe("2001:db8::1");
    expect(normaliserIp("::1")).toBe("::1");
  });

  it("écarte un en-tête forgé qui n'est pas une adresse", () => {
    for (const valeur of ["<script>", "inconnu", "1234", "1.2.3.4 ; rm", "", "a".repeat(46), null]) {
      expect(normaliserIp(valeur)).toBeNull();
    }
  });

  it("lit le premier élément de X-Forwarded-For, sinon X-Real-IP", () => {
    expect(lireIp(new Headers({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" }))).toBe("198.51.100.2");
    expect(lireIp(new Headers({ "x-real-ip": "198.51.100.3" }))).toBe("198.51.100.3");
    expect(
      lireIp(new Headers({ "x-forwarded-for": "pas-une-ip", "x-real-ip": "198.51.100.4" })),
    ).toBe("198.51.100.4");
    expect(lireIp(new Headers())).toBeNull();
    expect(lireIp(undefined)).toBeNull();
  });
});

describe("navigateur", () => {
  it("retire les caractères de contrôle et tronque", () => {
    expect(normaliserNavigateur("Mozilla\r\nFaux: en-tête")).toBe("Mozilla Faux: en-tête");
    expect(normaliserNavigateur("x".repeat(1000))).toHaveLength(LONGUEUR_MAX_NAVIGATEUR);
    expect(normaliserNavigateur("   ")).toBeNull();
    expect(normaliserNavigateur(undefined)).toBeNull();
  });
});

describe("conservation : 90 jours au plus", () => {
  it("efface ce qui a été créé avant il y a 90 jours", () => {
    expect(DUREE_CONSERVATION_JOURS).toBe(90);
    expect(limiteConservation(maintenant)).toEqual(new Date("2026-08-12T10:00:00Z"));
  });
});

describe("refus du code de connexion", () => {
  it("traduit les erreurs de Better Auth", () => {
    expect(motifRefusCode("INVALID_OTP")).toBe("code-incorrect");
    expect(motifRefusCode("OTP_EXPIRED")).toBe("code-expire");
    expect(motifRefusCode("TOO_MANY_ATTEMPTS")).toBe("code-epuise");
    expect(motifRefusCode("AUTRE_CHOSE")).toBe("autre");
    expect(motifRefusCode(undefined)).toBe("autre");
  });
});

describe("affichage", () => {
  it("a un libellé pour chaque type et chaque motif", () => {
    for (const type of TYPES_EVENEMENT) expect(LIBELLES_TYPE[type].libelle).not.toBe("");
    for (const motif of MOTIFS) expect(LIBELLES_MOTIF[motif]).not.toBe("");
  });

  it("met en avant les échecs et les blocages", () => {
    const echecs = TYPES_EVENEMENT.filter(estEchec);
    expect(echecs).toEqual([
      "CODE_REFUSE",
      "COMPTE_BLOQUE",
      "DEUXIEME_FACTEUR_REFUSE",
      "COMPTE_SUPPRIME",
    ]);
  });

  it("affiche une valeur inconnue sans planter", () => {
    expect(libelleType("ANCIEN_TYPE")).toEqual({ libelle: "ANCIEN_TYPE", ton: "neutre" });
    expect(libelleMotif("ancien")).toBe("autre motif");
    expect(libelleMotif(null)).toBeNull();
  });

  it("normalise le filtre par adresse", () => {
    expect(normaliserFiltreEmail("  Dupont ")).toBe("dupont");
    expect(normaliserFiltreEmail(["a", "b"])).toBe("");
    expect(normaliserFiltreEmail("x".repeat(300))).toBe("");
  });
});
