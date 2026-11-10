import Image from "next/image";
import { Monogramme } from "./Logo";

// Photo d'une salle (fichiers de public/salles, renseignés dans Salle.photo),
// cadrée par son conteneur : le parent fixe le format (aspect-[3/2] par
// défaut, charte) et l'arrondi. Le champ photo est facultatif : sans photo,
// un aplat marine-clair avec le monogramme garde la mise en page.

// Textes alternatifs : ce que montre chaque photo (contrôlée dans le plan de
// refonte), limité aux équipements présents en base. Une photo inconnue de
// cette liste retombe sur « Photo de la salle « nom » ».
const DESCRIPTIONS: Record<string, string> = {
  "/salles/atelier.jpg":
    "L'Atelier : table de réunion entourée de 4 fauteuils, face à un écran et un tableau blanc.",
  "/salles/horizon.jpg":
    "Horizon : table de réunion pour 8 personnes, écran avec caméra de visioconférence et tableau blanc.",
  "/salles/conseil.jpg":
    "Salle du Conseil : longue table de 12 places, écran avec caméra de visioconférence et machine à café.",
  "/salles/agora.jpg":
    "Agora : tables disposées en U pour une vingtaine de personnes, vidéoprojecteur, micro et paperboard.",
};

export function PhotoSalle({
  photo,
  nom,
  sizes,
  enPriorite = false,
  decorative = false,
  className = "aspect-[3/2]",
}: {
  photo: string | null;
  nom: string;
  // Photo voisine du nom de la salle (carte, récapitulatif) : texte
  // alternatif vide, pour que le lecteur d'écran n'annonce pas deux fois la salle.
  decorative?: boolean;
  // Largeur affichée selon l'écran, pour que le navigateur choisisse la
  // plus petite variante suffisante (voir next/image, `sizes`).
  sizes: string;
  // Image visible dès l'arrivée (accroche) : chargée tout de suite.
  enPriorite?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden bg-marine-clair ${className}`}>
      {photo ? (
        <Image
          src={photo}
          // Guillemets : « Salle du Conseil » et « L'Atelier » portent déjà
          // leur article ou le mot salle.
          alt={decorative ? "" : (DESCRIPTIONS[photo] ?? `Photo de la salle « ${nom} »`)}
          fill
          sizes={sizes}
          // Doc next/image : loading et fetchPriority plutôt que preload.
          loading={enPriorite ? "eager" : "lazy"}
          fetchPriority={enPriorite ? "high" : undefined}
          className="object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center">
          <Monogramme className="size-16 opacity-40" />
        </div>
      )}
    </div>
  );
}
