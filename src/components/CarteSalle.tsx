import Link from "next/link";
import { formaterPrix } from "@/lib/format";
import { Badge } from "./Badge";
import { Carte } from "./Carte";
import { IconeEtiquette, IconeFleche, IconePersonnes } from "./icones";
import { PhotoSalle } from "./PhotoSalle";

type SalleAffichee = {
  id: string;
  nom: string;
  description: string;
  capacite: number;
  prixHeureCentimes: number;
  photo: string | null;
};

// Largeur affichée des cartes dans une grille d'une colonne, puis 2 (sm),
// puis 4 (lg), dans un conteneur de 72 rem au plus (accueil et /salles).
export const TAILLES_CARTE_SALLE =
  "(min-width: 1024px) 270px, (min-width: 640px) 50vw, 100vw";

// Carte de salle (maquettes 01 et 03) : photo 3:2, nom, extrait de la
// description, capacité et prix horaire, tous lus en base. Toute la carte
// mène à la fiche (lien étiré), sans bouton cuivre : un seul par écran.
// `equipements` (liste des salles, maquette 03) : badges sous la description.
export function CarteSalle({
  salle,
  equipements,
  niveauTitre: Titre = "h3",
  sizes,
}: {
  salle: SalleAffichee;
  equipements?: { id: string; nom: string }[];
  niveauTitre?: "h2" | "h3";
  sizes: string;
}) {
  return (
    <Carte
      as="li"
      grande
      avecMarge={false}
      className="group relative flex flex-col transition-shadow hover:shadow-lg"
    >
      <PhotoSalle photo={salle.photo} nom={salle.nom} sizes={sizes} />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <Titre className="text-titre-3 text-marine">
            {/* Le ::after couvre toute la carte : un clic n'importe où mène à
                la fiche, et le lecteur d'écran n'annonce que le nom. */}
            <Link
              href={`/salles/${salle.id}`}
              className="after:absolute after:inset-0 after:rounded-arrondi-l focus-visible:outline-none focus-visible:after:outline-3 focus-visible:after:outline-offset-2 focus-visible:after:outline-cuivre"
            >
              {salle.nom}
            </Link>
          </Titre>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-cuivre text-cuivre transition-colors group-hover:bg-cuivre group-hover:text-white">
            <IconeFleche className="size-4" />
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-petit text-encre-douce">{salle.description}</p>
        {equipements && equipements.length > 0 && (
          <ul aria-label="Équipements" className="mt-3 flex flex-wrap gap-1.5">
            {equipements.map((equipement) => (
              <li key={equipement.id}>
                <Badge ton="accent" icone={null}>
                  {equipement.nom}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <dl className="mt-auto space-y-1.5 pt-4 text-petit">
          <div className="flex items-center gap-2">
            <dt className="sr-only">Capacité</dt>
            <IconePersonnes className="size-4 shrink-0 text-encre-douce" />
            <dd>Jusqu&apos;à {salle.capacite} personnes</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="sr-only">Prix</dt>
            <IconeEtiquette className="size-4 shrink-0 text-cuivre" />
            <dd className="font-bold text-cuivre">
              {formaterPrix(salle.prixHeureCentimes)}
              <span className="font-normal text-encre-douce"> / heure</span>
            </dd>
          </div>
        </dl>
      </div>
    </Carte>
  );
}
