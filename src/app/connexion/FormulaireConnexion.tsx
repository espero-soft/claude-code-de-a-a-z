"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bouton } from "@/components/Bouton";
import { Champ } from "@/components/Champ";
import { Encadre } from "@/components/Encadre";
import { IconeEnveloppe, IconeFleche } from "@/components/icones";
import { clientAuth } from "@/lib/auth-client";
import {
  erreurCode,
  erreurEmail,
  LONGUEUR_CODE,
  messageErreurConnexion,
  normaliserCode,
  type MessageErreur,
} from "@/lib/connexion";

type Etape = "email" | "code";
type Envoi = "aucun" | "code" | "connexion" | "renvoi";

// Deux étapes sur le même écran : l'e-mail (« Recevoir mon code »), puis le
// code à 6 chiffres. Les appels passent par le client Better Auth (routes
// HTTP /api/auth/..., débit limité et origine vérifiée). Chaque message
// d'erreur est traduit par messageErreurConnexion (src/lib/connexion.ts).
export function FormulaireConnexion({ retour }: { retour: string }) {
  const router = useRouter();
  const [etape, setEtape] = useState<Etape>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState<MessageErreur | null>(null);
  const [envoi, setEnvoi] = useState<Envoi>("aucun");
  const [codeRenvoye, setCodeRenvoye] = useState(false);
  const formulaire = useRef<HTMLFormElement>(null);
  const titre = useRef<HTMLHeadingElement>(null);
  const changementEtape = useRef(false);

  // Après une erreur, le focus va au champ fautif (ou à l'encadré général) ;
  // après un changement d'étape, au titre de la nouvelle étape, pour que le
  // lecteur d'écran l'annonce avec la consigne qui suit.
  useEffect(() => {
    if (changementEtape.current) {
      changementEtape.current = false;
      titre.current?.focus();
      return;
    }
    if (!erreur) return;
    formulaire.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"], [data-erreur-generale]')
      ?.focus();
  }, [erreur, etape]);

  async function envoyerCode(): Promise<boolean> {
    const { error } = await clientAuth.emailOtp.sendVerificationOtp({
      email: email.trim(),
      type: "sign-in",
    });
    if (error) {
      setErreur(messageErreurConnexion(error));
      return false;
    }
    return true;
  }

  async function demanderCode(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const message = erreurEmail(email);
    if (message) {
      setErreur({ champ: "email", message });
      return;
    }
    setErreur(null);
    setEnvoi("code");
    try {
      if (await envoyerCode()) {
        setCode("");
        setCodeRenvoye(false);
        changementEtape.current = true;
        setEtape("code");
      }
    } catch {
      setErreur(messageErreurConnexion(null));
    } finally {
      setEnvoi("aucun");
    }
  }

  async function seConnecter(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const message = erreurCode(code);
    if (message) {
      setErreur({ champ: "code", message });
      return;
    }
    setErreur(null);
    setEnvoi("connexion");
    try {
      const { error } = await clientAuth.signIn.emailOtp({
        email: email.trim(),
        otp: normaliserCode(code),
      });
      if (error) {
        setErreur(messageErreurConnexion(error));
        setEnvoi("aucun");
        return;
      }
      // Le cookie de session est posé : on repart vers la page demandée, et
      // refresh() relit l'en-tête (initiale, « Se déconnecter ») côté serveur.
      // Le bouton reste « en cours » jusqu'au changement de page.
      router.replace(retour);
      router.refresh();
    } catch {
      setErreur(messageErreurConnexion(null));
      setEnvoi("aucun");
    }
  }

  async function renvoyerCode() {
    setErreur(null);
    setCodeRenvoye(false);
    setEnvoi("renvoi");
    try {
      if (await envoyerCode()) {
        setCode("");
        setCodeRenvoye(true);
      }
    } catch {
      setErreur(messageErreurConnexion(null));
    } finally {
      setEnvoi("aucun");
    }
  }

  function modifierEmail() {
    setErreur(null);
    setCode("");
    setCodeRenvoye(false);
    changementEtape.current = true;
    setEtape("email");
  }

  const erreurGenerale = erreur?.champ === "general" && (
    <div tabIndex={-1} data-erreur-generale className="rounded-arrondi-m">
      <Encadre ton="erreur" role="alert">
        {erreur.message}
      </Encadre>
    </div>
  );

  if (etape === "email") {
    return (
      <form ref={formulaire} onSubmit={demanderCode} noValidate className="space-y-6">
        <div>
          <h2
            id="titre-formulaire"
            ref={titre}
            tabIndex={-1}
            className="text-titre-2 text-marine"
          >
            Se connecter
          </h2>
          <p className="mt-2 text-encre-douce">
            Saisissez votre adresse e-mail : nous vous envoyons un code à{" "}
            {LONGUEUR_CODE} chiffres.
          </p>
        </div>

        <Champ
          id="email"
          libelle="Adresse e-mail"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          erreur={erreur?.champ === "email" ? erreur.message : undefined}
          icone={<IconeEnveloppe />}
        />

        {erreurGenerale}

        <Bouton
          type="submit"
          variante="action"
          pleineLargeur
          enCours={envoi === "code"}
          libelleEnCours="Envoi du code…"
        >
          Recevoir mon code
          <IconeFleche />
        </Bouton>
      </form>
    );
  }

  return (
    <form ref={formulaire} onSubmit={seConnecter} noValidate className="space-y-6">
      <div>
        <h2
          id="titre-formulaire"
          ref={titre}
          tabIndex={-1}
          className="text-titre-2 text-marine"
        >
          Saisissez votre code
        </h2>
        <p className="mt-2 text-encre-douce">
          Un code à {LONGUEUR_CODE} chiffres vient d&apos;être envoyé à{" "}
          <strong className="font-semibold break-all text-encre">{email.trim()}</strong>. Il
          est valable 5 minutes.
        </p>
      </div>

      <Champ
        id="code"
        libelle={`Code à ${LONGUEUR_CODE} chiffres`}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={LONGUEUR_CODE + 2}
        required
        value={code}
        onChange={(e) => setCode(e.target.value)}
        erreur={erreur?.champ === "code" ? erreur.message : undefined}
        aide="Vérifiez aussi vos courriers indésirables."
        className="font-semibold tracking-[0.4em]"
      />

      {codeRenvoye && (
        <Encadre ton="information" role="status">
          Un nouveau code vient d&apos;être envoyé. Utilisez le dernier reçu.
        </Encadre>
      )}

      {erreurGenerale}

      <Bouton
        type="submit"
        variante="action"
        pleineLargeur
        enCours={envoi === "connexion"}
        disabled={envoi === "renvoi"}
        libelleEnCours="Connexion…"
      >
        Se connecter
        <IconeFleche />
      </Bouton>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Bouton
          variante={erreur?.nouveauCodeNecessaire ? "principal" : "secondaire"}
          pleineLargeur
          onClick={renvoyerCode}
          enCours={envoi === "renvoi"}
          disabled={envoi === "connexion"}
          libelleEnCours="Envoi…"
        >
          Renvoyer un code
        </Bouton>
        <Bouton
          variante="secondaire"
          pleineLargeur
          onClick={modifierEmail}
          disabled={envoi !== "aucun"}
        >
          Changer d&apos;adresse
        </Bouton>
      </div>
    </form>
  );
}
