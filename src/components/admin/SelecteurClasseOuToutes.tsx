"use client";

import { useRouter } from "next/navigation";

export function SelecteurClasseOuToutes({
  classes,
  // "" = toutes les classes confondues (pas de filtre).
  classeIdActuelle,
  basePath,
}: {
  classes: { id: string; nom: string }[];
  classeIdActuelle: string;
  basePath: string;
}) {
  const router = useRouter();

  return (
    <label>
      Classe
      <select
        value={classeIdActuelle}
        onChange={(e) => router.push(e.target.value ? `${basePath}?classeId=${e.target.value}` : basePath)}
      >
        <option value="">Toutes les classes</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom}
          </option>
        ))}
      </select>
    </label>
  );
}
