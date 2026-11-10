// Attaques contre la connexion par code, rejouées comme un pirate : directement
// sur les routes HTTP de Better Auth (/api/auth/...), sans passer par l'écran.
// Chaque test prouve une parade (SECURITE.md, section 10).
// Prérequis : Mailpit lancé (API sur http://localhost:8025, ou MAILPIT_URL).
// Adresses jetables @attaque.example.com, supprimées par e2e/nettoyage.ts.
import { execFileSync } from "node:child_process";
import { expect, test, type APIRequestContext } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
// Site testé : même port que playwright.config.ts.
const ORIGINE = `http://localhost:${process.env.E2E_PORT ?? "3000"}`;

function nettoyer() {
  execFileSync("npx", ["tsx", "e2e/nettoyage.ts"], { stdio: "inherit" });
}
test.beforeAll(nettoyer);
test.afterAll(nettoyer);

// Fait passer le temps en base pour une adresse (voir e2e/vieillir-connexion.ts).
function vieillir(email: string, quoi: "code" | "envois") {
  execFileSync("npx", ["tsx", "e2e/vieillir-connexion.ts", email, quoi], { stdio: "inherit" });
}

let numero = 0;
function adresse(nom: string) {
  return `${nom}-${Date.now()}-${numero++}@attaque.example.com`;
}

type Reponse = { status: number; code?: string; corps: Record<string, unknown> };

async function poster(
  request: APIRequestContext,
  chemin: string,
  donnees: object,
  entetes: Record<string, string> = {},
): Promise<Reponse> {
  const reponse = await request.post(`/api/auth${chemin}`, {
    data: donnees,
    // Better Auth vérifie l'origine (protection CSRF).
    headers: { origin: ORIGINE, ...entetes },
  });
  const texte = await reponse.text();
  let corps: Record<string, unknown> = {};
  try {
    corps = JSON.parse(texte);
  } catch {
    corps = { texte };
  }
  return { status: reponse.status(), code: corps.code as string | undefined, corps };
}

const demanderCode = (request: APIRequestContext, email: string, entetes?: Record<string, string>) =>
  poster(request, "/email-otp/send-verification-otp", { email, type: "sign-in" }, entetes);
const essayerCode = (request: APIRequestContext, email: string, otp: string) =>
  poster(request, "/sign-in/email-otp", { email, otp });

// Codes reçus dans Mailpit, du plus récent au plus ancien. L'e-mail part sans
// être attendu par le serveur : on patiente jusqu'à en avoir `combien`.
async function codesRecus(request: APIRequestContext, email: string, combien = 1) {
  let codes: string[] = [];
  await expect(async () => {
    const reponse = await request.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    const { messages } = (await reponse.json()) as { messages: { Subject: string }[] };
    codes = messages.map((m) => m.Subject.match(/(\d{6})$/)?.[1] ?? "");
    expect(codes.length).toBeGreaterThanOrEqual(combien);
  }).toPass({ timeout: 10_000 });
  return codes;
}

// Un code faux à coup sûr : le bon, avec le premier chiffre changé.
const fauxCode = (bon: string, decalage = 1) =>
  `${(Number(bon[0]) + decalage) % 10}${bon.slice(1)}`;

test("refuse un faux code, et un code jamais demandé", async ({ request }) => {
  const email = adresse("faux");
  expect((await demanderCode(request, email)).status).toBe(200);
  const [bon] = await codesRecus(request, email);

  expect(await essayerCode(request, email, fauxCode(bon))).toMatchObject({
    status: 400,
    code: "INVALID_OTP",
  });
  expect(await essayerCode(request, adresse("jamais"), "123456")).toMatchObject({
    status: 400,
    code: "INVALID_OTP",
  });
});

test("refuse un code expiré, puis l'efface", async ({ request }) => {
  const email = adresse("expire");
  await demanderCode(request, email);
  const [bon] = await codesRecus(request, email);
  vieillir(email, "code"); // 5 minutes ont passé

  expect(await essayerCode(request, email, bon)).toMatchObject({
    status: 400,
    code: "OTP_EXPIRED",
  });
  // Effacé : le rejouer ne donne plus rien.
  expect(await essayerCode(request, email, bon)).toMatchObject({
    status: 400,
    code: "INVALID_OTP",
  });
});

test("invalide un code après 3 faux essais, même si le 4e est le bon", async ({ request }) => {
  const email = adresse("essais");
  await demanderCode(request, email);
  const [bon] = await codesRecus(request, email);

  for (const decalage of [1, 2, 3]) {
    expect((await essayerCode(request, email, fauxCode(bon, decalage))).status).toBe(400);
  }
  expect(await essayerCode(request, email, bon)).toMatchObject({
    status: 403,
    code: "TOO_MANY_ATTEMPTS",
  });
});

test("n'envoie que 3 codes par adresse, même en changeant d'adresse IP", async ({ request }) => {
  const email = adresse("avalanche");
  const statuts: number[] = [];
  let refus: Reponse | undefined;
  for (let i = 1; i <= 6; i++) {
    // Better Auth limite par IP, lue dans X-Forwarded-For : le pirate en
    // change à chaque requête pour passer entre les mailles.
    const reponse = await demanderCode(request, email, { "x-forwarded-for": `203.0.113.${i}` });
    statuts.push(reponse.status);
    if (reponse.status === 429) refus = reponse;
  }

  expect(statuts).toEqual([200, 200, 200, 429, 429, 429]);
  expect(refus?.code).toBe("TROP_DE_CODES_DEMANDES");
  expect(refus?.corps.reessayerDansSecondes).toBeGreaterThan(0);
  // La victime n'a reçu que 3 e-mails.
  expect(await codesRecus(request, email, 3)).toHaveLength(3);
});

test("plafonne la force brute à 10 essais par adresse, tous codes confondus", async ({
  request,
}) => {
  // Le pirate enchaîne : nouveau code, 3 essais au hasard, nouveau code...
  // Chaque code ne permet que 3 essais, mais sans plafond par adresse, il en
  // redemandait sans fin. On simule ici le passage du temps (fenêtre des
  // envois écoulée) pour n'être arrêté que par le plafond des essais.
  const email = adresse("force-brute");
  let essais = 0;
  for (let tour = 1; tour <= 3; tour++) {
    vieillir(email, "envois");
    expect((await demanderCode(request, email)).status).toBe(200);
    const [bon] = await codesRecus(request, email, tour);
    for (const decalage of [1, 2, 3]) {
      expect((await essayerCode(request, email, fauxCode(bon, decalage))).status).toBe(400);
      essais++;
    }
  }
  expect(essais).toBe(9);

  vieillir(email, "envois");
  await demanderCode(request, email);
  const [bon] = await codesRecus(request, email, 4);
  expect((await essayerCode(request, email, fauxCode(bon))).status).toBe(400); // 10e essai

  // Au-delà, même le bon code est refusé : il n'est plus vérifié du tout.
  expect(await essayerCode(request, email, bon)).toMatchObject({
    status: 429,
    code: "TROP_D_ESSAIS_SUR_CETTE_ADRESSE",
  });
});

test("ne trahit pas l'existence d'un compte", async ({ request }) => {
  // Un vrai compte, créé par le parcours normal.
  const existant = adresse("existant");
  await demanderCode(request, existant);
  const [code] = await codesRecus(request, existant);
  expect((await essayerCode(request, existant, code)).status).toBe(200);
  const inconnu = adresse("inconnu");

  // Les deux adresses reçoivent la même réponse, à chaque route.
  async function sonder(email: string) {
    const reponses = [
      await demanderCode(request, email),
      await poster(request, "/email-otp/send-verification-otp", { email, type: "forget-password" }),
      await poster(request, "/email-otp/send-verification-otp", {
        email,
        type: "email-verification",
      }),
    ];
    // L'ancien oracle : 4 faux codes sur la vérification « forget-password »
    // répondaient 400, 400, 400 puis 403 pour un compte, 400 pour un inconnu.
    for (let i = 1; i <= 4; i++) {
      reponses.push(
        await poster(request, "/email-otp/check-verification-otp", {
          email,
          type: "forget-password",
          otp: `00000${i}`,
        }),
      );
    }
    for (const chemin of [
      "/email-otp/verify-email",
      "/email-otp/request-password-reset",
      "/forget-password/email-otp",
    ]) {
      reponses.push(await poster(request, chemin, { email, otp: "000000" }));
    }
    return reponses.map(({ status, corps }) => ({ status, corps }));
  }

  const pourExistant = await sonder(existant);
  expect(pourExistant).toEqual(await sonder(inconnu));
  // Et ce qu'elles reçoivent : un code de connexion, rien d'autre.
  expect(pourExistant.map((r) => r.status)).toEqual([200, 400, 400, 404, 404, 404, 404, 404, 404, 404]);
});
