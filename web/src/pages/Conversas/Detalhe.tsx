import { MessagesSquare } from "lucide-react";
import { useParams } from "react-router-dom";
import { EmptyState, PageHeader } from "../../components/ui";

export default function ConversaDetalhe() {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <PageHeader icone={MessagesSquare} titulo={`Conversa ${id ?? ""}`} subtitulo="Timeline da thread" />
      <EmptyState icone={MessagesSquare} titulo="Em construção" descricao="Esta tela é preenchida pela trilha de Conversas, em pages/Conversas/Detalhe.tsx." />
    </>
  );
}
