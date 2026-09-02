"use client";

import { useRef } from "react";

const PLACEHOLDERS = ["#Prénom", "#Nom"] as const;

// Textarea avec des boutons "publipostage" au-dessus qui insèrent un
// placeholder à la position du curseur (remplacé par le prénom/nom réel du
// destinataire au moment de l'envoi, voir src/lib/modelesEmail.ts).
export function PlaceholderTextarea({
  label,
  value,
  onChange,
  aide,
  actif,
  onActifChange,
}: {
  label: string;
  value: string;
  onChange: (valeur: string) => void;
  aide?: string;
  actif?: boolean;
  onActifChange?: (actif: boolean) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const desactive = actif === false;

  function inserer(placeholder: string) {
    const textarea = ref.current;
    if (!textarea) {
      onChange(value + placeholder);
      return;
    }
    const debut = textarea.selectionStart ?? value.length;
    const fin = textarea.selectionEnd ?? value.length;
    const nouvelleValeur = value.slice(0, debut) + placeholder + value.slice(fin);
    onChange(nouvelleValeur);

    const position = debut + placeholder.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(position, position);
    });
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <label>{label}</label>
        {onActifChange && (
          <label style={{ fontWeight: "normal", display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={actif ?? true}
              onChange={(e) => onActifChange(e.target.checked)}
            />
            Envoyer cet email
          </label>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, margin: "4px 0" }}>
        {PLACEHOLDERS.map((placeholder) => (
          <button
            key={placeholder}
            type="button"
            className="discret"
            disabled={desactive}
            onClick={() => inserer(placeholder)}
          >
            {placeholder}
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        disabled={desactive}
        style={{ width: "100%", resize: "vertical", opacity: desactive ? 0.5 : 1 }}
      />
      {aide && (
        <p style={{ color: "#777", fontSize: "0.9rem" }}>{aide}</p>
      )}
    </div>
  );
}
