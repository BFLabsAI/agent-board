import { Activity } from "lucide-react";
import { EmptyState, PageHeader } from "../../components/ui";

export default function Feed() {
  return (
    <>
      <PageHeader icone={Activity} titulo="Activity Feed" subtitulo="Mensagens do board ao vivo" />
      <EmptyState icone={Activity} titulo="Em construção" descricao="Esta tela é preenchida pela trilha do Feed, na pasta pages/Feed." />
    </>
  );
}
