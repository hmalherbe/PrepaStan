import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@prepastan.local";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "changeme";

  const admin = await prisma.utilisateur.upsert({
    where: { email },
    update: {},
    create: {
      email,
      password: await bcrypt.hash(password, 12),
      nom: "Admin",
      prenom: "PrepaStan",
      role: "ADMIN",
    },
  });

  console.log(`Compte admin prêt : ${admin.email} (mot de passe : ${password})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
