import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartPie,
  faChartLine,
  faChevronDown,
  faReceipt,
  faRightToBracket,
  faTable,
  faWallet,
} from "@fortawesome/free-solid-svg-icons";
import { buttonClassName, ButtonLink } from "../ui/button";

const links = [
  { href: "/", label: "Dashboard", icon: faChartPie },
  { href: "/data", label: "Data Tables", icon: faTable },
  { href: "/securities", label: "Securities", icon: faChartLine },
  { href: "/dividends", label: "Dividends", icon: faWallet },
  { href: "/fees", label: "Fees", icon: faReceipt },
];

export function TopNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <nav className="flex items-center gap-2" aria-label="Primary navigation">
          {links.map((link) => (
            <ButtonLink
              key={link.href}
              href={link.href}
              variant="ghost"
            >
              <FontAwesomeIcon icon={link.icon} className="h-4 w-4" />
              {link.label}
            </ButtonLink>
          ))}
        </nav>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-lg font-semibold tracking-normal text-zinc-950">
          <Link href="/">PyTrade</Link>
        </h1>
        <details className="relative min-w-32 text-right">
          <summary className={`${buttonClassName("outline")} cursor-pointer list-none`}>
            <FontAwesomeIcon icon={faRightToBracket} className="h-4 w-4" />
            Sign in
            <FontAwesomeIcon icon={faChevronDown} className="h-3 w-3" />
          </summary>
          <div className="absolute right-0 mt-2 w-44 rounded-md border border-zinc-200 bg-white p-2 text-left shadow-lg">
            <button className={buttonClassName("ghost", "w-full justify-start")}>
              Demo user
            </button>
            <button className={buttonClassName("ghost", "w-full justify-start")}>
              Settings
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
