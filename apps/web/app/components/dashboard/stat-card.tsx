import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

type StatCardProps = {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
  icon?: IconDefinition;
  align?: "left" | "center";
};

export function StatCard({
  label,
  value,
  tone = "neutral",
  icon,
  align = "center",
}: StatCardProps) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "negative"
        ? "text-rose-700"
        : "text-zinc-950";

  return (
    <section
      className={`rounded-md border border-zinc-200 bg-white p-5 shadow-sm ${
        align === "center" ? "text-center" : ""
      }`}
    >
      <div
        className={`flex items-center gap-3 ${
          align === "center" ? "justify-center" : "justify-between"
        }`}
      >
        <p className="text-sm text-zinc-500">{label}</p>
        {icon ? <FontAwesomeIcon icon={icon} className="h-4 w-4 text-zinc-400" /> : null}
      </div>
      <p className={`mt-2 whitespace-pre-line text-xl font-semibold tracking-normal ${toneClass}`}>
        {value}
      </p>
    </section>
  );
}
