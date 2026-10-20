import { AlertTriangle } from "lucide-react";
import { Component, type ReactNode } from "react";
import { EmptyState } from "../components/ui";

/** Uma tela que quebra (dado inesperado do log) não derruba o painel inteiro. */
export class LimiteErro extends Component<{ children: ReactNode }, { erro: Error | null }> {
  state = { erro: null as Error | null };

  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }

  render() {
    if (this.state.erro) {
      return (
        <EmptyState
          icone={AlertTriangle}
          titulo="Esta tela falhou ao renderizar"
          descricao={`${this.state.erro.message || "erro desconhecido"}. As outras telas continuam funcionando; recarregue a página para tentar de novo.`}
        />
      );
    }
    return this.props.children;
  }
}
