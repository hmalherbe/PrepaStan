"use client";

import { useEffect, useRef } from "react";

type Commande = "bold" | "italic" | "insertUnorderedList" | "insertOrderedList";

const BOUTONS: { commande: Commande; label: string; titre: string }[] = [
  { commande: "bold", label: "G", titre: "Gras" },
  { commande: "italic", label: "I", titre: "Italique" },
  { commande: "insertUnorderedList", label: "•", titre: "Liste à puces" },
  { commande: "insertOrderedList", label: "1.", titre: "Liste numérotée" },
];

// Une appréciation "vide" côté éditeur riche n'est pas forcément la chaîne
// vide : le navigateur laisse parfois une balise résiduelle (ex. <br>) une
// fois tout le texte effacé. Utilisé pour la validation (toutes les
// appréciations saisies) et pour ne pas enregistrer un HTML vide en base.
export function estAppreciationVide(html: string): boolean {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim() === "";
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    // Ne resynchronise l'innerHTML depuis la prop que si elle diffère
    // réellement du contenu affiché et que l'utilisateur n'est pas en train
    // d'y taper — sinon le curseur sauterait à chaque frappe (la prop est
    // remise à jour par notre propre onInput ci-dessous, donc déjà à jour
    // la plupart du temps ; ce cas ne sert qu'au montage initial et aux
    // changements venus d'ailleurs).
    if (el && document.activeElement !== el && el.innerHTML !== value) {
      el.innerHTML = value;
    }
  }, [value]);

  function executer(commande: Commande) {
    ref.current?.focus();
    document.execCommand(commande);
    onChange(ref.current?.innerHTML ?? "");
  }

  return (
    <div>
      {!disabled && (
        <div className="editeur-riche-barre">
          {BOUTONS.map((b) => (
            <button
              key={b.commande}
              type="button"
              className="editeur-riche-bouton"
              title={b.titre}
              // Empêche le bouton de voler le focus (et donc la sélection en
              // cours dans la zone éditable) avant que la commande ne s'exécute.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => executer(b.commande)}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
      <div
        ref={ref}
        className="editeur-riche-zone"
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={() => onChange(ref.current?.innerHTML ?? "")}
        onBlur={onBlur}
      />
    </div>
  );
}
