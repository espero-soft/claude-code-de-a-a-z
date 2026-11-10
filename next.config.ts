import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // next/image n'optimise que les photos des salles (public/salles), sans
  // paramètre de requête : toute autre URL est refusée (400).
  images: {
    localPatterns: [{ pathname: "/salles/**", search: "" }],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
