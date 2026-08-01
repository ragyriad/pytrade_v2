import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleNotch, faCoins } from "@fortawesome/free-solid-svg-icons";

interface PageLoadingProps {
  label: string;
}

export function MoneySpinner() {
  return (
    <span className="relative flex h-9 w-9 items-center justify-center">
      <FontAwesomeIcon
        icon={faCircleNotch}
        className="absolute h-9 w-9 animate-spin text-focus"
      />
      <FontAwesomeIcon icon={faCoins} className="h-3.5 w-3.5 text-action-hover" />
    </span>
  );
}

export function PageLoading({ label }: PageLoadingProps) {
  return (
    <main className="app-main">
      <div className="app-page">
        <div className="flex min-h-[28rem] items-center justify-center">
          <div className="app-panel flex items-center gap-3 px-5 py-4">
            <MoneySpinner />
            <span className="text-sm font-medium text-foreground">{label}</span>
          </div>
        </div>
      </div>
    </main>
  );
}
