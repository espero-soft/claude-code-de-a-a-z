"use client";

import { useActionState } from "react";
import { Bouton } from "@/components/Bouton";
import { Carte } from "@/components/Carte";
import { Encadre } from "@/components/Encadre";
import { grouperSecret } from "@/lib/deuxieme-facteur";
import { commencerEnrolement, type EtatEnrolement } from "./actions";
import { FormulaireCode } from "./FormulaireCode";

const etatInitial: EtatEnrolement = {};

// Premier passage du personnel : 1. configurer l'application (QR code ou
// clé), 2. noter les codes de secours, 3. saisir un premier code, qui
// confirme la configuration et valide la session.
export function Enrolement({ retour, email }: { retour: string; email: string }) {
  const [etat, commencer, enCours] = useActionState(commencerEnrolement, etatInitial);

  if (!etat.secret || !etat.qrSvg || !etat.codesSecours) {
    return (
      <Carte className="mt-8 sm:p-8">
        <h2 className="text-titre-3 text-marine">Avant de commencer</h2>
        <p className="mt-3 text-encre">
          Installez sur votre téléphone une application d&apos;authentification (par exemple
          Google Authenticator, Microsoft Authenticator ou FreeOTP). La clé et les codes de
          secours ne s&apos;afficheront qu&apos;une fois : gardez de quoi les noter.
        </p>
        {etat.erreur && (
          <Encadre ton="erreur" role="alert" className="mt-4">
            {etat.erreur}
          </Encadre>
        )}
        <form action={commencer} className="mt-6">
          <Bouton type="submit" enCours={enCours} libelleEnCours="Préparation…" pleineLargeur>
            Configurer l&apos;application
          </Bouton>
        </form>
      </Carte>
    );
  }

  return (
    <ol className="mt-8 space-y-6">
      <Carte as="li" className="sm:p-8">
        <h2 className="text-titre-3 text-marine">1. Ajoutez le compte dans l&apos;application</h2>
        <p className="mt-2 text-encre">Scannez ce QR code avec l&apos;application.</p>
        <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <div
            role="img"
            aria-label={`QR code à scanner : compte Réunéa ${email}`}
            className="w-48 shrink-0 rounded-arrondi-m border border-bordure bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
            // SVG produit par le serveur à partir de notre propre URI otpauth://.
            dangerouslySetInnerHTML={{ __html: etat.qrSvg }}
          />
          <div className="min-w-0">
            <p className="text-petit text-encre-douce">
              Impossible de scanner ? Saisissez cette clé dans l&apos;application (type : basé
              sur le temps) :
            </p>
            <p
              aria-label="Clé de configuration"
              className="mt-2 rounded-arrondi-s bg-fond px-3 py-2 font-mono text-lg break-words text-encre"
            >
              {grouperSecret(etat.secret)}
            </p>
          </div>
        </div>
      </Carte>

      <Carte as="li" className="sm:p-8">
        <h2 className="text-titre-3 text-marine">2. Notez vos codes de secours</h2>
        <Encadre ton="alerte" titre="Affichés une seule fois" className="mt-3">
          Ils remplacent l&apos;application si vous perdez votre téléphone. Chacun ne sert
          qu&apos;une fois. Rangez-les hors de ce téléphone (gestionnaire de mots de passe,
          papier sous clé).
        </Encadre>
        <ul
          aria-label="Codes de secours"
          className="mt-4 grid grid-cols-1 gap-2 font-mono text-lg text-encre min-[400px]:grid-cols-2"
        >
          {etat.codesSecours.map((code) => (
            <li key={code} className="rounded-arrondi-s bg-fond px-3 py-1.5 text-center">
              {code}
            </li>
          ))}
        </ul>
      </Carte>

      <Carte as="li" className="sm:p-8">
        <h2 className="text-titre-3 text-marine">3. Confirmez avec un premier code</h2>
        <p className="mt-2 mb-4 text-encre">
          Saisissez le code que l&apos;application affiche maintenant pour Réunéa.
        </p>
        <FormulaireCode retour={retour} mode="totp" libelleBouton="Confirmer et continuer" />
      </Carte>
    </ol>
  );
}
