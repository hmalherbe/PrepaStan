import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EvolutionActiviteChart } from "@/components/admin/EvolutionActiviteChart";

// Lundi (minuit UTC) de la semaine ISO contenant cette date — même
// convention que Creneau.date (minuit UTC du jour calendaire), pour
// regrouper des évènements réels (validations, notes saisies) par semaine
// sans ambiguïté de fuseau horaire.
function lundiDeLaSemaine(date: Date): Date {
  const jourISO = (date.getUTCDay() + 6) % 7; // lundi = 0 ... dimanche = 6
  const lundi = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  lundi.setUTCDate(lundi.getUTCDate() - jourISO);
  return lundi;
}

const JOUR_MS = 24 * 60 * 60 * 1000;

function compterParSemaine(dates: Date[]): Map<string, number> {
  const compteurs = new Map<string, number>();
  for (const d of dates) {
    const cle = lundiDeLaSemaine(d).toISOString().slice(0, 10);
    compteurs.set(cle, (compteurs.get(cle) ?? 0) + 1);
  }
  return compteurs;
}

// Construit une série continue (un point par semaine, zéro si rien ce
// jour-là) entre la plus ancienne et la plus récente semaine apparaissant
// dans L'UNE OU L'AUTRE série — un graphique en courbe avec des trous
// suggérerait à tort une interpolation entre deux semaines éloignées.
function serieContinue(compteurs: Map<string, number>, premiereSemaine: string, derniereSemaine: string) {
  const points: { semaine: string; valeur: number }[] = [];
  let curseur = new Date(`${premiereSemaine}T00:00:00.000Z`);
  const fin = new Date(`${derniereSemaine}T00:00:00.000Z`);
  while (curseur.getTime() <= fin.getTime()) {
    const cle = curseur.toISOString().slice(0, 10);
    points.push({ semaine: cle, valeur: compteurs.get(cle) ?? 0 });
    curseur = new Date(curseur.getTime() + 7 * JOUR_MS);
  }
  return points;
}

export default async function EvolutionActivitePage({
  searchParams,
}: {
  searchParams: Promise<{ classeId?: string }>;
}) {
  await requirePageSession(["ADMIN"]);
  const { classeId } = await searchParams;

  const [classes, validationsReferent, notes] = await Promise.all([
    prisma.classe.findMany({ orderBy: { nom: "asc" } }),
    prisma.validationReferent.findMany({
      where: {
        statut: "VALIDE",
        dateValidation: { not: null },
        ...(classeId ? { sessionKholle: { classeId } } : {}),
      },
      select: { dateValidation: true },
    }),
    prisma.note.findMany({
      where: {
        dateSaisie: { not: null },
        ...(classeId ? { passage: { creneau: { sessionKholle: { classeId } } } } : {}),
      },
      select: { dateSaisie: true },
    }),
  ]);

  const clotures = compterParSemaine(validationsReferent.map((v) => v.dateValidation!));
  const notesSaisies = compterParSemaine(notes.map((n) => n.dateSaisie!));
  const toutesCles = [...clotures.keys(), ...notesSaisies.keys()];

  const sousTitre = classeId
    ? "Semaine par semaine, pour cette classe — complète le Suivi (qui montre l'état actuel) avec une vue de la tendance dans le temps."
    : "Toutes classes confondues, semaine par semaine — complète le Suivi (qui montre l'état actuel) avec une vue de la tendance dans le temps.";

  return (
    <main className="container">
      <h1>Évolution de l&apos;activité</h1>
      <p style={{ color: "#777", fontSize: "0.9rem", marginTop: -8 }}>{sousTitre}</p>

      {toutesCles.length === 0 ? (
        <>
          <EvolutionActiviteChart
            classes={classes.map((c) => ({ id: c.id, nom: c.nom }))}
            classeIdActuelle={classeId ?? ""}
            cloturesParSemaine={[]}
            notesSaisiesParSemaine={[]}
          />
          <p>Pas encore de données pour ce filtre (aucune session clôturée ni note saisie).</p>
        </>
      ) : (
        (() => {
          const premiereSemaine = toutesCles.reduce((a, b) => (a < b ? a : b));
          const derniereSemaine = toutesCles.reduce((a, b) => (a > b ? a : b));
          return (
            <EvolutionActiviteChart
              classes={classes.map((c) => ({ id: c.id, nom: c.nom }))}
              classeIdActuelle={classeId ?? ""}
              cloturesParSemaine={serieContinue(clotures, premiereSemaine, derniereSemaine)}
              notesSaisiesParSemaine={serieContinue(notesSaisies, premiereSemaine, derniereSemaine)}
            />
          );
        })()
      )}
    </main>
  );
}
