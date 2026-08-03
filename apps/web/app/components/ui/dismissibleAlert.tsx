"use client";

type DismissibleAlertProps = {
  message: string;
  tone: "success" | "error";
  onDismiss: () => void;
};

export function DismissibleAlert({ message, tone, onDismiss }: DismissibleAlertProps) {
  const toneClasses = tone === "success"
    ? "border-success-border bg-success-surface text-success-text"
    : "border-error-border bg-error-surface text-error-text";

  return (
    <div
      className={`flex items-start justify-between gap-4 rounded-md border p-4 text-sm font-medium ${toneClasses}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <p className="min-w-0 break-words">{message}</p>
      <button
        type="button"
        className="-m-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-xl leading-none hover:bg-surface/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        aria-label="Dismiss message"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
