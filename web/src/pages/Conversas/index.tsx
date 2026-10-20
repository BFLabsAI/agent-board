import { MessagesSquare } from "lucide-react";
import { EmptyState, PageHeader } from "../../components/ui";

export default function Conversas() {
  return (
    <>
      <PageHeader icone={MessagesSquare} titulo="Conversas" subtitulo="Cada pedido com a sua thread" />
      <EmptyState icone={MessagesSquare} titulo="Em construção" descricao="Esta tela é preenchida pela trilha de Conversas, na pasta pages/Conversas." />
    </>
  );
}
