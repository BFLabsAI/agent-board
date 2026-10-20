import { Columns3 } from "lucide-react";
import { EmptyState, PageHeader } from "../../components/ui";

export default function Kanban() {
  return (
    <>
      <PageHeader icone={Columns3} titulo="Kanban" subtitulo="Tarefas e agentes em colunas" />
      <EmptyState icone={Columns3} titulo="Em construção" descricao="Esta tela é preenchida pela trilha do Kanban, na pasta pages/Kanban." />
    </>
  );
}
