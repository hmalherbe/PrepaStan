import { prisma } from "@/lib/prisma";
import { envoyerEmailGrillesValidees, envoyerEmailInvitationNotationJourMeme } from "@/lib/email";
import { compterGrillesNonValidees } from "@/lib/sessionValidation";

// "Aujourd'hui" en heure de Paris, sous la forme d'une Date à minuit UTC —
// même convention que Creneau.date (un jour calendaire, pas un horodatage).
// Toujours appelée après 9h (voir juste en dessous), donc jamais près d'un
// changement de jour UTC ambigu pour la France.
function dateDuJourParis(maintenant: Date): Date {
  const [annee, mois, jour] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" })
    .format(maintenant)
    .split("-")
    .map(Number);
  return new Date(Date.UTC(annee, mois - 1, jour));
}

// Invite chaque kholleur qui khôlle aujourd'hui (créneau du jour même) à
// saisir notes et appréciations une fois sa khôlle terminée — un seul email
// par kholleur même s'il khôlle plusieurs fois dans la journée, envoyé une
// seule fois par jour (voir RappelJourMemeEnvoye), jamais avant 9h heure de
// Paris. Appelée périodiquement depuis src/instrumentation.ts : comme la
// vérification peut tomber n'importe quand après 9h (pas pile à l'heure),
// c'est le garde-fou "déjà envoyé aujourd'hui" qui assure l'envoi une
// seule fois, pas l'heure exacte de l'appel. Remplace l'ancien rappel
// "vous n'avez toujours pas saisi vos notes" envoyé après coup (délai
// configurable) : voir RappelJourMemeEnvoye dans schema.prisma.
export async function envoyerInvitationsJourMemeEnAttente(): Promise<{ envoyes: number }> {
  const maintenant = new Date();
  const heureParis = Number(
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(maintenant)
  );
  if (heureParis < 9) return { envoyes: 0 };

  const aujourdhui = dateDuJourParis(maintenant);

  const creneaux = await prisma.creneau.findMany({
    where: {
      date: aujourdhui,
      sessionKholle: { statut: { in: ["PLANIFIEE", "EN_COURS"] } },
    },
    select: {
      kholleurId: true,
      kholleur: { select: { email: true, nom: true, prenom: true } },
      heureDebut: true,
      heureFin: true,
      salle: { select: { nom: true } },
      passages: { select: { eleve: { select: { nom: true, prenom: true } } } },
      sessionKholle: { select: { discipline: { select: { nom: true } } } },
    },
    orderBy: [{ heureDebut: "asc" }],
  });

  const creneauxParKholleur = new Map<string, typeof creneaux>();
  for (const c of creneaux) {
    const liste = creneauxParKholleur.get(c.kholleurId) ?? [];
    liste.push(c);
    creneauxParKholleur.set(c.kholleurId, liste);
  }

  let envoyes = 0;
  for (const [kholleurId, liste] of creneauxParKholleur) {
    const dejaEnvoye = await prisma.rappelJourMemeEnvoye.findUnique({
      where: { kholleurId_date: { kholleurId, date: aujourdhui } },
    });
    if (dejaEnvoye) continue; // déjà envoyé aujourd'hui

    await envoyerEmailInvitationNotationJourMeme({
      destinataire: liste[0].kholleur.email,
      nomKholleur: `${liste[0].kholleur.prenom} ${liste[0].kholleur.nom}`,
      creneaux: liste.map((c) => ({
        date: aujourdhui,
        heureDebut: c.heureDebut,
        heureFin: c.heureFin,
        disciplineNom: c.sessionKholle.discipline.nom,
        salleNom: c.salle.nom,
        eleves: c.passages.map((p) => `${p.eleve.prenom} ${p.eleve.nom}`),
      })),
    });
    await prisma.rappelJourMemeEnvoye.create({ data: { kholleurId, date: aujourdhui } });
    envoyes++;
  }

  return { envoyes };
}

// Équivalent conceptuel de envoyerInvitationsJourMemeEnAttente ci-dessus,
// mais côté professeur référent : relance par email chaque référent (TOUS
// ceux du vivier ProfesseurReferent de la discipline, pas seulement celui
// en vigueur cette semaine-là — même règle que /api/kholleur/sessions/
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
