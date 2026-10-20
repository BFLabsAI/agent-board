import { GitBranch } from "lucide-react";
import { EmptyState, PageHeader } from "../../components/ui";

export default function Workflows() {
  return (
    <>
      <PageHeader icone={GitBranch} titulo="Workflows" subtitulo="Do master aos managers, issues e revisão" />
      <EmptyState icone={GitBranch} titulo="Em construção" descricao="Esta tela é preenchida pela trilha de Workflows, na pasta pages/Workflows." />
    </>
  );
}
