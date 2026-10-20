/** Barras de atividade dos últimos 14 dias; a última (hoje) fica destacada. */
export function Atividade({ valores, cor }: { valores: number[]; cor: string }) {
  const max = Math.max(1, ...valores);
  return (
    <div role="img" aria-label={`Atividade nos últimos 14 dias: ${valores.join(", ")}`} className="flex h-9 items-end gap-[3px]">
      {valores.map((v, i) => (
        <span
          key={i}
          data-barra
          title={`${v} ${v === 1 ? "mensagem" : "mensagens"}`}
          className="flex-1 rounded-[2px] transition-all duration-300"
          style={{
            height: `${Math.max(v === 0 ? 6 : 12, Math.round((v / max) * 100))}%`,
            background: cor,
            opacity: v === 0 ? 0.18 : i === valores.length - 1 ? 1 : 0.55,
          }}
        />
      ))}
    </div>
  );
}
