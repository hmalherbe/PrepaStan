"use client";

import "quill/dist/quill.snow.css";
import { useEffect, useRef } from "react";

// Une appréciation "vide" côté éditeur riche n'est pas la chaîne vide :
// Quill laisse toujours un <p><br></p> résiduel une fois tout le texte
// effacé. Utilisé pour la validation (toutes les appréciations saisies) et
// pour ne pas enregistrer un HTML vide en base.
export function estAppreciationVide(html: string): boolean {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim() === "";
}

const TAILLE_MAX_FICHIER_IMAGE = 8 * 1024 * 1024; // avant compression
const DIMENSION_MAX_IMAGE = 900; // px, sur le plus grand côté

// Redimensionne et recompresse l'image côté client avant de l'intégrer en
// base64 dans le HTML (l'appréciation entière, images comprises, est
// stockée telle quelle en base) — une photo de téléphone non compressée
// ferait sinon plusieurs Mo par appréciation.
async function comprimerImage(fichier: File): Promise<string> {
  const bitmap = await createImageBitmap(fichier);
  const ratio = Math.min(1, DIMENSION_MAX_IMAGE / Math.max(bitmap.width, bitmap.height));
  const largeur = Math.round(bitmap.width * ratio);
  const hauteur = Math.round(bitmap.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = largeur;
  canvas.height = hauteur;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Contexte canvas indisponible");
  ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
  return canvas.toDataURL("image/jpeg", 0.75);
}

export function AppreciationEditor({
  value,
  onChange,
  onBlur,
  disabled,
}: {
  value: string;
  onChange: (html: string) => void;
  onBlur: () => void;
  disabled: boolean;
}) {
  // Grille de notation figée (grille validée ou session gelée par le
  // référent) : simple affichage HTML, pas besoin d'instancier Quill (une
  // grille peut compter beaucoup de lignes).
  if (disabled) {
    return <div className="editeur-riche-zone ql-editor" dangerouslySetInnerHTML={{ __html: value }} />;
  }
  return <EditeurQuill valeurInitiale={value} onChange={onChange} onBlur={onBlur} />;
}

function EditeurQuill({
  valeurInitiale,
  onChange,
  onBlur,
}: {
  valeurInitiale: string;
  onChange: (html: string) => void;
  onBlur: () => void;
}) {
  const conteneurRef = useRef<HTMLDivElement>(null);
  // Callbacks toujours à jour dans les écouteurs Quill, attachés une seule
  // fois à la création de l'éditeur (voir l'effet ci-dessous).
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;

  useEffect(() => {
    const conteneur = conteneurRef.current;
    if (!conteneur) return;
    let annule = false;

    // Import dynamique : Quill touche au DOM dès son chargement, ce qui est
    // incompatible avec le rendu serveur (le composant est bien "use
    // client", mais Next.js exécute quand même un premier rendu côté
    // serveur pour le HTML initial).
    import("quill").then(({ default: Quill }) => {
      if (annule) return;
      const quill = new Quill(conteneur, {
        theme: "snow",
        modules: {
          toolbar: {
            container: [
              ["bold", "italic", "underline", "strike"],
              [{ list: "ordered" }, { list: "bullet" }],
              ["clean"],
              ["image"],
            ],
            handlers: {
              // Remplace le comportement par défaut (base64 direct, sans
              // compression) pour ne pas alourdir démesurément l'appréciation.
              image(this: { quill: InstanceType<typeof Quill> }) {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/*";
                input.onchange = async () => {
                  const fichier = input.files?.[0];
                  if (!fichier) return;
                  if (fichier.size > TAILLE_MAX_FICHIER_IMAGE) {
                    alert("Image trop volumineuse (8 Mo maximum).");
                    return;
                  }
                  try {
                    const dataUrl = await comprimerImage(fichier);
                    const range = this.quill.getSelection(true);
                    this.quill.insertEmbed(range.index, "image", dataUrl, "user");
                    this.quill.setSelection(range.index + 1, 0, "user");
                  } catch {
                    alert("Impossible de traiter cette image.");
                  }
                };
                input.click();
              },
            },
          },
        },
      });
      quill.root.innerHTML = valeurInitiale;
      quill.on("text-change", () => onChangeRef.current(quill.root.innerHTML));
      quill.on("selection-change", (range) => {
        if (range === null) onBlurRef.current();
      });
    });

    return () => {
      annule = true;
    };
    // valeurInitiale volontairement absente des deps : ne sert qu'à
    // initialiser l'éditeur au montage, qui reste ensuite seul maître de
    // son contenu (comme un <input defaultValue>) — le refaire à chaque
    // frappe recréerait l'éditeur et ferait sauter le curseur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // Quill insère sa barre d'outils comme frère précédent du conteneur,
    // en manipulant le DOM directement — le wrapper isole cette insertion
    // dans un sous-arbre que React ne re-réconciliera jamais différemment
    // (un seul enfant déclaré, jamais changé), pour ne pas perturber le
    // diffing React du <td> parent.
    <div>
      <div ref={conteneurRef} className="editeur-riche-zone" />
    </div>
  );
}
