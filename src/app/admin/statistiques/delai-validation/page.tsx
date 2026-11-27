import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function moyenne(vs: number[]): number {
  return vs.reduce((a, b) => a + b, 0) / (vs.length || 1);
}

// Délai en jours entre la fin des khôlles d'un kholleur pour une session
// (son dernier créneau, pas le premier : il ne peut raisonnablement valider
// avant d'avoir terminé) et sa validation de grille. Négatif en théorie
// impossible (on ne peut pas valider avant d'avoir khôllé), mais ramené à 0
// par sécurité plutôt que de fausser une moyenne avec une valeur négative,
// au cas où une correction manuelle de date en base produirait ce cas.
function joursEntre(debut: Date, fin: Date): number {
  return Math.max(0, (fin.getTime() - debut.getTime()) / (24 * 60 * 60 * 1000));
}

export default async function DelaiValidationPage() {
  await requirePageSession(["ADMIN"]);

  const validations = await prisma.validationGrille.findMany({
    where: { statut: "VALIDE", dateValidation: { not: null } },
    select: { kholleurId: true, sessionKholleId: true, dateValidation: true },
  });

  // ValidationGrille.kholleurId n'a pas de relation Prisma vers Utilisateur
  // (simple champ, voir schema.prisma) : les noms se récupèrent à part.
  const kholleurIds = [...new Set(validations.map((v) => v.kholleurId))];
  const kholleurs = await prisma.utilisateur.findMany({
    where: { id: { in: kholleurIds } },
    select: { id: true, nom: true, prenom: true },
  });
  const nomKholleur = new Map(kholleurs.map((k) => [k.id, `${k.prenom} ${k.nom}`]));

  const sessionIds = [...new Set(validations.map((v) => v.sessionKholleId))];
  const creneaux = await prisma.creneau.findMany({
    where: { sessionKholleId: { in: sessionIds } },
    select: { sessionKholleId: true, kholleurId: true, date: true },
  });

  // Dernier créneau (date la plus tardive) de CE kholleur dans CETTE
  // session précise — une session peut s'étaler sur plusieurs jours, et un
  // kholleur ne peut pas valider sa grille avant d'avoir terminé tous ses
  // passages de la semaine.
  const dernierCreneau = new Map<string, Date>();
  for (const c of creneaux) {
    const cle = `${c.sessionKholleId}|${c.kholleurId}`;
    const existant = dernierCreneau.get(cle);
    if (!existant || c.date > existant) dernierCreneau.set(cle, c.date);
  }

  const parKholleur = new Map<string, { nom: string; delais: number[] }>();
  for (const v of validations) {
    const cle = `${v.sessionKholleId}|${v.kholleurId}`;
    const fin = dernierCreneau.get(cle);
    // Pas de créneau retrouvé (ne devrait pas arriver) : ignoré plutôt que
    // de fausser la moyenne avec une donnée incomplète.
    if (!fin) continue;

    const entree = parKholleur.get(v.kholleurId) ?? {
      nom: nomKholleur.get(v.kholleurId) ?? v.kholleurId,
      delais: [],
    };
    entree.delais.push(joursEntre(fin, v.dateValidation!));
    parKholleur.set(v.kholleurId, entree);
  }

  const lignes = [...parKholleur.values()]
    .map((k) => ({
      nom: k.nom,
      moyenne: moyenne(k.delais),
      min: Math.min(...k.delais),
      max: Math.max(...k.delais),
      nbValidations: k.delais.length,
    }))
    .sort((a, b) => b.moyenne - a.moyenne);

  return (
    <main className="container">
      <h1>Délai de validation par khôlleur</h1>
      <p style={{ color: "#777", fontSize: "0.9rem" }}>
        Toutes classes et disciplines confondues, triés du délai moyen le plus long au plus court : nombre de
        jours écoulés entre la fin des khôlles d&apos;une session (son dernier créneau, pas le premier) et la
        validation de la grille par le khôlleur — utile pour repérer qui traîne habituellement à saisir ses
        notes, au-delà d&apos;un simple retard ponctuel déjà visible sur l&apos;écran Suivi.
      </p>
      {lignes.length === 0 ? (
        <p>Aucune grille validée pour le moment.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Khôlleur</th>
              <th>Délai moyen</th>
              <th>Délai min</th>
              <th>Délai max</th>
              <th>Nombre de validations</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.nom}>
                <td>{l.nom}</td>
                <td>{l.moyenne.toFixed(1)} jour(s)</td>
                <td>{l.min.toFixed(1)} jour(s)</td>
                <td>{l.max.toFixed(1)} jour(s)</td>
                <td>{l.nbValidations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
