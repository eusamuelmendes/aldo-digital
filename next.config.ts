import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // As imagens hoje estão embutidas em base64 no HTML (3,1 MB).
  // Quando forem para o Storage, entram aqui os domínios permitidos.
  images: { remotePatterns: [] },
};

export default config;
