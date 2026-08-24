import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/planification/jobs/:jobId
// Poll du statut d'un job de planification (EN_COURS / SUCCES / ECHEC / INFAISABLE).
export async function GET(
  _req: Request,
  { params }: { params: { jobId: string } }
) {
  const auth = await requireRole(["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const job = await prisma.planificationJob.findUniqueOrThrow({
    where: { id: params.jobId },
  });

  return NextResponse.json(job);
}
