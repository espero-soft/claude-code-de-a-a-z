import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { IconeErreur } from "./icones";

// Champ de formulaire de la charte : libellé au-dessus, icône facultative
// dans le champ, aide en encre-douce dessous, erreur en `erreur` avec une
// icône et une phrase. L'aide et l'erreur sont reliées au champ par
// aria-describedby. Pas d'état « valide » : seul le serveur valide.

type PropsCommunes = {
  id: string;
  libelle: string;
  aide?: string;
  erreur?: string;
  icone?: ReactNode;
};

const CLASSES_CONTROLE =
  "block min-h-12 w-full rounded-arrondi-s border bg-surface px-4 text-corps text-encre placeholder:text-encre-douce";

function classesControle(erreur: string | undefined, avecIcone: boolean): string {
  return `${CLASSES_CONTROLE} ${erreur ? "border-erreur border-2" : "border-bordure"} ${
    avecIcone ? "pl-11" : ""
  }`;
}

function attributsAccessibles(id: string, aide?: string, erreur?: string) {
  const decrit = [aide && `${id}-aide`, erreur && `${id}-erreur`].filter(Boolean).join(" ");
  return {
    "aria-invalid": erreur ? true : undefined,
    "aria-describedby": decrit || undefined,
  };
}

function CadreChamp({
  id,
  libelle,
  aide,
  erreur,
  icone,
  children,
}: PropsCommunes & { children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-petit font-semibold text-encre">
        {libelle}
      </label>
      <div className="relative">
        {icone && (
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-encre-douce">
            {icone}
          </span>
        )}
        {children}
      </div>
      {aide && (
        <p id={`${id}-aide`} className="mt-1.5 text-petit text-encre-douce">
          {aide}
        </p>
      )}
      {erreur && (
        <p id={`${id}-erreur`} className="mt-1.5 flex items-start gap-1.5 text-petit text-erreur">
          <IconeErreur className="mt-0.5 size-4 shrink-0" />
          {erreur}
        </p>
      )}
    </div>
  );
}

export function Champ({
  id,
  libelle,
  aide,
  erreur,
  icone,
  name,
  className = "",
  ...props
}: PropsCommunes & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <CadreChamp id={id} libelle={libelle} aide={aide} erreur={erreur} icone={icone}>
      <input
        id={id}
        name={name ?? id}
        className={`${classesControle(erreur, Boolean(icone))} ${className}`}
        {...attributsAccessibles(id, aide, erreur)}
        {...props}
      />
    </CadreChamp>
  );
}

// Même habillage pour une liste déroulante (par exemple les heures de 30 en
// 30 minutes du formulaire de réservation).
export function ChampListe({
  id,
  libelle,
  aide,
  erreur,
  icone,
  name,
  className = "",
  children,
  ...props
}: PropsCommunes & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <CadreChamp id={id} libelle={libelle} aide={aide} erreur={erreur} icone={icone}>
      <select
        id={id}
        name={name ?? id}
        className={`${classesControle(erreur, Boolean(icone))} ${className}`}
        {...attributsAccessibles(id, aide, erreur)}
        {...props}
      >
        {children}
      </select>
    </CadreChamp>
  );
}
