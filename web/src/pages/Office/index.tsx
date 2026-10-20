import { Building2 } from "lucide-react";
import { EmptyState, PageHeader } from "../../components/ui";

export default function Office() {
  return (
    <>
      <PageHeader icone={Building2} titulo="Office" subtitulo="O time no escritório, ao vivo" />
      <EmptyState icone={Building2} titulo="Em construção" descricao="Esta tela é preenchida pela trilha do Office, na pasta pages/Office." />
    </>
  );
}
