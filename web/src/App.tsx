import { SearchX } from "lucide-react";
import { Route, Routes } from "react-router-dom";
import { EmptyState } from "./components/ui";
import { Layout } from "./layout/Layout";
import { TELAS } from "./rotas";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {TELAS.map(({ caminho, tela: Tela }) => (
          <Route key={caminho} path={caminho} element={<Tela />} />
        ))}
        <Route path="*" element={<EmptyState icone={SearchX} titulo="Página não encontrada" descricao="Use o menu à esquerda para voltar." />} />
      </Route>
    </Routes>
  );
}
