import {
  Activity,
  BarChart3,
  Building2,
  GitBranch,
  LayoutDashboard,
  MessagesSquare,
  Columns3,
  type LucideIcon,
} from "lucide-react";
import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export interface ItemNav {
  caminho: string;
  rotulo: string;
  icone: LucideIcon;
  /** só casa a rota exata (Dashboard) */
  exato?: boolean;
}

/**
 * Fonte única da navegação. Cada tela vive na própria pasta em `pages/` e
 * exporta `default`. Chunks de Analytics, Workflows e Office carregam sob demanda.
 */
export const ITENS_NAV: ItemNav[] = [
  { caminho: "/", rotulo: "Dashboard", icone: LayoutDashboard, exato: true },
  { caminho: "/kanban", rotulo: "Kanban", icone: Columns3 },
  { caminho: "/conversas", rotulo: "Conversas", icone: MessagesSquare },
  { caminho: "/feed", rotulo: "Activity Feed", icone: Activity },
  { caminho: "/analytics", rotulo: "Analytics", icone: BarChart3 },
  { caminho: "/workflows", rotulo: "Workflows", icone: GitBranch },
  { caminho: "/office", rotulo: "Office", icone: Building2 },
];

type Tela = LazyExoticComponent<ComponentType>;

export const TELAS: { caminho: string; tela: Tela }[] = [
  { caminho: "/", tela: lazy(() => import("./pages/Dashboard")) },
  { caminho: "/kanban", tela: lazy(() => import("./pages/Kanban")) },
  { caminho: "/conversas", tela: lazy(() => import("./pages/Conversas")) },
  { caminho: "/conversas/:id", tela: lazy(() => import("./pages/Conversas/Detalhe")) },
  { caminho: "/feed", tela: lazy(() => import("./pages/Feed")) },
  { caminho: "/analytics", tela: lazy(() => import("./pages/Analytics")) },
  { caminho: "/workflows", tela: lazy(() => import("./pages/Workflows")) },
  { caminho: "/office", tela: lazy(() => import("./pages/Office")) },
];
