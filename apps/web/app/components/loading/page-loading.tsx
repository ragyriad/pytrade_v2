import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleNotch, faCoins } from "@fortawesome/free-solid-svg-icons";

type PageLoadingProps = {
  label: string;
};

export function MoneySpinner() {
  return (
    <span className="relative flex h-9 w-9 items-center justify-center">
      <FontAwesomeIcon
        icon={faCircleNotch}
        className="absolute h-9 w-9 animate-spin text-emerald-600"
      />
      <FontAwesomeIcon icon={faCoins} className="h-3.5 w-3.5 text-emerald-800" />
    </span>
  );
}

export function PageLoading({ label }: PageLoadingProps) {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[28rem] max-w-7xl items-center justify-center">
        <div className="flex items-center gap-3 rounded-md border border-emerald-200 bg-white px-5 py-4 shadow-sm">
          <MoneySpinner />
          <span className="text-sm font-medium text-zinc-700">{label}</span>
        </div>
      </div>
    </main>
  );
}
