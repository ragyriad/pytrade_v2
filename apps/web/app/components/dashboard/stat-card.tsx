import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: ReactNode;
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
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : "text-foreground";

  return (
    <section
      className={`app-panel p-5 ${
        align === "center" ? "text-center" : ""
      }`}
    >
      <div
        className={`flex items-center gap-3 ${
          align === "center" ? "justify-center" : "justify-between"
        }`}
      >
        <p className="text-sm text-muted">{label}</p>
        {icon ? <FontAwesomeIcon icon={icon} className="h-4 w-4 text-primary-500" /> : null}
      </div>
      <div className={`mt-2 whitespace-pre-line text-xl font-semibold tracking-normal ${toneClass}`}>
        {value}
      </div>
    </section>
  );
}
