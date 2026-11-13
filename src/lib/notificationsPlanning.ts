import { prisma } from "@/lib/prisma";
import { envoyerEmailConvocationKholle, envoyerEmailGrillesValidees, envoyerEmailPublicationPlanning } from "@/lib/email";
import { compterGrillesNonValidees } from "@/lib/sessionValidation";

// Partagé entre la publication initiale (/api/admin/planification/
// [classeId]/[semaine]/publier) et les deux boutons de renvoi manuel de
// l'écran de relecture (renvoyer-planning-kholleurs / renvoyer-convocations-
// eleves) : même requête, même regroupement, pour ne jamais diverger entre
// le premier envoi et un renvoi ultérieur.
async function chargerCreneaux(sessionIds: string[]) {
  return prisma.creneau.findMany({
    where: { sessionKholleId: { in: sessionIds } },
    include: {
      kholleur: true,
      salle: true,
      sessionKholle: { include: { discipline: true, classe: true } },
      passages: { include: { eleve: { include: { utilisateur: true } } } },
    },
    orderBy: [{ date: "asc" }, { heureDebut: "asc" }],
  });
}

// Kholleurs concernés par `sessionIds`, pour la fenêtre de sélection des
// destinataires avant un renvoi manuel (voir RenvoiAvecSelectionModal) — un
// par kholleur distinct, pas un par créneau.
export async function listerDestinatairesKholleurs(sessionIds: string[]): Promise<{ id: string; nom: string }[]> {
  const creneaux = await chargerCreneaux(sessionIds);
  const kholleurs = new Map<string, string>();
  for (const c of creneaux) {
    kholleurs.set(c.kholleurId, `${c.kholleur.prenom} ${c.kholleur.nom}`);
  }
  return [...kholleurs.entries()].map(([id, nom]) => ({ id, nom })).sort((a, b) => a.nom.localeCompare(b.nom));
}

// Envoie à chaque kholleur concerné le récapitulatif de ses créneaux parmi
// `sessionIds`. Respecte ParametresApplication.envoiEmailKholleur (false =
// n'envoie rien, retourne 0). `kholleurIds`, si fourni, restreint l'envoi à
// ces seuls kholleurs (renvoi manuel ciblé — voir
// renvoyer-planning-kholleurs/route.ts) ; omis = tous les kholleurs
// concernés, comportement historique inchangé (publication initiale).
// Retourne le nombre de kholleurs notifiés.
export async function envoyerEmailsPlanningKholleurs(
  sessionIds: string[],
  semaine: number,
  kholleurIds?: string[]
): Promise<number> {
  const parametres = await prisma.parametresApplication.findUnique({ where: { id: "singleton" } });
  if (parametres?.envoiEmailKholleur === false) return 0;

  const filtre = kholleurIds ? new Set(kholleurIds) : null;
  const creneaux = await chargerCreneaux(sessionIds);
  const creneauxParKholleur = new Map<string, typeof creneaux>();
  for (const c of creneaux) {
    if (filtre && !filtre.has(c.kholleurId)) continue;
    const liste = creneauxParKholleur.get(c.kholleurId) ?? [];
    liste.push(c);
    creneauxParKholleur.set(c.kholleurId, liste);
  }

  await Promise.allSettled(
    [...creneauxParKholleur.values()].map((creneauxKholleur) => {
      const kholleur = creneauxKholleur[0].kholleur;
      const classeNom = creneauxKholleur[0].sessionKholle.classe.nom;
      return envoyerEmailPublicationPlanning({
        destinataire: kholleur.email,
        nomKholleur: kholleur.nom,
        prenomKholleur: kholleur.prenom,
        classeNom,
        semaine,
        corpsPersonnalise: parametres?.modeleEmailKholleur,
        creneaux: creneauxKholleur.map((c) => ({
          date: c.date,
          heureDebut: c.heureDebut,
          heureFin: c.heureFin,
          disciplineNom: c.sessionKholle.discipline.nom,
          salleNom: c.salle.nom,
          eleves: c.passages.map((p) => `${p.eleve.prenom} ${p.eleve.nom}`),
        })),
      });
    })
  );

  return creneauxParKholleur.size;
}

// Élèves concernés par `sessionIds` (compte de connexion requis), pour la
// fenêtre de sélection des destinataires avant un renvoi manuel — un par
// élève distinct, pas un par créneau.
export async function listerDestinatairesEleves(sessionIds: string[]): Promise<{ id: string; nom: string }[]> {
  const creneaux = await chargerCreneaux(sessionIds);
  const eleves = new Map<string, string>();
  for (const c of creneaux) {
    for (const p of c.passages) {
      if (!p.eleve.utilisateur) continue;
      eleves.set(p.eleveId, `${p.eleve.prenom} ${p.eleve.nom}`);
    }
  }
  return [...eleves.entries()].map(([id, nom]) => ({ id, nom })).sort((a, b) => a.nom.localeCompare(b.nom));
}

// Envoie à chaque élève concerné (compte de connexion requis) sa convocation
// pour l'ensemble de ses créneaux parmi `sessionIds`. Respecte
// ParametresApplication.envoiEmailConvocation (false = n'envoie rien,
// retourne 0) — PAS envoiEmailEleve, qui ne gouverne que l'email "note
// disponible" (distinct de la convocation, voir le commentaire sur ce champ
// dans schema.prisma). `eleveIds`, si fourni, restreint l'envoi à ces seuls
// élèves (renvoi manuel ciblé) ; omis = tous les élèves concernés,
// comportement historique inchangé (publication initiale). Retourne le
// nombre d'élèves notifiés.
export async function envoyerEmailsConvocationsEleves(
  sessionIds: string[],
  semaine: number,
  eleveIds?: string[]
): Promise<number> {
  const parametres = await prisma.parametresApplication.findUnique({ where: { id: "singleton" } });
  if (parametres?.envoiEmailConvocation === false) return 0;

  const filtre = eleveIds ? new Set(eleveIds) : null;
  const creneaux = await chargerCreneaux(sessionIds);
  const creneauxParEleve = new Map<
    string,
    { nom: string; prenom: string; email: string; creneaux: typeof creneaux }
  >();
  for (const c of creneaux) {
    for (const p of c.passages) {
      if (!p.eleve.utilisateur) continue;
      if (filtre && !filtre.has(p.eleveId)) continue;
      const entree = creneauxParEleve.get(p.eleveId) ?? {
        nom: p.eleve.nom,
        prenom: p.eleve.prenom,
        email: p.eleve.utilisateur.email,
        creneaux: [],
      };
      entree.creneaux.push(c);
      creneauxParEleve.set(p.eleveId, entree);
    }
  }

  await Promise.allSettled(
    [...creneauxParEleve.values()].map((eleve) =>
      envoyerEmailConvocationKholle({
        destinataire: eleve.email,
        nomEleve: eleve.nom,
        prenomEleve: eleve.prenom,
        classeNom: eleve.creneaux[0].sessionKholle.classe.nom,
        semaine,
        creneaux: eleve.creneaux.map((c) => ({
          date: c.date,
          heureDebutPreparation: c.heureDebutPreparation,
          heureDebut: c.heureDebut,
          heureFin: c.heureFin,
          disciplineNom: c.sessionKholle.discipline.nom,
          salleNom: c.salle.nom,
          kholleurNom: `${c.kholleur.prenom} ${c.kholleur.nom}`,
        })),
      })
    )
  );

  return creneauxParEleve.size;
}

// Renvoie aux professeurs référents concernés l'email "grilles validées,
// vous pouvez valider la session" — même email et mêmes destinataires
// (TOUS les référents du vivier ProfesseurReferent de la (classe,
// discipline), pas seulement le referentId choisi pour cette semaine) que
// /api/kholleur/sessions/[sessionId]/valider, qui l'envoie normalement au
// moment où le dernier kholleur valide sa grille. Ne renvoie que pour les
// sessions parmi `sessionIds` qui sont encore réellement "en attente de
// validation référent" (pas déjà clôturées, et grilles kholleur déjà
// toutes validées) — sans ça, le référent recevrait une invitation à
// valider alors qu'il ne le peut pas encore (ou plus). Respecte
// ParametresApplication.envoiEmailReferent (false = n'envoie rien, retourne
// 0). Retourne le nombre de (session, référent) notifiés.
export async function envoyerEmailsValidationReferents(sessionIds: string[]): Promise<number> {
  const parametres = await prisma.parametresApplication.findUnique({ where: { id: "singleton" } });
  if (parametres?.envoiEmailReferent === false) return 0;

  const sessions = await prisma.sessionKholle.findMany({
    where: { id: { in: sessionIds }, statut: { not: "CLOTUREE" } },
    include: { classe: true, discipline: true },
  });

  let nbNotifies = 0;
  await Promise.allSettled(
    sessions.map(async (session) => {
      const grillesNonValidees = await compterGrillesNonValidees(session.id);
      if (grillesNonValidees > 0) return;

      const referents = await prisma.professeurReferent.findMany({
        where: { classeId: session.classeId, disciplineId: session.disciplineId },
        include: { utilisateur: true },
      });

      await Promise.allSettled(
        referents.map((referent) => {
          nbNotifies++;
          return envoyerEmailGrillesValidees({
            destinataire: referent.utilisateur.email,
            nomReferent: referent.utilisateur.nom,
            prenomReferent: referent.utilisateur.prenom,
            classeNom: session.classe.nom,
            disciplineNom: session.discipline.nom,
            semaine: session.semaine,
            corpsPersonnalise: parametres?.modeleEmailReferent,
          });
        })
      );
    })
  );

  return nbNotifies;
}
