import { createFileRoute } from "@tanstack/react-router";
import { PainelTeste } from "./painel-teste";

// Rota oficial do painel multiunidade. A rota antiga /painel-teste
// permanece disponível temporariamente para compatibilidade com links salvos.
export const Route = createFileRoute("/_authenticated/painel")({
  component: PainelTeste,
});
