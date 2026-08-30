/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produit un dossier .next/standalone auto-suffisant (serveur Node minimal
  // + seules les dépendances réellement utilisées) : c'est ce que le
  // Dockerfile de production copie, pour une image finale légère plutôt que
  // d'embarquer tout node_modules.
  output: "standalone",
};

export default nextConfig;
