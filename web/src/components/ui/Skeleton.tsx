import clsx from "clsx";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={clsx(
        "animate-shimmer rounded-md bg-[linear-gradient(90deg,#1a1a28_25%,#222233_50%,#1a1a28_75%)] bg-[length:200%_100%]",
        className,
      )}
    />
  );
}
