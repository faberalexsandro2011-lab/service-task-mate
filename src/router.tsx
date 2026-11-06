import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Um deploy pode remover um chunk antigo enquanto uma aba ainda usa o
// manifesto anterior. Online, recarrega a página para obter o HTML/manifeste
// atual; offline, não força reload nem interfere no cache local.
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event: Event) => {
    if (!navigator.onLine) return;
    event.preventDefault();
    window.location.reload();
  });
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
