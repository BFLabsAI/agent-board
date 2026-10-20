import { BarChart3 } from "lucide-react";
import { EmptyState, PageHeader } from "../../components/ui";

export default function Analytics() {
  return (
    <>
      <PageHeader icone={BarChart3} titulo="Analytics" subtitulo="Volume, tempos de resposta e rejeições" />
      <EmptyState icone={BarChart3} titulo="Em construção" descricao="Esta tela é preenchida pela trilha de Analytics, na pasta pages/Analytics." />
    </>
  );
}
