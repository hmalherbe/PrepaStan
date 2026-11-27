import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/StatusBadge";

// Au-delà de ce nombre de jours depuis le début de la semaine (dateDebut),
// une session encore non clôturée est mise en évidence (badge rouge plutôt
// qu'orange) : pas de notion de "retard" stockée en base (aucun horodatage
// de publication), dateDebut sert de repère le plus proche et le plus
// simple à expliquer à l'admin ("cette semaine-là date de...").
const SEUIL_JOURS_RETARD = 7;

function joursDepuis(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
}

// Correspond un par un aux valeurs `type` écrites par enregistrerEchecEnvoi
// dans src/lib/email.ts.
const LIBELLE_TYPE_EMAIL: Record<string, string> = {
  publication_planning: "Publication planning",
  reinitialisation_mot_de_passe: "Réinitialisation mot de passe",
  activation_compte: "Activation de compte",
  grilles_validees: "Grilles validées",
  note_disponible: "Note disponible",
  convocation: "Convocation",
  invitation_jour_meme: "Invitation jour même",
};

const NOMBRE_ECHECS_AFFICHES = 20;

export default async function SuiviPage() {
  await requirePageSession(["ADMIN"]);

  // PLANIFIEE/EN_COURS = publiée mais pas encore clôturée par le référent
  // (même convention que src/lib/rappelsNotation.ts) : une session CLOTUREE
  // n'a plus rien à attendre, une session PLANIFICATION n'a encore été
  // diffusée à personne — ni l'une ni l'autre n'a sa place dans un suivi de
  // ce qui est actuellement bloqué.
  const sessions = await prisma.sessionKholle.findMany({
    where: { statut: { in: ["PLANIFIEE", "EN_COURS"] } },
    include: {
      classe: { select: { nom: true } },
      discipline: { select: { nom: true } },
      referent: { select: { nom: true, prenom: true } },
      creneaux: {
        select: { kholleurId: true, kholleur: { select: { nom: true, prenom: true } } },
        distinct: ["kholleurId"],
      },
    },
    orderBy: [{ dateDebut: "asc" }],
  });

  const echecsEnvoi = await prisma.echecEnvoiEmail.findMany({
    orderBy: { dateEnvoi: "desc" },
    take: NOMBRE_ECHECS_AFFICHES,
  });

  const sessionIds = sessions.map((s) => s.id);
  const validations = await prisma.validationGrille.findMany({
    where: { sessionKholleId: { in: sessionIds }, statut: "VALIDE" },
    select: { sessionKholleId: true, kholleurId: true },
  });
  const valideSet = new Set(validations.map((v) => `${v.sessionKholleId}|${v.kholleurId}`));

  const lignes = sessions.map((s) => {
    const kholleurs = s.creneaux.map((c) => ({
      nom: `${c.kholleur.prenom} ${c.kholleur.nom}`,
      valide: valideSet.has(`${s.id}|${c.kholleurId}`),
    }));
    const kholleursEnAttente = kholleurs.filter((k) => !k.valide).map((k) => k.nom);
    return {
      id: s.id,
      classeNom: s.classe.nom,
      disciplineNom: s.discipline.nom,
      semaine: s.semaine,
      jours: joursDepuis(s.dateDebut),
      totalKholleurs: kholleurs.length,
      kholleursValides: kholleurs.length - kholleursEnAttente.length,
      kholleursEnAttente,
      referentNom: s.referent ? `${s.referent.prenom} ${s.referent.nom}` : null,
    };
  });

  return (
    <main className="container">
      <h1>Suivi des sessions</h1>
      <div className="carte">
        <p>
          Sessions publiées mais pas encore clôturées par le référent, triées des plus anciennes aux plus
          récentes — pour voir d&apos;un coup d&apos;œil où ça bloque et chez qui, sans avoir à ouvrir
          chaque session une par une.
        </p>
      </div>

      <table>
        <thead>
          <tr>
            <th>Semaine</th>
            <th>Classe</th>
            <th>Discipline</th>
            <th>Depuis</th>
            <th>Khôlleurs</th>
            <th>Référent</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.id}>
              <td>{l.semaine}</td>
              <td>{l.classeNom}</td>
              <td>{l.disciplineNom}</td>
              <td>
                <span className={`badge ${l.jours >= SEUIL_JOURS_RETARD ? "badge-erreur" : "badge-attente"}`}>
                  {l.jours} jour{l.jours !== 1 ? "s" : ""}
                </span>
              </td>
              <td>
                {l.kholleursEnAttente.length === 0 ? (
                  <StatusBadge statut="VALIDE" />
                ) : (
                  <>
                    <StatusBadge statut="EN_ATTENTE" />
                    <div style={{ marginTop: 4, fontSize: "0.85rem", color: "#777" }}>
                      {l.kholleursValides}/{l.totalKholleurs} — en attente de {l.kholleursEnAttente.join(", ")}
                    </div>
                  </>
                )}
              </td>
              <td>
                {l.kholleursEnAttente.length > 0 ? (
                  <span style={{ color: "#777", fontSize: "0.85rem" }}>— (khôlleurs d&apos;abord)</span>
                ) : !l.referentNom ? (
                  <span className="champ-erreur" style={{ fontSize: "0.85rem" }}>
                    Aucun référent assigné
                  </span>
                ) : (
                  <>
                    <StatusBadge statut="EN_ATTENTE" />
                    <div style={{ marginTop: 4, fontSize: "0.85rem", color: "#777" }}>{l.referentNom}</div>
                  </>
                )}
              </td>
            </tr>
          ))}
          {lignes.length === 0 && (
            <tr>
              <td colSpan={6}>Aucune session en attente — tout est à jour.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h2 style={{ marginTop: 32 }}>Derniers échecs d&apos;envoi d&apos;email</h2>
      <div className="carte">
        <p>
          Les {NOMBRE_ECHECS_AFFICHES} échecs les plus récents (quota Brevo dépassé, domaine non vérifié,
          adresse invalide, panne réseau...), tous types d&apos;email confondus — ce que la publication d&apos;un
          planning ou une validation ne font jamais échouer de leur côté : l&apos;envoi est tenté en arrière-plan,
          sans jamais bloquer l&apos;action qui le déclenche.
        </p>
      </div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Destinataire</th>
            <th>Contexte</th>
            <th>Erreur</th>
          </tr>
        </thead>
        <tbody>
          {echecsEnvoi.map((e) => (
            <tr key={e.id}>
              <td style={{ whiteSpace: "nowrap" }}>{e.dateEnvoi.toLocaleString("fr-FR")}</td>
              <td>{LIBELLE_TYPE_EMAIL[e.type] ?? e.type}</td>
              <td>{e.destinataire}</td>
              <td>{e.contexte ?? "—"}</td>
              <td style={{ fontSize: "0.85rem", color: "#777" }}>{e.erreur}</td>
            </tr>
          ))}
          {echecsEnvoi.length === 0 && (
            <tr>
              <td colSpan={5}>Aucun échec d&apos;envoi récent.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
