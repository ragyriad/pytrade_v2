import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartPie,
  faChartLine,
  faChevronDown,
  faReceipt,
  faGear,
  faTable,
  faUser,
  faWallet,
} from "@fortawesome/free-solid-svg-icons";
import { buttonClassName, ButtonLink } from "../ui/button";
import { DetailsDropdown } from "../ui/details-dropdown";

const links = [
  { href: "/", label: "Portfolio", icon: faChartPie },
  { href: "/data", label: "Data Tables", icon: faTable },
  { href: "/securities", label: "Securities", icon: faChartLine },
  { href: "/dividends", label: "Dividends", icon: faWallet },
  { href: "/fees", label: "Fees", icon: faReceipt },
];

export function TopNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="relative mx-auto flex min-h-24 max-w-7xl flex-col items-center justify-center gap-2 px-4 py-3 sm:px-6 lg:px-8">
        <h1 className="text-lg font-semibold tracking-normal text-zinc-950">
          <Link href="/">PyTrade</Link>
        </h1>
        <nav
          className="flex max-w-full items-center gap-2 overflow-x-auto"
          aria-label="Primary navigation"
        >
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
        <DetailsDropdown className="absolute right-4 top-1/2 min-w-32 -translate-y-1/2 text-right sm:right-6 lg:right-8">
          <summary className={`${buttonClassName("outline")} cursor-pointer list-none`}>
            <FontAwesomeIcon icon={faUser} className="h-4 w-4" />
            <FontAwesomeIcon icon={faChevronDown} className="h-3 w-3" />
          </summary>
          <div className="absolute right-0 mt-2 w-44 rounded-md border border-zinc-200 bg-white p-2 text-left shadow-lg">
            <button className={buttonClassName("ghost", "w-full justify-start")}>
              <FontAwesomeIcon icon={faUser} className="h-4 w-4" />
              Demo user
            </button>
            <button className={buttonClassName("ghost", "w-full justify-start")}>
              <FontAwesomeIcon icon={faGear} className="h-4 w-4" />
              Settings
            </button>
          </div>
        </DetailsDropdown>
      </div>
    </header>
  );
}
