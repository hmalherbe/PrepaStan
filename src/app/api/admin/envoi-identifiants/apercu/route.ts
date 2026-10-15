import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { construireEmailActivationCompte } from "@/lib/email";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({ utilisateurId: z.string().min(1) });

// GET /api/admin/envoi-identifiants/apercu?utilisateurId=...
// Rend directement en HTML (pas en JSON) le contenu exact de l'email
// d'activation pour cet utilisateur, SANS l'envoyer et sans créer de vrai
// token (le lien affiché n'est pas fonctionnel) — pensé pour vérifier le
// rendu d'un email pour une adresse qui ne peut de toute façon rien
// recevoir (ex. adresse synthétique @demo.prepastan.local en démo), ou plus
// simplement sans attendre une vraie livraison.
export async function GET(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const { utilisateurId } = querySchema.parse({ utilisateurId: searchParams.get("utilisateurId") });

  const utilisateur = await prisma.utilisateur.findUnique({
    where: { id: utilisateurId },
    select: { email: true, prenom: true },
  });
  if (!utilisateur) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
  const lienFactice = `${baseUrl}/reinitialiser-mot-de-passe?token=apercu-non-fonctionnel`;

  const { subject, html } = construireEmailActivationCompte({
    destinataire: utilisateur.email,
    nomUtilisateur: utilisateur.prenom,
    lien: lienFactice,
  });

  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>${subject}</title></head>` +
      `<body style="font-family: sans-serif; max-width: 640px; margin: 24px auto;">` +
      `<p style="color:#777; font-size: 0.85rem;">Aperçu — cet email n'a pas été envoyé, et le lien ci-dessous n'est pas fonctionnel.</p>` +
      `<hr>` +
      html +
      `</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
