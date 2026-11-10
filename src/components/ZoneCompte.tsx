import { Suspense } from "react";
import { lireCompte, type CompteConnecte } from "@/lib/compte";
import { LienCompte } from "./EnTete";
import { LIEN_ADMINISTRATION, LIEN_ESPACE_CLIENT, LIEN_PROFIL } from "./liens-navigation";
import { BoutonDeconnexion, LienInitiale, LienSeConnecter } from "./LiensCompte";

// Zone du compte dans l'en-tête marine. Visiteur : « Se connecter ».
// Connecté : l'initiale du compte et « Se déconnecter ».
// La session est lue par requête, donc sous son propre <Suspense> : le reste
// de l'en-tête reste dans la coquille statique (Cache Components).
// Trois emplacements, faute de place sur mobile :
// - « ordinateur » (dans la barre, après les liens) : l'initiale, lien vers
//   « Mon profil », et « Se déconnecter » ;
// - « mobile » (dans la barre, avant le bouton Menu) : lien ou initiale ;
// - « menu » (dans le menu déroulant mobile) : e-mail et « Se déconnecter » ;
// - « liens » (parmi les liens de navigation) : « Mes réservations » et
//   « Mon profil » pour tout compte, « Tickets » pour l'employé et
//   l'administrateur (les pages revérifient la session et le rôle).
type Disposition = "ordinateur" | "mobile" | "menu" | "liens";

export function ZoneCompte({ disposition }: { disposition: Disposition }) {
  return (
    <Suspense fallback={null}>
      <Contenu disposition={disposition} />
    </Suspense>
  );
}

async function Contenu({ disposition }: { disposition: Disposition }) {
  const compte = await lireCompte();

  if (disposition === "liens") {
    if (!compte) return null;
    return (
      <>
        <LienCompte {...LIEN_ESPACE_CLIENT} />
        {/* Sur ordinateur, c'est l'initiale qui mène au profil. */}
        <LienCompte {...LIEN_PROFIL} seulementMobile />
        {compte.personnel && <LienCompte {...LIEN_ADMINISTRATION} />}
      </>
    );
  }

  if (disposition === "menu") {
    if (!compte) return null;
    return (
      <li className="mt-2 border-t border-white/15 pt-2 md:hidden">
        <p className="px-3 py-1 text-petit break-all text-white/85">Connecté : {compte.email}</p>
        <BoutonDeconnexion />
      </li>
    );
  }

  if (disposition === "mobile") {
    return (
      <div className="flex items-center md:hidden">
        {compte ? <Initiale compte={compte} /> : <LienSeConnecter compact />}
      </div>
    );
  }

  return (
    <div className="hidden items-center gap-2 border-l border-white/20 pl-4 md:flex">
      {compte ? (
        <>
          <LienInitiale initiale={compte.initiale} email={compte.email} />
          <BoutonDeconnexion />
        </>
      ) : (
        <LienSeConnecter />
      )}
    </div>
  );
}

function Initiale({ compte }: { compte: CompteConnecte }) {
  return (
    <span
      title={compte.email}
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-white font-titres text-lg font-bold text-marine"
    >
      <span aria-hidden="true">{compte.initiale}</span>
      <span className="sr-only">Connecté : {compte.email}</span>
    </span>
  );
}
