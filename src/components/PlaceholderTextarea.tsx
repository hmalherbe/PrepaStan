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
}: {
  label: string;
  value: string;
  onChange: (valeur: string) => void;
  aide?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

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
      <label>{label}</label>
      <div style={{ display: "flex", gap: 8, margin: "4px 0" }}>
        {PLACEHOLDERS.map((placeholder) => (
          <button
            key={placeholder}
            type="button"
            className="discret"
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
        style={{ width: "100%", resize: "vertical" }}
      />
      {aide && (
        <p style={{ color: "#777", fontSize: "0.9rem" }}>{aide}</p>
      )}
    </div>
  );
}
