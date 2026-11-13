// Fausses clés pour les tests (Stripe, Anthropic).
//
// Une clé écrite d'un seul tenant dans un fichier (« sk_test_ » suivi d'une
// longue suite de lettres) ressemble à une vraie : la protection de push de
// GitHub la bloque, et un lecteur ne sait pas si elle est fausse. Ici, la clé
// n'existe qu'à l'exécution, assemblée à partir de ses morceaux : le code
// testé reçoit exactement le même préfixe qu'une vraie clé (sk_test_,
// rk_live_...), mais aucun fichier du dépôt ne contient de clé.
//
// Le corps par défaut, FACTICE, dit ce qu'il est. Un test qui vérifie qu'une
// valeur n'est jamais recopiée passe son propre corps, reconnaissable
// (ex. « FacticeNePasAfficher »).
// Garde-fou : cles-factices.test.ts refuse toute clé d'un seul tenant dans le dépôt.

export type SorteCleStripe = "sk" | "rk" | "pk";
export type ModeCleStripe = "test" | "live";

export function cleStripeFactice(
  sorte: SorteCleStripe,
  mode: ModeCleStripe,
  corps = "FACTICE",
): string {
  return [sorte, mode, corps].join("_");
}

export function cleAnthropicFactice(corps = "FACTICE"): string {
  return ["sk", "ant", "api03", corps].join("-");
}
