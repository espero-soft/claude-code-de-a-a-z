import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Client de Better Auth, pour les composants client (écran de connexion,
// bouton « Se déconnecter »). Il appelle les routes HTTP /api/auth/... :
// c'est là, et seulement là, que Better Auth limite le débit et vérifie
// l'origine. Ne pas remplacer par des appels à auth.api depuis une Server
// Action, qui contourneraient la limitation de débit.
// Sans baseURL : même origine que la page.
export const clientAuth = createAuthClient({
  plugins: [emailOTPClient()],
});
