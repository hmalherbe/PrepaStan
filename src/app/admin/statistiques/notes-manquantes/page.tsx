import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Compteur = { manquants: number; total: number };

function tauxManquant(c: Compteur): number {
  return c.total > 0 ? (c.manquants / c.total) * 100 : 0;
}

function ajouter(map: Map<string, Compteur>, cle: string, manquant: boolean) {
  const entree = map.get(cle) ?? { manquants: 0, total: 0 };
  entree.total += 1;
  if (manquant) entree.manquants += 1;
  map.set(cle, entree);
}

export default async function NotesManquantesPage() {
  await requirePageSession(["ADMIN"]);

  // Même périmètre que /admin/suivi : sessions encore ouvertes (publiées,
  // pas encore clôturées) — une session déjà CLOTUREE ne devrait plus avoir
  // de note manquante (le référent n'a pu la clôturer qu'une fois toutes
  // les grilles validées, voir compterGrillesNonValidees), donc l'inclure
  // ne ferait qu'ajouter du bruit à 0%.
  const sessions = await prisma.sessionKholle.findMany({
    where: { statut: { in: ["PLANIFIEE", "EN_COURS"] } },
    select: {
      classe: { select: { nom: true } },
      discipline: { select: { nom: true } },
      creneaux: {
        select: {
          passages: {
            select: { note: { select: { valeur: true, absent: true, appreciation: true } } },
          },
        },
      },
    },
  });

  const parClasse = new Map<string, Compteur>();
  const parDiscipline = new Map<string, Compteur>();

  for (const s of sessions) {
    for (const c of s.creneaux) {
      for (const p of c.passages) {
        // Absent : ni note ni appréciation requise (voir GrilleForm.tsx) —
        // exclu du dénominateur, pas seulement du numérateur, sinon un
        // groupe avec beaucoup d'absents afficherait un taux de manquant
        // artificiellement bas.
        if (p.note?.absent) continue;
        const manquant = p.note?.valeur == null || !p.note?.appreciation;
        ajouter(parClasse, s.classe.nom, manquant);
        ajouter(parDiscipline, s.discipline.nom, manquant);
      }
    }
  }

  const lignesClasse = [...parClasse.entries()]
    .map(([nom, c]) => ({ nom, taux: tauxManquant(c), ...c }))
    .sort((a, b) => b.taux - a.taux);
  const lignesDiscipline = [...parDiscipline.entries()]
    .map(([nom, c]) => ({ nom, taux: tauxManquant(c), ...c }))
    .sort((a, b) => b.taux - a.taux);

  function Barres({ lignes }: { lignes: { nom: string; taux: number; manquants: number; total: number }[] }) {
    if (lignes.length === 0) return <p>Aucune session ouverte pour le moment.</p>;
    return (
      <div className="graphique-barres">
        {lignes.map((l) => (
          <div className="barre-ligne" key={l.nom}>
            <span title={l.nom}>{l.nom}</span>
            <div className="barre-piste">
              <div className="barre-remplissage" style={{ width: `${Math.max(l.taux, l.taux > 0 ? 2 : 0)}%` }} />
            </div>
            <span className="barre-valeur">
              {l.taux.toFixed(0)}% ({l.manquants}/{l.total})
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <main className="container">
      <h1>Taux de notes/appréciations manquantes</h1>
      <p style={{ color: "#777", fontSize: "0.9rem" }}>
        Parmi les sessions encore ouvertes (publiées, pas encore clôturées), part des passages non absents pour
        lesquels la note ou l&apos;appréciation (ou les deux) reste à saisir — le même repère que la mise en
        évidence en rouge sur les grilles individuelles, mais agrégé par classe et par discipline pour voir d&apos;un
        coup d&apos;œil où ça traîne le plus.
      </p>

      <h2>Par classe</h2>
      <Barres lignes={lignesClasse} />

      <h2>Par discipline</h2>
      <Barres lignes={lignesDiscipline} />
    </main>
  );
}
