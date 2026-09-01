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

export function AppreciationEditor({
  value,
  onChange,
  onBlur,
  disabled,
  onChoisirPieceJointe,
  accept,
}: {
  value: string;
  onChange: (html: string) => void;
  onBlur: () => void;
  disabled: boolean;
  // Bouton "trombone" ajouté à la barre d'outils : ouvre un sélecteur de
  // fichier et transmet le fichier choisi, sans rien insérer dans le texte
  // (la pièce jointe est gérée à part par l'appelant, voir GrilleForm.tsx).
  onChoisirPieceJointe: (fichier: File) => void;
  accept: string;
}) {
  // Grille de notation figée (grille validée ou session gelée par le
  // référent) : simple affichage HTML, pas besoin d'instancier Quill (une
  // grille peut compter beaucoup de lignes).
  if (disabled) {
    return <div className="editeur-riche-zone ql-editor" dangerouslySetInnerHTML={{ __html: value }} />;
  }
  return (
    <EditeurQuill
      valeurInitiale={value}
      onChange={onChange}
      onBlur={onBlur}
      onChoisirPieceJointe={onChoisirPieceJointe}
      accept={accept}
    />
  );
}

function EditeurQuill({
  valeurInitiale,
  onChange,
  onBlur,
  onChoisirPieceJointe,
  accept,
}: {
  valeurInitiale: string;
  onChange: (html: string) => void;
  onBlur: () => void;
  onChoisirPieceJointe: (fichier: File) => void;
  accept: string;
}) {
  const conteneurRef = useRef<HTMLDivElement>(null);
  // Callbacks toujours à jour dans les écouteurs Quill, attachés une seule
  // fois à la création de l'éditeur (voir l'effet ci-dessous).
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  const onChoisirPieceJointeRef = useRef(onChoisirPieceJointe);
  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;
  onChoisirPieceJointeRef.current = onChoisirPieceJointe;

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
              ["attachment"],
            ],
            handlers: {
              // Ne formate rien : ouvre juste un sélecteur de fichier et
              // relaie le fichier choisi (voir onChoisirPieceJointe).
              attachment: () => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = accept;
                input.onchange = () => {
                  const fichier = input.files?.[0];
                  if (fichier) onChoisirPieceJointeRef.current(fichier);
                };
                input.click();
              },
            },
          },
        },
      });
      // Quill n'a pas d'icône "pièce jointe" intégrée (contrairement à
      // gras/italique/listes/etc.) : on la fixe une fois le bouton créé.
      const boutonPieceJointe = conteneur.parentElement?.querySelector(".ql-attachment");
      if (boutonPieceJointe) {
        boutonPieceJointe.innerHTML = "📎";
        boutonPieceJointe.setAttribute("title", "Joindre un fichier (PDF, Word)");
      }
      quill.root.innerHTML = valeurInitiale;
      quill.on("text-change", () => onChangeRef.current(quill.root.innerHTML));
      quill.on("selection-change", (range) => {
        if (range === null) onBlurRef.current();
      });
    });

    return () => {
      annule = true;
    };
    // valeurInitiale/accept volontairement absents des deps : ne servent
    // qu'à initialiser l'éditeur au montage, qui reste ensuite seul maître
    // de son contenu (comme un <input defaultValue>) — le refaire à chaque
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
