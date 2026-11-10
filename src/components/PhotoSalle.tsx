import Image from "next/image";
import { Monogramme } from "./Logo";

// Photo d'une salle (fichiers de public/salles, renseignés dans Salle.photo),
// cadrée par son conteneur : le parent fixe le format (aspect-[3/2] par
// défaut, charte) et l'arrondi. Le champ photo est facultatif : sans photo,
// un aplat marine-clair avec le monogramme garde la mise en page.
export function PhotoSalle({
  photo,
  nom,
  sizes,
  enPriorite = false,
  className = "aspect-[3/2]",
}: {
  photo: string | null;
  nom: string;
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
          alt={`Photo de la salle « ${nom} »`}
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
