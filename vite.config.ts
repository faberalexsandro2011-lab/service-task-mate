// @lovable.dev/vite-tanstack-config já inclui os plugins necessários do TanStack Start,
// React, Tailwind, aliases e o servidor Nitro.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  build: {
    // Publica a relação de módulos para o service worker pré-carregar também
    // os chunks de rotas que ainda não foram abertos no aparelho.
    manifest: "asset-manifest.json",
  },
});
