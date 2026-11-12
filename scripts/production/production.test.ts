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
  // Comme le dépôt de la formation : main reste le point de départ vierge, la
  // version livrée est sur la branche du module.
  const BRANCHE = "module-12B";
  const ETIQUETTE = "v2026.11.12-1"; // annotée, sur module-12B, sur « GitHub »
  const ETIQUETTE_MAIN = "v2026.11.10-1"; // annotée, sur main
  const ETIQUETTE_AUTRE_BRANCHE = "v2026.11.12-2"; // annotée, sur module-11 seulement
  const ETIQUETTE_LEGERE = "v2026.11.12-3"; // légère, sur module-12B
  const ETIQUETTE_LOCALE = "v2026.11.12-4"; // annotée, dans le clone du serveur seulement
  let shaModule: string;
  let shaMain: string;
  let depot: string;

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

  function commit(dans: string, fichier: string, message: string): string {
    writeFileSync(join(dans, fichier), `${message}\n`);
    git(dans, "add", ".");
    git(dans, "commit", "--quiet", "-m", message);
    return git(dans, "rev-parse", "HEAD");
  }

  beforeEach(() => {
    // Dépôt « GitHub » (le dépôt d'origine du clone du serveur).
    const origine = join(dossier, "origine");
    mkdirSync(origine);
    git(origine, "init", "--quiet", "--initial-branch=main");
    writeFileSync(join(origine, "package.json"), "{}\n");
    shaMain = commit(origine, "LISEZMOI.md", "Point de départ des apprenants");
    git(origine, "tag", "-a", ETIQUETTE_MAIN, "-m", "Départ");

    git(origine, "checkout", "--quiet", "-b", BRANCHE);
    shaModule = commit(origine, "module.txt", "Module 12B");
    git(origine, "tag", "-a", ETIQUETTE, "-m", "Démonstration du module 12B");
    git(origine, "tag", ETIQUETTE_LEGERE);

    git(origine, "checkout", "--quiet", "-b", "module-11", "main");
    commit(origine, "module-11.txt", "Module 11");
    git(origine, "tag", "-a", ETIQUETTE_AUTRE_BRANCHE, "-m", "Module 11");
    git(origine, "checkout", "--quiet", "main");

    mkdirSync(join(dossier, "srv"));
    depot = join(dossier, "srv", "repo");
    execFileSync("git", ["clone", "--quiet", origine, depot]);
    // Étiquette posée dans le clone du serveur, jamais poussée.
    git(depot, "tag", "-a", ETIQUETTE_LOCALE, "-m", "Pas sur GitHub", shaModule);

    programme("npm", `echo "npm $* DEPLOIEMENT=\${NEXT_DEPLOYMENT_ID:-}" >> "${appels}"`);
    programme("npx", `echo "npx $*" >> "${appels}"`);
    programme("fumee-ok", `echo "fumee" >> "${appels}"`);
    programme("fumee-ko", `echo "fumee" >> "${appels}"; exit 1`);
  });

  const FUMEE_OK = () => ({ REUNEA_FUMEE: join(bin, "fumee-ok") });

  // Refus : rien n'est construit, rien n'est basculé.
  async function attendreRefus(args: string[], message: string | RegExp) {
    const resultat = await lancer("deployer.sh", args, FUMEE_OK());
    expect(resultat.code).not.toBe(0);
    expect(resultat.sortie).toMatch(message);
    expect(existsSync(join(dossier, "srv", "current"))).toBe(false);
    expect(journalAppels()).toEqual([]);
  }

  it("refuse une étiquette qui ne suit pas la convention", async () => {
    await attendreRefus(["main", BRANCHE], "usage : deployer.sh");
  });

  it("exige la branche, et seulement main ou une branche de module", async () => {
    await attendreRefus([ETIQUETTE], "branche reçue : ''");
    await attendreRefus([ETIQUETTE, "pas-fusionnee"], "branche reçue : 'pas-fusionnee'");
    await attendreRefus([ETIQUETTE, "main;id"], "usage : deployer.sh");
  });

  it("refuse une branche absente de GitHub", async () => {
    await attendreRefus([ETIQUETTE, "module-99"], "branche module-99 introuvable sur GitHub");
  });

  it("refuse une étiquette présente seulement dans le clone du serveur", async () => {
    await attendreRefus([ETIQUETTE_LOCALE, BRANCHE], `étiquette ${ETIQUETTE_LOCALE} absente de GitHub`);
  });

  it("refuse avec un message clair quand GitHub ne répond plus", async () => {
    // Le fetch passe, puis ls-remote échoue : faux git qui appelle le vrai,
    // sauf pour « git -C <dépôt> ls-remote ».
    const vraiGit = execFileSync("bash", ["-c", "command -v git"], { encoding: "utf8" }).trim();
    programme("git", `if [ "$3" = "ls-remote" ]; then exit 128; fi\nexec "${vraiGit}" "$@"`);
    await attendreRefus([ETIQUETTE, BRANCHE], "GitHub injoignable");
  });

  it("refuse une étiquette légère, même sur la bonne branche", async () => {
    await attendreRefus([ETIQUETTE_LEGERE, BRANCHE], `étiquette ${ETIQUETTE_LEGERE} légère`);
  });

  it("refuse une étiquette posée sur une autre branche que celle annoncée", async () => {
    await attendreRefus(
      [ETIQUETTE_AUTRE_BRANCHE, BRANCHE],
      `n'est pas sur la branche ${BRANCHE} de GitHub`,
    );
    // L'étiquette du module n'est pas non plus sur main, restée vierge.
    await attendreRefus([ETIQUETTE, "main"], "n'est pas sur la branche main de GitHub");
  });

  it("livre aussi une étiquette annotée de main", async () => {
    const resultat = await lancer("deployer.sh", [ETIQUETTE_MAIN, "main"], FUMEE_OK());
    expect(resultat.code, resultat.sortie).toBe(0);
    expect(courante()).toBe(join(dossier, "srv", "releases", shaMain));
  });

  it("livre la version du module : build, sauvegarde, migration, bascule, redémarrage, fumée", async () => {
    creerBase();
    const resultat = await lancer("deployer.sh", [ETIQUETTE, BRANCHE], FUMEE_OK());
    expect(resultat.code, resultat.sortie).toBe(0);

    const destination = join(dossier, "srv", "releases", shaModule);
    expect(courante()).toBe(destination);
    expect(readlinkSync(join(destination, ".env"))).toBe(join(dossier, "etc", "reunea.env"));
    expect(existsSync(join(destination, "module.txt"))).toBe(true);
    expect(journalAppels()).toEqual([
      "npm ci --no-audit --no-fund DEPLOIEMENT=",
      `npm run build DEPLOIEMENT=${shaModule}`,
      "npx prisma migrate deploy",
      "systemctl restart reunea",
      "fumee",
    ]);
    expect(sauvegardes().some((nom) => nom.endsWith(`-avant-${ETIQUETTE}.db.gz`))).toBe(true);
    expect(readFileSync(join(dossier, "srv", "livraisons.log"), "utf8")).toContain(
      `livraison ${ETIQUETTE} ${shaModule} (${BRANCHE})`,
    );
  });

  it("revient seul à la version précédente si le contrôle de fumée échoue", async () => {
    const precedente = join(creerVersions("aaaaaaa1"), "aaaaaaa1");
    symlinkSync(precedente, join(dossier, "srv", "current"));

    const resultat = await lancer("deployer.sh", [ETIQUETTE, BRANCHE], { REUNEA_FUMEE: join(bin, "fumee-ko") });
    expect(resultat.code).not.toBe(0);
    expect(resultat.sortie).toContain("livraison de v2026.11.12-1 annulée");
    expect(courante()).toBe(precedente);
    expect(existsSync(join(dossier, "srv", "releases", shaModule, ".retiree"))).toBe(true);
    expect(journalAppels().filter((appel) => appel.startsWith("systemctl"))).toEqual([
      "systemctl restart reunea",
      "systemctl restart reunea",
    ]);
  });

  it("refuse de relivrer la version déjà en service", async () => {
    expect((await lancer("deployer.sh", [ETIQUETTE, BRANCHE], FUMEE_OK())).code).toBe(0);
    const resultat = await lancer("deployer.sh", [ETIQUETTE, BRANCHE], FUMEE_OK());
    expect(resultat.code).not.toBe(0);
    expect(resultat.sortie).toContain("déjà en service");
  });
});
