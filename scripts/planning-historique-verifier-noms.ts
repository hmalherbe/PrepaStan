// Vérification préalable (dry-run) : pour chaque nom de khôlleur/référent
// extrait du fichier historique, tente de le faire correspondre à un compte
// existant en base (déjà importé depuis Bdd_Google_App_JS.xlsx). N'écrit
// rien : sert juste à repérer les noms non reconnus avant de lancer le vrai
// import des plannings.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normaliser(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, "")
    .trim();
}

type Ligne = {
  date: string;
  discipline: string;
  kholleurs: { kholleur_nom: string; nombreEleves: number; heureDebut: string | null }[];
  referent_nom: string | null;
};

async function main() {
  const comptes = await prisma.utilisateur.findMany({
    where: { OR: [{ roles: { has: "KHOLLEUR" } }, { roles: { has: "PROFESSEUR_REFERENT" } }] },
    select: { id: true, nom: true, prenom: true, roles: true },
  });
  const comptesNorm = comptes.map((c) => ({ ...c, nomNorm: normaliser(c.nom), prenomNorm: normaliser(c.prenom) }));

  function trouver(nomBrut: string) {
    const norm = normaliser(nomBrut);
    const tokens = norm.split(/\s+/).filter(Boolean);
    const candidats = comptesNorm.filter((c) => {
      if (!c.nomNorm) return false;
      const nomTokens = c.nomNorm.split(/\s+/).filter(Boolean);
      return nomTokens.every((t) => tokens.includes(t)) && (!c.prenomNorm || tokens.some((t) => c.prenomNorm.startsWith(t) || t.startsWith(c.prenomNorm)));
    });
    return candidats;
  }

  const referents = await prisma.professeurReferent.findMany({
    include: { classe: { select: { nom: true } } },
  });

  const nomsVusParClasse = new Map<string, Set<string>>();
  for (const [fichier, classe] of [
    ["planning-historique-L1.json", "L1"],
    ["planning-historique-L2.json", "L2"],
  ] as const) {
    const lignes: Ligne[] = JSON.parse(readFileSync(join(__dirname, fichier), "utf-8"));
    const set = nomsVusParClasse.get(classe) ?? new Set<string>();
    for (const l of lignes) {
      for (const k of l.kholleurs) set.add(k.kholleur_nom);
      if (l.referent_nom) set.add(l.referent_nom);
    }
    nomsVusParClasse.set(classe, set);
  }

  let ok = 0;
  let ambigu = 0;
  let introuvable = 0;
  for (const [classe, noms] of nomsVusParClasse) {
    for (const nom of [...noms].sort()) {
      let candidats = trouver(nom);
      if (candidats.length > 1) {
        // Désambiguïsation : préfère le compte déjà lié comme référent de
        // cette classe précise (cas des homonymes avec deux comptes
        // distincts, ex. CRUCIANI Sandrine référente en L1 ET en L2 sous
        // deux emails différents).
        const idsLiesAClasse = new Set(
          referents.filter((r) => r.classe.nom === classe).map((r) => r.utilisateurId)
        );
        const filtres = candidats.filter((c) => idsLiesAClasse.has(c.id));
        if (filtres.length === 1) candidats = filtres;
      }
      if (candidats.length === 1) {
        ok++;
      } else if (candidats.length > 1) {
        ambigu++;
        console.log(
          `AMBIGU [${classe}] "${nom}" -> ${candidats.map((c) => `${c.prenom} ${c.nom} (${c.roles.join(",")})`).join(" | ")}`
        );
      } else {
        introuvable++;
        console.log(`ABSENT [${classe}] "${nom}"`);
      }
    }
  }
  console.log(`\n${ok + ambigu + introuvable} entrées (classe, nom) : ${ok} résolus, ${ambigu} ambigus, ${introuvable} introuvables.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
