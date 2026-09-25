import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: {
    // En desarrollo Next registra los argumentos de cada server action, lo que
    // incluiría contraseñas del login y datos de formularios. Se desactiva.
    serverFunctions: false,
  },
};

export default nextConfig;
