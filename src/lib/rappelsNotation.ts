import { prisma } from "@/lib/prisma";
import { envoyerEmailRappelNotation } from "@/lib/email";

// Parcourt les sessions déjà khôllées (créneau passé) mais pas encore
// entièrement validées, et relance par email chaque kholleur qui n'a pas
// encore validé sa grille — au plus une fois par (session, kholleur), passé
// le délai configuré dans Paramètres (ParametresApplication). Appelé
// périodiquement depuis src/instrumentation.ts.
export async function envoyerRappelsNotationEnAttente(): Promise<{ envoyes: number }> {
  const parametres = await prisma.parametresApplication.findUnique({ where: { id: "singleton" } });
  const delaiJours = parametres?.delaiEnvoiMailsNotationJours ?? 0;

  const dateLimite = new Date();
  dateLimite.setDate(dateLimite.getDate() - delaiJours);

  const creneaux = await prisma.creneau.findMany({
    where: {
      date: { lte: dateLimite },
      sessionKholle: { statut: { in: ["PLANIFIEE", "EN_COURS"] } },
    },
    select: {
      kholleurId: true,
      kholleur: { select: { email: true, nom: true, prenom: true } },
      sessionKholle: {
        select: {
          id: true,
          semaine: true,
          classe: { select: { nom: true } },
          discipline: { select: { nom: true } },
        },
      },
    },
  });

  // (sessionKholleId, kholleurId) uniques concernés par au moins un créneau passé.
  const paires = new Map<string, (typeof creneaux)[number]>();
  for (const c of creneaux) {
    paires.set(`${c.sessionKholle.id}|${c.kholleurId}`, c);
  }

  let envoyes = 0;
  for (const c of paires.values()) {
    const validation = await prisma.validationGrille.findUnique({
      where: { kholleurId_sessionKholleId: { kholleurId: c.kholleurId, sessionKholleId: c.sessionKholle.id } },
    });
    if (validation?.statut === "VALIDE") continue; // déjà fait

    const dejaEnvoye = await prisma.rappelNotationEnvoye.findUnique({
      where: { sessionKholleId_kholleurId: { sessionKholleId: c.sessionKholle.id, kholleurId: c.kholleurId } },
    });
    if (dejaEnvoye) continue; // déjà relancé une fois pour cette session

    await envoyerEmailRappelNotation({
      destinataire: c.kholleur.email,
      nomKholleur: `${c.kholleur.prenom} ${c.kholleur.nom}`,
      classeNom: c.sessionKholle.classe.nom,
      disciplineNom: c.sessionKholle.discipline.nom,
      semaine: c.sessionKholle.semaine,
    });
    await prisma.rappelNotationEnvoye.create({
      data: { sessionKholleId: c.sessionKholle.id, kholleurId: c.kholleurId },
    });
    envoyes++;
  }

  return { envoyes };
}
