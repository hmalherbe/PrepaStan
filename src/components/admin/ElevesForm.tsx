"use client";

import { useState } from "react";

type Eleve = {
  id: string;
  nom: string;
  prenom: string;
  classeId: string;
  classe: string;
  lv1Id: string | null;
  lv1: string | null;
  lv2Id: string | null;
  lv2: string | null;
  aUnCompte: boolean;
  email: string | null;
  emailContact: string | null;
  telephone: string | null;
  numeroParcoursup: string | null;
  etablissementOrigine: string | null;
};
type Classe = { id: string; nom: string };
type Discipline = { id: string; nom: string };

export function ElevesForm({
  elevesInitiaux,
  classes,
  languesVivantes,
}: {
  elevesInitiaux: Eleve[];
  classes: Classe[];
  languesVivantes: Discipline[];
}) {
  const [eleves, setEleves] = useState(elevesInitiaux);
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [classeId, setClasseId] = useState(classes[0]?.id ?? "");
  const [lv1Id, setLv1Id] = useState("");
  const [lv2Id, setLv2Id] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailContact, setEmailContact] = useState("");
  const [telephone, setTelephone] = useState("");
  const [numeroParcoursup, setNumeroParcoursup] = useState("");
  const [etablissementOrigine, setEtablissementOrigine] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [erreurEdition, setErreurEdition] = useState<string | null>(null);
  const [classeFiltre, setClasseFiltre] = useState("");
  const [lv1Filtre, setLv1Filtre] = useState("");
  const [lv2Filtre, setLv2Filtre] = useState("");

  const lv2InvalideAjout = Boolean(lv1Id && lv2Id && lv1Id === lv2Id);

  const auMoinsUnLv2 = eleves.some((e) => e.lv2Id);
  const elevesAffiches = eleves.filter(
    (e) =>
      (!classeFiltre || e.classeId === classeFiltre) &&
      (!lv1Filtre || e.lv1Id === lv1Filtre) &&
      (!lv2Filtre || e.lv2Id === lv2Filtre)
  );

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const res = await fetch("/api/admin/eleves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom,
          prenom,
          classeId,
          lv1Id: lv1Id || undefined,
          lv2Id: lv2Id || undefined,
          email: email || undefined,
          password: password || undefined,
          emailContact: emailContact || undefined,
          telephone: telephone || undefined,
          numeroParcoursup: numeroParcoursup || undefined,
          etablissementOrigine: etablissementOrigine || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur lors de l'ajout");
        return;
      }
      setEleves((prev) => [
        ...prev,
        {
          id: data.id,
          nom,
          prenom,
          classeId,
          classe: classes.find((c) => c.id === classeId)?.nom ?? "",
          lv1Id: lv1Id || null,
          lv1: languesVivantes.find((d) => d.id === lv1Id)?.nom ?? null,
          lv2Id: lv2Id || null,
          lv2: languesVivantes.find((d) => d.id === lv2Id)?.nom ?? null,
          aUnCompte: Boolean(email),
          email: email || null,
          emailContact: emailContact || null,
          telephone: telephone || null,
          numeroParcoursup: numeroParcoursup || null,
          etablissementOrigine: etablissementOrigine || null,
        },
      ]);
      setNom("");
      setPrenom("");
      setLv1Id("");
      setLv2Id("");
      setEmail("");
      setPassword("");
      setEmailContact("");
      setTelephone("");
      setNumeroParcoursup("");
      setEtablissementOrigine("");
    } finally {
      setEnCours(false);
    }
  }

  async function supprimerTous() {
    if (eleves.length === 0) return;
    if (
      !confirm(
        `Supprimer TOUS les élèves de TOUTES les classes (${eleves.length} élève(s)) ? ` +
          "Ceux ayant déjà des passages de khôlle enregistrés seront conservés. Cette action est irréversible."
      )
    ) {
      return;
    }
    const res = await fetch("/api/admin/eleves", { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Erreur lors de la suppression");
      return;
    }
    if (data.proteges > 0) {
      alert(
        `${data.supprimes} élève(s) supprimé(s). ${data.proteges} conservé(s) car ils ont déjà des passages de khôlle enregistrés.`
      );
    }
    // Recharge simplement la liste depuis le serveur : plus fiable que de
    // reconstruire côté client qui exactement a été protégé.
    window.location.reload();
  }

  async function supprimer(eleveId: string) {
    if (!confirm("Supprimer cet élève ?")) return;
    const res = await fetch(`/api/admin/eleves/${eleveId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Erreur lors de la suppression");
      return;
    }
    setEleves((prev) => prev.filter((e) => e.id !== eleveId));
  }

  async function sauvegarderEdition(
    eleveId: string,
    patch: {
      nom: string;
      prenom: string;
      classeId: string;
      lv1Id?: string;
      lv2Id?: string;
      email?: string;
      password?: string;
      emailContact?: string;
      telephone?: string;
      numeroParcoursup?: string;
      etablissementOrigine?: string;
    }
  ) {
    setErreurEdition(null);
    const res = await fetch(`/api/admin/eleves/${eleveId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) {
      setErreurEdition(data.error ?? "Erreur lors de la modification");
      return;
    }
    setEleves((prev) =>
      prev.map((e) =>
        e.id === eleveId
          ? {
              ...e,
              nom: patch.nom,
              prenom: patch.prenom,
              classeId: patch.classeId,
              classe: classes.find((c) => c.id === patch.classeId)?.nom ?? "",
              lv1Id: patch.lv1Id ?? null,
              lv1: languesVivantes.find((d) => d.id === patch.lv1Id)?.nom ?? null,
              lv2Id: patch.lv2Id ?? null,
              lv2: languesVivantes.find((d) => d.id === patch.lv2Id)?.nom ?? null,
              email: patch.email ?? e.email,
              aUnCompte: e.aUnCompte || Boolean(patch.email),
              emailContact: patch.emailContact ?? null,
              telephone: patch.telephone ?? null,
              numeroParcoursup: patch.numeroParcoursup ?? null,
              etablissementOrigine: patch.etablissementOrigine ?? null,
            }
          : e
      )
    );
    setEnEdition(null);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button type="button" className="discret" onClick={supprimerTous} disabled={eleves.length === 0}>
          Supprimer tous les élèves ({eleves.length})
        </button>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <label style={{ maxWidth: 220 }}>
          Filtrer par classe
          <select value={classeFiltre} onChange={(e) => setClasseFiltre(e.target.value)}>
            <option value="">Toutes les classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </label>
        <label style={{ maxWidth: 220 }}>
          Filtrer par LV1
          <select value={lv1Filtre} onChange={(e) => setLv1Filtre(e.target.value)}>
            <option value="">Toutes les LV1</option>
            {languesVivantes.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nom}
              </option>
            ))}
          </select>
        </label>
        {auMoinsUnLv2 && (
          <label style={{ maxWidth: 220 }}>
            Filtrer par LV2
            <select value={lv2Filtre} onChange={(e) => setLv2Filtre(e.target.value)}>
              <option value="">Toutes les LV2</option>
              {languesVivantes.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nom}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <table>
        <thead>
          <tr>
            <th></th>
            <th>Nom</th>
            <th>Prénom</th>
            <th>Classe</th>
            <th>LV1</th>
            <th>LV2</th>
            <th>Compte</th>
            <th>Email contact</th>
            <th>Téléphone</th>
            <th>Parcoursup</th>
            <th>Établissement</th>
          </tr>
        </thead>
        <tbody>
          {elevesAffiches.map((e) =>
            enEdition === e.id ? (
              <LigneEdition
                key={e.id}
                eleve={e}
                classes={classes}
                languesVivantes={languesVivantes}
                onAnnuler={() => setEnEdition(null)}
                onSauvegarder={(patch) => sauvegarderEdition(e.id, patch)}
              />
            ) : (
              <tr key={e.id}>
                <td style={{ display: "flex", gap: 8 }}>
                  <button className="discret" onClick={() => setEnEdition(e.id)}>
                    Modifier
                  </button>
                  <button className="discret" onClick={() => supprimer(e.id)}>
                    Supprimer
                  </button>
                </td>
                <td>{e.nom}</td>
                <td>{e.prenom}</td>
                <td>{e.classe}</td>
                <td>{e.lv1 ?? "—"}</td>
                <td>{e.lv2 ?? "—"}</td>
                <td>{e.aUnCompte ? "Oui" : "Non"}</td>
                <td>{e.emailContact ?? "—"}</td>
                <td>{e.telephone ?? "—"}</td>
                <td>{e.numeroParcoursup ?? "—"}</td>
                <td>{e.etablissementOrigine ?? "—"}</td>
              </tr>
            )
          )}
          {elevesAffiches.length === 0 && (
            <tr>
              <td colSpan={11}>{eleves.length === 0 ? "Aucun élève pour le moment." : "Aucun élève pour ces filtres."}</td>
            </tr>
          )}
        </tbody>
      </table>
      {erreurEdition && <p className="champ-erreur">{erreurEdition}</p>}

      <h2>Ajouter un étudiant</h2>
      <form onSubmit={ajouter} className="carte">
        <label>
          Nom
          <input value={nom} onChange={(e) => setNom(e.target.value)} required />
        </label>
        <label>
          Prénom
          <input value={prenom} onChange={(e) => setPrenom(e.target.value)} required />
        </label>
        <label>
          Classe
          <select value={classeId} onChange={(e) => setClasseId(e.target.value)} required>
            <option value="" disabled>
              Choisir…
            </option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
          {classes.length === 0 && (
            <span style={{ color: "#777", fontSize: "0.85rem" }}>
              Aucune classe créée pour le moment (voir l'écran Classes).
            </span>
          )}
        </label>
        <label>
          LV1
          <select value={lv1Id} onChange={(e) => setLv1Id(e.target.value)}>
            <option value="">—</option>
            {languesVivantes.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nom}
              </option>
            ))}
          </select>
        </label>
        <label>
          LV2
          <select value={lv2Id} onChange={(e) => setLv2Id(e.target.value)}>
            <option value="">—</option>
            {languesVivantes.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nom}
              </option>
            ))}
          </select>
        </label>
        {languesVivantes.length === 0 && (
          <span style={{ color: "#777", fontSize: "0.85rem" }}>
            Aucune discipline marquée « langue vivante » (voir l&apos;écran Disciplines).
          </span>
        )}
        {lv2InvalideAjout && <p className="champ-erreur">LV1 et LV2 doivent être différentes.</p>}
        <label>
          Email (optionnel, crée un compte de connexion)
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {email && (
          <label>
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={Boolean(email)}
            />
          </label>
        )}
        <label>
          Email de contact (informationnel, ne crée pas de compte)
          <input type="email" value={emailContact} onChange={(e) => setEmailContact(e.target.value)} />
        </label>
        <label>
          Téléphone
          <input value={telephone} onChange={(e) => setTelephone(e.target.value)} />
        </label>
        <label>
          Numéro Parcoursup
          <input value={numeroParcoursup} onChange={(e) => setNumeroParcoursup(e.target.value)} />
        </label>
        <label>
          Établissement d&apos;origine
          <input value={etablissementOrigine} onChange={(e) => setEtablissementOrigine(e.target.value)} />
        </label>
        {erreur && <p className="champ-erreur">{erreur}</p>}
        <button type="submit" disabled={enCours || !classeId || lv2InvalideAjout}>
          {enCours ? "Ajout…" : "Ajouter l'étudiant"}
        </button>
      </form>
    </div>
  );
}

function LigneEdition({
  eleve,
  classes,
  languesVivantes,
  onAnnuler,
  onSauvegarder,
}: {
  eleve: Eleve;
  classes: Classe[];
  languesVivantes: Discipline[];
  onAnnuler: () => void;
  onSauvegarder: (patch: {
    nom: string;
    prenom: string;
    classeId: string;
    lv1Id?: string;
    lv2Id?: string;
    email?: string;
    password?: string;
    emailContact?: string;
    telephone?: string;
    numeroParcoursup?: string;
    etablissementOrigine?: string;
  }) => void;
}) {
  const [nom, setNom] = useState(eleve.nom);
  const [prenom, setPrenom] = useState(eleve.prenom);
  const [classeId, setClasseId] = useState(eleve.classeId);
  const [lv1Id, setLv1Id] = useState(eleve.lv1Id ?? "");
  const [lv2Id, setLv2Id] = useState(eleve.lv2Id ?? "");
  const [email, setEmail] = useState(eleve.email ?? "");
  const [password, setPassword] = useState("");
  const [emailContact, setEmailContact] = useState(eleve.emailContact ?? "");
  const [telephone, setTelephone] = useState(eleve.telephone ?? "");
  const [numeroParcoursup, setNumeroParcoursup] = useState(eleve.numeroParcoursup ?? "");
  const [etablissementOrigine, setEtablissementOrigine] = useState(eleve.etablissementOrigine ?? "");

  const lv2Invalide = Boolean(lv1Id && lv2Id && lv1Id === lv2Id);

  return (
    <tr>
      <td colSpan={11}>
        <div className="carte" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" style={{ flex: 1 }} />
            <input
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              placeholder="Prénom"
              style={{ flex: 1 }}
            />
            <select value={classeId} onChange={(e) => setClasseId(e.target.value)} style={{ flex: 1 }}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ flex: 1 }}>
              LV1
              <select value={lv1Id} onChange={(e) => setLv1Id(e.target.value)}>
                <option value="">—</option>
                {languesVivantes.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nom}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ flex: 1 }}>
              LV2
              <select value={lv2Id} onChange={(e) => setLv2Id(e.target.value)}>
                <option value="">—</option>
                {languesVivantes.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nom}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {lv2Invalide && <p className="champ-erreur">LV1 et LV2 doivent être différentes.</p>}
          <label>
            {eleve.aUnCompte ? "Email du compte" : "Email (optionnel, crée un compte de connexion)"}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {email && (
            <label>
              {eleve.aUnCompte ? "Nouveau mot de passe (optionnel)" : "Mot de passe"}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={!eleve.aUnCompte}
              />
            </label>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ flex: 1 }}>
              Email de contact
              <input type="email" value={emailContact} onChange={(e) => setEmailContact(e.target.value)} />
            </label>
            <label style={{ flex: 1 }}>
              Téléphone
              <input value={telephone} onChange={(e) => setTelephone(e.target.value)} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ flex: 1 }}>
              Numéro Parcoursup
              <input value={numeroParcoursup} onChange={(e) => setNumeroParcoursup(e.target.value)} />
            </label>
            <label style={{ flex: 1 }}>
              Établissement d&apos;origine
              <input value={etablissementOrigine} onChange={(e) => setEtablissementOrigine(e.target.value)} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() =>
                onSauvegarder({
                  nom,
                  prenom,
                  classeId,
                  lv1Id: lv1Id || undefined,
                  lv2Id: lv2Id || undefined,
                  email: email || undefined,
                  password: password || undefined,
                  emailContact: emailContact || undefined,
                  telephone: telephone || undefined,
                  numeroParcoursup: numeroParcoursup || undefined,
                  etablissementOrigine: etablissementOrigine || undefined,
                })
              }
              disabled={lv2Invalide}
            >
              OK
            </button>
            <button className="discret" onClick={onAnnuler}>
              Annuler
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}
