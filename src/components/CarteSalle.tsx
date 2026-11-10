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
//
// Sous 640 px (maquette 04, parcours mobile) : grande photo 16:9, nom et
// flèche posés dessus sur un dégradé marine foncé (contraste du blanc d'au
// moins 4,5:1 même sur un ciel blanc), puis capacité et prix sur une ligne ;
// description et équipements restent sur la fiche.
// Photo et en-tête partagent une cellule de grille plutôt qu'un
// positionnement absolu : le seul ancêtre positionné du lien reste la carte
// (`relative`), donc son ::after couvre toujours toute la carte.
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
      // Anneau de focus sur la carte, pas sur le ::after du lien : le
      // overflow-hidden de la grande carte couperait un contour extérieur.
      className="group relative flex flex-col transition-shadow hover:shadow-lg has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-cuivre"
    >
      <div className="grid sm:block">
        {/* Le nom suit dans le titre (lien de la carte) : photo décorative. */}
        <PhotoSalle
          photo={salle.photo}
          nom={salle.nom}
          sizes={sizes}
          decorative
          className="col-start-1 row-start-1 aspect-[16/9] sm:aspect-[3/2]"
        />
        {/* z-10 : un élément de grille passe au-dessus de la photo
            (positionnée) sans devenir lui-même positionné. */}
        <div className="z-10 col-start-1 row-start-1 flex items-end justify-between gap-3 self-end bg-linear-to-t from-marine-fonce/85 via-marine-fonce/70 via-55% to-transparent px-4 pt-14 pb-4 sm:items-start sm:bg-none sm:px-5 sm:pt-5 sm:pb-0">
          <Titre className="text-titre-2 text-white sm:text-titre-3 sm:text-marine">
            {/* Le ::after couvre toute la carte : un clic n'importe où mène à
                la fiche, et le lecteur d'écran n'annonce que le nom. */}
            <Link
              href={`/salles/${salle.id}`}
              className="after:absolute after:inset-0 after:rounded-arrondi-l focus-visible:outline-none"
            >
              {salle.nom}
            </Link>
          </Titre>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-marine transition-colors group-hover:bg-cuivre group-hover:text-white sm:size-8 sm:border-2 sm:border-cuivre sm:bg-transparent sm:text-cuivre">
            <IconeFleche className="size-4" />
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col px-4 py-3 sm:p-5 sm:pt-0">
        <p className="mt-2 line-clamp-2 text-petit text-encre-douce max-sm:hidden">
          {salle.description}
        </p>
        {equipements && equipements.length > 0 && (
          <ul aria-label="Équipements" className="mt-3 flex flex-wrap gap-1.5 max-sm:hidden">
            {equipements.map((equipement) => (
              <li key={equipement.id}>
                <Badge ton="accent" icone={null}>
                  {equipement.nom}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <dl className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-petit sm:block sm:space-y-1.5 sm:pt-4">
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
