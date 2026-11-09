import { prisma } from "@/lib/prisma";
import { envoyerEmailGrillesValidees, envoyerEmailRappelNotation } from "@/lib/email";
import { compterGrillesNonValidees } from "@/lib/sessionValidation";

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

// Équivalent de envoyerRappelsNotationEnAttente ci-dessus, mais côté
// professeur référent : relance par email chaque référent (TOUS ceux du
// vivier ProfesseurReferent de la discipline, pas seulement celui en
// vigueur cette semaine-là — même règle que /api/kholleur/sessions/
// [sessionId]/valider) dont la session a toutes ses grilles kholleur déjà
// validées, mais qui ne l'a toujours pas validée lui-même — au plus une
// fois par (session, référent), passé le même délai configuré dans
// Paramètres (ParametresApplication.delaiEnvoiMailsNotationJours, partagé
// avec le rappel kholleur ci-dessus plutôt que dupliqué). Appelé
// périodiquement depuis src/instrumentation.ts. Respecte
// ParametresApplication.envoiEmailReferent, comme l'envoi "spontané"
// déclenché à la dernière validation de grille.
export async function envoyerRappelsValidationReferentEnAttente(): Promise<{ envoyes: number }> {
  const parametres = await prisma.parametresApplication.findUnique({ where: { id: "singleton" } });
  if (parametres?.envoiEmailReferent === false) return { envoyes: 0 };
  const delaiJours = parametres?.delaiEnvoiMailsNotationJours ?? 0;

  const dateLimite = new Date();
  dateLimite.setDate(dateLimite.getDate() - delaiJours);

  const creneaux = await prisma.creneau.findMany({
    where: {
      date: { lte: dateLimite },
      sessionKholle: { statut: { in: ["PLANIFIEE", "EN_COURS"] } },
    },
    select: {
      sessionKholle: {
        select: {
          id: true,
          classeId: true,
          disciplineId: true,
          semaine: true,
          classe: { select: { nom: true } },
          discipline: { select: { nom: true } },
        },
      },
    },
  });

  // sessionKholleId unique concernées par au moins un créneau passé.
  const sessions = new Map<string, (typeof creneaux)[number]["sessionKholle"]>();
  for (const c of creneaux) {
    sessions.set(c.sessionKholle.id, c.sessionKholle);
  }

  let envoyes = 0;
  for (const session of sessions.values()) {
    const grillesNonValidees = await compterGrillesNonValidees(session.id);
    if (grillesNonValidees > 0) continue; // le référent ne peut de toute façon pas encore valider

    const referents = await prisma.professeurReferent.findMany({
      where: { classeId: session.classeId, disciplineId: session.disciplineId },
      include: { utilisateur: true },
    });

    for (const referent of referents) {
      const dejaEnvoye = await prisma.rappelValidationReferentEnvoye.findUnique({
        where: {
          sessionKholleId_referentId: { sessionKholleId: session.id, referentId: referent.utilisateurId },
        },
      });
      if (dejaEnvoye) continue; // déjà relancé une fois pour cette session

      await envoyerEmailGrillesValidees({
        destinataire: referent.utilisateur.email,
        nomReferent: referent.utilisateur.nom,
        prenomReferent: referent.utilisateur.prenom,
        classeNom: session.classe.nom,
        disciplineNom: session.discipline.nom,
        semaine: session.semaine,
        corpsPersonnalise: parametres?.modeleEmailReferent,
      });
      await prisma.rappelValidationReferentEnvoye.create({
        data: { sessionKholleId: session.id, referentId: referent.utilisateurId },
      });
      envoyes++;
    }
  }

  return { envoyes };
}
