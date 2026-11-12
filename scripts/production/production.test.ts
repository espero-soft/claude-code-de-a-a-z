// Scripts de production (scripts/production/*.sh), lancés pour de vrai par
// bash dans un dossier temporaire : vraie base SQLite (CLI sqlite3), vrai
// dépôt git, vrai serveur HTTP local. Seuls systemctl, npm, npx et le contrôle
// de fumée de deployer/revenir sont remplacés par de faux programmes qui
// notent leurs appels. Prérequis : bash, git, sqlite3, gzip, curl.
import { execFile, execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPTS = join(__dirname);

let dossier: string;
let bin: string;
let appels: string;

type Resultat = { code: number; sortie: string };

function lancer(script: string, args: string[], env: Record<string, string> = {}): Promise<Resultat> {
  return new Promise((resoudre) => {
    execFile(
      "bash",
      [join(SCRIPTS, script), ...args],
      {
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          REUNEA_RACINE: join(dossier, "srv"),
          REUNEA_ENV: join(dossier, "etc", "reunea.env"),
          REUNEA_BASE: join(dossier, "lib", "reunea.db"),
          REUNEA_SAUVEGARDES: join(dossier, "sauvegardes"),
          REUNEA_SYSTEMCTL: join(bin, "systemctl"),
          ...env,
        },
      },
      (erreur, stdout, stderr) => {
        const code = erreur ? (typeof erreur.code === "number" ? erreur.code : 1) : 0;
        resoudre({ code, sortie: `${stdout}${stderr}` });
      },
    );
  });
}

function programme(nom: string, contenu: string) {
  const chemin = join(bin, nom);
  writeFileSync(chemin, `#!/usr/bin/env bash\n${contenu}\n`);
  chmodSync(chemin, 0o755);
  return chemin;
}

function sql(base: string, requete: string): string {
  return execFileSync("sqlite3", [base, requete], { encoding: "utf8" }).trim();
}

function journalAppels(): string[] {
  return existsSync(appels) ? readFileSync(appels, "utf8").trim().split("\n") : [];
}

// Date de modification dans le passé, en heures.
function vieillir(chemin: string, heures: number) {
  const date = new Date(Date.now() - heures * 3_600_000);
  utimesSync(chemin, date, date);
}

beforeEach(() => {
  dossier = realpathSync(mkdtempSync(join(tmpdir(), "reunea-production-")));
  bin = join(dossier, "bin");
  appels = join(dossier, "appels.log");
  mkdirSync(bin);
  mkdirSync(join(dossier, "lib"));
  mkdirSync(join(dossier, "etc"));
  writeFileSync(join(dossier, "etc", "reunea.env"), 'DATABASE_URL="file:/var/lib/reunea/reunea.db"\n');
  // Faux systemctl : note l'appel ; « is-active » suit FAUX_ACTIF (1 = actif).
  programme(
    "systemctl",
    `echo "systemctl $*" >> "${appels}"\nif [ "$1" = "is-active" ]; then [ "\${FAUX_ACTIF:-0}" = "1" ]; fi`,
  );
});

afterEach(() => {
  rmSync(dossier, { recursive: true, force: true });
});

function creerBase(contenu = "base actuelle") {
  const base = join(dossier, "lib", "reunea.db");
  sql(base, `CREATE TABLE Salle (nom TEXT); INSERT INTO Salle VALUES ('${contenu}');`);
  return base;
}

function sauvegardes(): string[] {
  const chemin = join(dossier, "sauvegardes");
  return existsSync(chemin) ? readdirSync(chemin).filter((nom) => !nom.startsWith(".")).sort() : [];
}

describe("sauvegarder-base.sh", () => {
  it("produit une copie compressée, vérifiée et lisible de la base", async () => {
    creerBase("Horizon");
    const resultat = await lancer("sauvegarder-base.sh", []);
    expect(resultat.code, resultat.sortie).toBe(0);

    const fichiers = sauvegardes();
    expect(fichiers).toHaveLength(1);
    expect(fichiers[0]).toMatch(/^reunea-\d{8}T\d{6}Z\.db\.gz$/);
    const copie = join(dossier, "copie.db");
    writeFileSync(copie, execFileSync("gzip", ["-dc", join(dossier, "sauvegardes", fichiers[0])]));
    expect(sql(copie, "SELECT nom FROM Salle")).toBe("Horizon");
  });

  it("nomme une sauvegarde avec son motif et refuse un motif dangereux", async () => {
    creerBase();
    expect((await lancer("sauvegarder-base.sh", ["avant-v2026.11.12-1"])).code).toBe(0);
    expect(sauvegardes()[0]).toMatch(/^reunea-\d{8}T\d{6}Z-avant-v2026\.11\.12-1\.db\.gz$/);

    const refus = await lancer("sauvegarder-base.sh", ["../../etc/passwd"]);
    expect(refus.code).not.toBe(0);
    expect(refus.sortie).toContain("motif invalide");
  });

  it("efface les sauvegardes horaires de plus de 48 h et garde les 5 dernières nommées", async () => {
    creerBase();
    const dossierSauvegardes = join(dossier, "sauvegardes");
    mkdirSync(dossierSauvegardes);
    const vieille = join(dossierSauvegardes, "reunea-20200101T000000Z.db.gz");
    const recente = join(dossierSauvegardes, "reunea-20200102T000000Z.db.gz");
    writeFileSync(vieille, "");
    writeFileSync(recente, "");
    vieillir(vieille, 49);
    vieillir(recente, 47);
    for (let i = 1; i <= 6; i++) {
      const nommee = join(dossierSauvegardes, `reunea-2020010${i}T000000Z-avant-v${i}.db.gz`);
      writeFileSync(nommee, "");
      vieillir(nommee, 100 - i);
    }

    expect((await lancer("sauvegarder-base.sh", ["avant-v7"])).code).toBe(0);
    const restantes = sauvegardes();
    expect(restantes).not.toContain("reunea-20200101T000000Z.db.gz");
    expect(restantes).toContain("reunea-20200102T000000Z.db.gz");
    const nommees = restantes.filter((nom) => nom.includes("-avant-"));
    expect(nommees).toHaveLength(5);
    expect(nommees.some((nom) => nom.endsWith("-avant-v7.db.gz"))).toBe(true);
    expect(nommees).not.toContain("reunea-20200101T000000Z-avant-v1.db.gz");
    expect(nommees).not.toContain("reunea-20200102T000000Z-avant-v2.db.gz");
  });

  it("échoue sans base", async () => {
    const resultat = await lancer("sauvegarder-base.sh", []);
    expect(resultat.code).not.toBe(0);
    expect(resultat.sortie).toContain("base introuvable");
  });
});

describe("restaurer-base.sh", () => {
  async function sauvegardeDe(contenu: string): Promise<string> {
    const base = creerBase(contenu);
    expect((await lancer("sauvegarder-base.sh", [])).code).toBe(0);
    rmSync(base);
    return join(dossier, "sauvegardes", sauvegardes()[0]);
  }

  it("refuse tant que le service tourne, sans toucher la base", async () => {
    const sauvegarde = await sauvegardeDe("ancienne");
    const base = creerBase("actuelle");
    const resultat = await lancer("restaurer-base.sh", [sauvegarde], { FAUX_ACTIF: "1" });
    expect(resultat.code).not.toBe(0);
    expect(resultat.sortie).toContain("l'arrêter d'abord");
    expect(sql(base, "SELECT nom FROM Salle")).toBe("actuelle");
  });

  it("restaure la sauvegarde et met la base actuelle de côté", async () => {
    const sauvegarde = await sauvegardeDe("ancienne");
    const base = creerBase("actuelle");
    const resultat = await lancer("restaurer-base.sh", [sauvegarde]);
    expect(resultat.code, resultat.sortie).toBe(0);
    expect(sql(base, "SELECT nom FROM Salle")).toBe("ancienne");

    const deCote = sauvegardes().find((nom) => nom.startsWith("reunea-avant-restauration-"));
    expect(deCote).toBeDefined();
    expect(sql(join(dossier, "sauvegardes", deCote!), "SELECT nom FROM Salle")).toBe("actuelle");
  });

  it("refuse une sauvegarde corrompue, sans toucher la base", async () => {
    const base = creerBase("actuelle");
    const corrompue = join(dossier, "corrompue.db");
    writeFileSync(corrompue, "ceci n'est pas une base SQLite, ".repeat(200));
    const resultat = await lancer("restaurer-base.sh", [corrompue]);
    expect(resultat.code).not.toBe(0);
    expect(sql(base, "SELECT nom FROM Salle")).toBe("actuelle");
  });
});

describe("fumee.sh", () => {
  let serveur: Server;
  let reponses: Record<string, { statut: number; corps?: string; location?: string }>;

  beforeEach(async () => {
    reponses = {
      "/api/sante": { statut: 200, corps: '{"ok":true}' },
      "/": { statut: 200, corps: "Réunéa" },
      "/salles": { statut: 200, corps: "<h2>Horizon</h2>" },
      "/demonstration": { statut: 200, corps: "Site de démonstration" },
      "/salles/salle-inconnue": { statut: 404 },
      "/compte": { statut: 307, location: "/connexion?retour=%2Fcompte" },
      "/admin": { statut: 307, location: "/connexion?retour=%2Fadmin" },
    };
    serveur = createServer((requete, reponse) => {
      const prevue = reponses[requete.url ?? ""] ?? { statut: 500 };
      reponse.writeHead(prevue.statut, prevue.location ? { location: prevue.location } : {});
      reponse.end(prevue.corps ?? "");
    });
    await new Promise<void>((resoudre) => serveur.listen(0, "127.0.0.1", resoudre));
  });

  afterEach(() => {
    serveur.close();
  });

  function adresse() {
    return `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
  }

  it("passe quand chaque page répond comme prévu", async () => {
    const resultat = await lancer("fumee.sh", [adresse()], { REUNEA_ATTENTE_SECONDES: "1" });
    expect(resultat.code, resultat.sortie).toBe(0);
    expect(resultat.sortie).toContain("tout est bon");
  });

  it("échoue si une salle inconnue ne répond pas 404", async () => {
    reponses["/salles/salle-inconnue"] = { statut: 200 };
    const resultat = await lancer("fumee.sh", [adresse()], { REUNEA_ATTENTE_SECONDES: "1" });
    expect(resultat.code).not.toBe(0);
    expect(resultat.sortie).toMatch(/ÉCHEC\s+404 : salle inconnue/);
  });

  it("échoue si la base ne répond plus", async () => {
    reponses["/api/sante"] = { statut: 503, corps: '{"ok":false}' };
    const resultat = await lancer("fumee.sh", [adresse()], { REUNEA_ATTENTE_SECONDES: "1" });
    expect(resultat.code).not.toBe(0);
    expect(resultat.sortie).toContain("ÉCHEC   santé");
  });

  it("échoue si /compte s'ouvre sans session", async () => {
    reponses["/compte"] = { statut: 200 };
    const resultat = await lancer("fumee.sh", [adresse()], { REUNEA_ATTENTE_SECONDES: "1" });
    expect(resultat.code).not.toBe(0);
    expect(resultat.sortie).toContain("ÉCHEC   accès : /compte");
  });
});

// Arborescence du serveur : releases/<version>, current -> releases/<version>.
function creerVersions(...noms: string[]) {
  const releases = join(dossier, "srv", "releases");
  noms.forEach((nom, rang) => {
    mkdirSync(join(releases, nom), { recursive: true });
    vieillir(join(releases, nom), noms.length - rang);
  });
  return releases;
}

function courante(): string {
  return readlinkSync(join(dossier, "srv", "current"));
}

describe("revenir.sh", () => {
  beforeEach(() => {
    programme("fumee-ok", `echo "fumee" >> "${appels}"`);
  });

  it("revient à la version précédente sans toucher la base, et marque celle qu'il quitte", async () => {
    const releases = creerVersions("aaaaaaa1", "bbbbbbb2");
    symlinkSync(join(releases, "bbbbbbb2"), join(dossier, "srv", "current"));

    const resultat = await lancer("revenir.sh", [], { REUNEA_FUMEE: join(bin, "fumee-ok") });
    expect(resultat.code, resultat.sortie).toBe(0);
    expect(courante()).toBe(join(releases, "aaaaaaa1"));
    expect(existsSync(join(releases, "bbbbbbb2", ".retiree"))).toBe(true);
    expect(journalAppels()).toEqual(["systemctl restart reunea", "fumee"]);
    expect(readFileSync(join(dossier, "srv", "livraisons.log"), "utf8")).toContain(
      "retour bbbbbbb2 vers aaaaaaa1",
    );
  });

  it("ne reprend pas par défaut une version retirée", async () => {
    const releases = creerVersions("aaaaaaa1", "bbbbbbb2", "ccccccc3");
    writeFileSync(join(releases, "bbbbbbb2", ".retiree"), "");
    symlinkSync(join(releases, "ccccccc3"), join(dossier, "srv", "current"));

    expect((await lancer("revenir.sh", [], { REUNEA_FUMEE: join(bin, "fumee-ok") })).code).toBe(0);
    expect(courante()).toBe(join(releases, "aaaaaaa1"));
  });

  it("revient à une version précise, désignée par le début de son identifiant", async () => {
    const releases = creerVersions("aaaaaaa1", "bbbbbbb2", "ccccccc3");
    symlinkSync(join(releases, "ccccccc3"), join(dossier, "srv", "current"));
    expect((await lancer("revenir.sh", ["aaaaaaa"], { REUNEA_FUMEE: join(bin, "fumee-ok") })).code).toBe(0);
    expect(courante()).toBe(join(releases, "aaaaaaa1"));
  });

  it("refuse s'il n'y a aucune version vers laquelle revenir", async () => {
    const releases = creerVersions("aaaaaaa1");
    symlinkSync(join(releases, "aaaaaaa1"), join(dossier, "srv", "current"));
    const resultat = await lancer("revenir.sh", [], { REUNEA_FUMEE: join(bin, "fumee-ok") });
    expect(resultat.code).not.toBe(0);
    expect(courante()).toBe(join(releases, "aaaaaaa1"));
    expect(journalAppels()).toEqual([]);
  });
});

describe("deployer.sh", () => {
  const ETIQUETTE = "v2026.11.12-1";
  let shaMain: string;

  function git(dans: string, ...args: string[]): string {
    return execFileSync("git", ["-C", dans, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Test",
        GIT_AUTHOR_EMAIL: "test@example.com",
        GIT_COMMITTER_NAME: "Test",
        GIT_COMMITTER_EMAIL: "test@example.com",
      },
    }).trim();
  }

  beforeEach(() => {
    // Dépôt « GitHub » : main étiquetée, et une branche non fusionnée étiquetée aussi.
    const origine = join(dossier, "origine");
    mkdirSync(origine);
    git(origine, "init", "--quiet", "--initial-branch=main");
    writeFileSync(join(origine, "package.json"), "{}\n");
    git(origine, "add", ".");
    git(origine, "commit", "--quiet", "-m", "Version livrée");
    git(origine, "tag", ETIQUETTE);
    shaMain = git(origine, "rev-parse", "HEAD");
    git(origine, "checkout", "--quiet", "-b", "pas-fusionnee");
    writeFileSync(join(origine, "brouillon.txt"), "pas relu\n");
    git(origine, "add", ".");
    git(origine, "commit", "--quiet", "-m", "Non fusionné");
    git(origine, "tag", "v2026.11.12-2");
    git(origine, "checkout", "--quiet", "main");
    mkdirSync(join(dossier, "srv"));
    execFileSync("git", ["clone", "--quiet", origine, join(dossier, "srv", "repo")]);

    programme("npm", `echo "npm $* DEPLOIEMENT=\${NEXT_DEPLOYMENT_ID:-}" >> "${appels}"`);
    programme("npx", `echo "npx $*" >> "${appels}"`);
    programme("fumee-ok", `echo "fumee" >> "${appels}"`);
    programme("fumee-ko", `echo "fumee" >> "${appels}"; exit 1`);
  });

  it("refuse une étiquette qui ne suit pas la convention", async () => {
    const resultat = await lancer("deployer.sh", ["main"]);
    expect(resultat.code).not.toBe(0);
    expect(resultat.sortie).toContain("usage : deployer.sh");
  });

  it("refuse une étiquette posée hors de main", async () => {
    const resultat = await lancer("deployer.sh", ["v2026.11.12-2"], { REUNEA_FUMEE: join(bin, "fumee-ok") });
    expect(resultat.code).not.toBe(0);
    expect(resultat.sortie).toContain("n'est pas sur main");
    expect(existsSync(join(dossier, "srv", "current"))).toBe(false);
  });

  it("livre la version : build, sauvegarde, migration, bascule, redémarrage, fumée", async () => {
    creerBase();
    const resultat = await lancer("deployer.sh", [ETIQUETTE], { REUNEA_FUMEE: join(bin, "fumee-ok") });
    expect(resultat.code, resultat.sortie).toBe(0);

    const destination = join(dossier, "srv", "releases", shaMain);
    expect(courante()).toBe(destination);
    expect(readlinkSync(join(destination, ".env"))).toBe(join(dossier, "etc", "reunea.env"));
    expect(existsSync(join(destination, "package.json"))).toBe(true);
    expect(journalAppels()).toEqual([
      "npm ci --no-audit --no-fund DEPLOIEMENT=",
      `npm run build DEPLOIEMENT=${shaMain}`,
      "npx prisma migrate deploy",
      "systemctl restart reunea",
      "fumee",
    ]);
    expect(sauvegardes().some((nom) => nom.endsWith(`-avant-${ETIQUETTE}.db.gz`))).toBe(true);
    expect(readFileSync(join(dossier, "srv", "livraisons.log"), "utf8")).toContain(
      `livraison ${ETIQUETTE} ${shaMain}`,
    );
  });

  it("revient seul à la version précédente si le contrôle de fumée échoue", async () => {
    const precedente = join(creerVersions("aaaaaaa1"), "aaaaaaa1");
    symlinkSync(precedente, join(dossier, "srv", "current"));

    const resultat = await lancer("deployer.sh", [ETIQUETTE], { REUNEA_FUMEE: join(bin, "fumee-ko") });
    expect(resultat.code).not.toBe(0);
    expect(resultat.sortie).toContain("livraison de v2026.11.12-1 annulée");
    expect(courante()).toBe(precedente);
    expect(existsSync(join(dossier, "srv", "releases", shaMain, ".retiree"))).toBe(true);
    expect(journalAppels().filter((appel) => appel.startsWith("systemctl"))).toEqual([
      "systemctl restart reunea",
      "systemctl restart reunea",
    ]);
  });

  it("refuse de relivrer la version déjà en service", async () => {
    expect((await lancer("deployer.sh", [ETIQUETTE], { REUNEA_FUMEE: join(bin, "fumee-ok") })).code).toBe(0);
    const resultat = await lancer("deployer.sh", [ETIQUETTE], { REUNEA_FUMEE: join(bin, "fumee-ok") });
    expect(resultat.code).not.toBe(0);
    expect(resultat.sortie).toContain("déjà en service");
  });
});
