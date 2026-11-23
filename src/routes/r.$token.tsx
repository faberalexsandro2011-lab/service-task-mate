import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";

/**
 * Short permanent QR URL.
 * The QR contains only /r/:token; this route immediately forwards
 * the browser to the public fleet consultation page.
 */
export const Route = createFileRoute("/r/$token")({
  head: () => ({
    meta: [
      { title: "Redirecionando — Central Frota" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: FleetQrRedirect,
});

function FleetQrRedirect() {
  const { token } = Route.useParams();

  useEffect(() => {
    if (!token) return;
    window.location.replace(`/f/${encodeURIComponent(token)}`);
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 text-sm text-slate-600">
      Redirecionando para a consulta da frota...
    </main>
  );
}
