import { Link, NavLink, useLocation, type LinkProps, type NavLinkProps, type To } from "react-router-dom";

const MANTER = ["projeto", "workspace", "periodo", "tv"];

/** Acrescenta ?projeto=, ?workspace=, ?periodo= e ?tv= da URL atual ao destino, para a navegação não perdê-los. */
export function useDestino(): (para: To) => To {
  const { search } = useLocation();
  return (para) => {
    const atual = new URLSearchParams(search);
    const alvo = typeof para === "string" ? { pathname: para, search: "" } : { ...para };
    const [pathname, qs = ""] = (alvo.pathname ?? "").split("?");
    const novo = new URLSearchParams(alvo.search || qs);
    for (const k of MANTER) {
      const v = atual.get(k);
      if (v && !novo.has(k)) novo.set(k, v);
    }
    const s = novo.toString();
    return { ...alvo, pathname, search: s ? `?${s}` : "" };
  };
}

/** `Link` que preserva projeto, período e modo TV. Use no lugar do Link do router. */
export function LinkPainel({ to, ...resto }: LinkProps) {
  const destino = useDestino();
  return <Link to={destino(to)} {...resto} />;
}

export function NavLinkPainel({ to, ...resto }: NavLinkProps) {
  const destino = useDestino();
  return <NavLink to={destino(to)} {...resto} />;
}
