import { EmptyState } from "../../components/ui";
import { Building2 } from "lucide-react";
import type { PropsModoOffice } from "./tipos";

// stub: preenchido pela trilha #11
export default function Grade({ agentes }: PropsModoOffice) {
  return <EmptyState icone={Building2} titulo="Grade em construção" descricao={`${agentes.length} agentes. Trilha #11.`} />;
}
