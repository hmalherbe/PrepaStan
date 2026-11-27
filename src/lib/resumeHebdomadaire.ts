import { prisma } from "@/lib/prisma";
import { dateDuJourParis, heureActuelleParis } from "@/lib/dateParis";
import { envoyerEmailResumeHebdomadaire } from "@/lib/email";

const JOUR_MS = 24 * 60 * 60 * 1000;

// Envoie le digest hebdomadaire une seule fois par semaine, chaque lundi à
// partir de 8h (heure de Paris) — même principe de garde-fou "déjà envoyé"
// que les rappels dans rappelsNotation.ts : vérifiée périodiquement depuis
// src/instrumentation.ts, donc pas besoin de tomber pile sur 8h00, juste
// après. "La semaine écoulée" = les 7 jours qui précèdent ce lundi (du
// lundi précédent 00h00 à ce lundi 00h00, heure de Paris), jamais le
// lendemain d'un jour précis vu qu'aucune donnée n'a d'horodatage de
// "publication" dédié (voir SessionKholle, sans createdAt) : seules les
// dates réellement disponibles (ValidationGrille/ValidationReferent.
// dateValidation, EchecEnvoiEmail.dateEnvoi) alimentent ce résumé.
export async function envoyerResumeHebdomadaireSiNecessaire(): Promise<{ envoye: boolean }> {
  const maintenant = new Date();
  // Minuit UTC du jour calendaire parisien — même convention que
  // Creneau.date, pratique ici pour que getUTCDay() reflète fidèlement le
  // jour de la semaine côté Paris sans ambiguïté de fuseau.
  const aujourdhui = dateDuJourParis(maintenant);
  const estLundi = aujourdhui.getUTCDay() === 1;
  if (!estLundi || heureActuelleParis(maintenant) < 8) return { envoye: false };

  const dejaEnvoye = await prisma.resumeHebdoEnvoye.findUnique({ where: { semaineDebut: aujourdhui } });
  if (dejaEnvoye) return { envoye: false };

  const debutPeriode = new Date(aujourdhui.getTime() - 7 * JOUR_MS);

  const [cloturesSemaine, validationsSemaine, echecsSemaine, sessionsBloquees] = await Promise.all([
    prisma.validationReferent.count({
      where: { statut: "VALIDE", dateValidation: { gte: debutPeriode, lt: aujourdhui } },
    }),
    prisma.validationGrille.count({
      where: { statut: "VALIDE", dateValidation: { gte: debutPeriode, lt: aujourdhui } },
    }),
    prisma.echecEnvoiEmail.count({ where: { dateEnvoi: { gte: debutPeriode, lt: aujourdhui } } }),
    // Même filtre que /admin/suivi : état ACTUEL (pas limité à la semaine
    // écoulée), une session bloquée depuis avant restant pertinente.
    prisma.sessionKholle.findMany({
      where: { statut: { in: ["PLANIFIEE", "EN_COURS"] } },
      select: {
        semaine: true,
        dateDebut: true,
        classe: { select: { nom: true } },
        discipline: { select: { nom: true } },
      },
      orderBy: { dateDebut: "asc" },
    }),
  ]);

  const plusAncienne = sessionsBloquees[0];

  await envoyerEmailResumeHebdomadaire({
    cloturesSemaine,
    validationsSemaine,
    echecsSemaine,
    nombreSessionsBloquees: sessionsBloquees.length,
    plusAncienne: plusAncienne
      ? {
          classeNom: plusAncienne.classe.nom,
          disciplineNom: plusAncienne.discipline.nom,
          semaine: plusAncienne.semaine,
          jours: Math.floor((maintenant.getTime() - plusAncienne.dateDebut.getTime()) / JOUR_MS),
        }
      : null,
  });

  await prisma.resumeHebdoEnvoye.create({ data: { semaineDebut: aujourdhui } });

  return { envoye: true };
}
