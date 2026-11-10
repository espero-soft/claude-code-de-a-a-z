"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { clientAuth } from "@/lib/auth-client";
import { IconeChargement } from "./icones";
import { estActif, LIEN_PROFIL } from "./liens-navigation";

// Parties interactives de la zone du compte (ZoneCompte.tsx).

// « Se connecter » garde la page courante en ?retour= : on y revient après
// la connexion (chemin revérifié par cheminDeRetour côté serveur).
export function LienSeConnecter({ compact = false }: { compact?: boolean }) {
  const chemin = usePathname();
  const surConnexion = chemin === "/connexion";
  const href =
    surConnexion || chemin === "/"
      ? "/connexion"
      : `/connexion?retour=${encodeURIComponent(chemin)}`;

  return (
    <Link
      href={href}
      aria-current={surConnexion ? "page" : undefined}
      className={`inline-flex min-h-11 items-center rounded-arrondi-pilule border font-semibold whitespace-nowrap ${
        compact ? "px-3 text-petit" : "px-5 text-corps"
      } ${
        surConnexion
          ? "border-cuivre-sur-marine bg-marine-fonce text-white"
          : "border-white/40 text-white hover:bg-marine-fonce"
      }`}
    >
      Se connecter
    </Link>
  );
}

// Déconnexion par le client Better Auth (route /api/auth/sign-out, qui
// supprime la session en base et le cookie), puis relecture de la page
// côté serveur pour remettre « Se connecter » dans l'en-tête.
export function BoutonDeconnexion() {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState(false);

  async function seDeconnecter() {
    setEnCours(true);
    setEchec(false);
    try {
      const { error } = await clientAuth.signOut();
      if (error) throw error;
      router.refresh();
    } catch {
      setEchec(true);
      setEnCours(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={seDeconnecter}
        disabled={enCours}
        aria-busy={enCours || undefined}
        className="flex min-h-11 w-full items-center gap-2 px-3 text-corps font-semibold whitespace-nowrap text-white/85 underline-offset-[10px] hover:text-white hover:underline disabled:cursor-wait md:w-auto"
      >
        {enCours && <IconeChargement className="size-4" />}
        Se déconnecter
      </button>
      {echec && (
        <p role="alert" className="px-3 text-petit text-white">
          La déconnexion a échoué. Réessayez.
        </p>
      )}
    </>
  );
}

// Initiale du compte, lien vers « Mon profil » dans la barre d'ordinateur
// (dans la <nav> : son nom accessible commence par « Mon profil »).
export function LienInitiale({ initiale, email }: { initiale: string; email: string }) {
  const actif = estActif(LIEN_PROFIL.href, usePathname());
  return (
    <Link
      href={LIEN_PROFIL.href}
      title={`${LIEN_PROFIL.libelle} (${email})`}
      aria-current={actif ? "page" : undefined}
      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-white font-titres text-lg font-bold text-marine ring-offset-2 ring-offset-marine hover:ring-2 hover:ring-white/60 ${
        actif ? "ring-2 ring-cuivre-sur-marine" : ""
      }`}
    >
      <span aria-hidden="true">{initiale}</span>
      <span className="sr-only">
        {LIEN_PROFIL.libelle} (connecté : {email})
      </span>
    </Link>
  );
}
