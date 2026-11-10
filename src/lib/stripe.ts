import Stripe from "stripe";

// Client Stripe du serveur, créé au premier usage : les pages qui n'ont pas
// besoin de Stripe (réservation jamais payée) fonctionnent sans clé.
let client: Stripe | undefined;

export function obtenirStripe(): Stripe {
  if (client) return client;
  const cle = process.env.STRIPE_SECRET_KEY;
  if (!cle) {
    throw new Error("STRIPE_SECRET_KEY n'est pas définie (voir .env.example).");
  }
  // Le projet ne fonctionne qu'en mode test : une clé live est refusée.
  if (!cle.startsWith("sk_test_") && !cle.startsWith("rk_test_")) {
    throw new Error("STRIPE_SECRET_KEY doit être une clé de test (sk_test_…).");
  }
  client = new Stripe(cle);
  return client;
}
