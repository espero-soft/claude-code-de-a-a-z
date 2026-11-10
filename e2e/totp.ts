// Code TOTP calculé comme le ferait une application d'authentification
// (RFC 6238 : HMAC-SHA1, pas de 30 s, 6 chiffres), à partir de la clé en base
// 32 affichée à l'enrôlement. Implémentation indépendante de Better Auth, sur
// node:crypto seul : les tests prouvent ainsi qu'une vraie application, qui ne
// partage aucun code avec le serveur, est acceptée. Pas besoin de téléphone.
import { createHmac } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const PAS_TOTP_MS = 30_000;

function base32VersOctets(texte: string): Buffer {
  const propre = texte.replace(/[\s=]/g, "").toUpperCase();
  let bits = "";
  for (const caractere of propre) {
    const valeur = ALPHABET.indexOf(caractere);
    if (valeur < 0) throw new Error(`Caractère base 32 invalide : ${caractere}`);
    bits += valeur.toString(2).padStart(5, "0");
  }
  const octets: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) octets.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(octets);
}

export function pasTotp(instant = Date.now()): number {
  return Math.floor(instant / PAS_TOTP_MS);
}

export function codeTotp(cleBase32: string, instant = Date.now()): string {
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(pasTotp(instant)));
  const hmac = createHmac("sha1", base32VersOctets(cleBase32)).update(compteur).digest();
  const decalage = hmac[hmac.length - 1] & 0x0f;
  const binaire = hmac.readUInt32BE(decalage) & 0x7fffffff;
  return String(binaire % 1_000_000).padStart(6, "0");
}

// Attend le pas suivant (code neuf) : le serveur refuse un code déjà servi.
export async function attendrePasSuivant(pasDejaUtilise: number) {
  while (pasTotp() <= pasDejaUtilise) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
