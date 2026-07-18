"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartPie,
  faChartLine,
  faChevronDown,
  faReceipt,
  faGear,
  faMoneyBillWave,
  faTable,
  faUser,
  faWallet,
} from "@fortawesome/free-solid-svg-icons";
import { buttonClassName, ButtonLink } from "../ui/button";
import { DetailsDropdown } from "../ui/details-dropdown";

const links = [
  { href: "/", label: "Portfolio", icon: faChartPie },
  { href: "/securities", label: "Securities", icon: faChartLine },
  { href: "/dividends", label: "Dividends", icon: faWallet },
  { href: "/data", label: "Data Tables", icon: faTable },
  { href: "/options", label: "Options", icon: faChartLine },
  { href: "/fees", label: "Fees", icon: faReceipt },
  { href: "/cash", label: "Cash", icon: faMoneyBillWave }
];

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => void;
};

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const activeHref = links.find((link) => isActivePath(pathname, link.href))?.href ?? "/";

  const handleNavigate = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (isActivePath(pathname, href)) return;

    event.preventDefault();
    const navigate = () => router.push(href);
    const viewTransitionDocument = document as ViewTransitionDocument;

    if (viewTransitionDocument.startViewTransition) {
      viewTransitionDocument.startViewTransition(navigate);
      return;
    }

    navigate();
  };

  return (
    <>
      <header className="sticky top-0 z-30 hidden border-b border-primary-900 text-white md:block">
        <div className="metallic-primary-bar">
          <div className="relative mx-auto flex min-h-20 max-w-7xl items-center gap-6 px-6 py-3 lg:px-8">
            <h1 className="shrink-0 text-lg font-semibold tracking-normal">
              <Link href="/" onClick={handleNavigate("/")}>PyTrade</Link>
            </h1>
            <nav
              className="relative flex min-w-0 flex-1 items-stretch justify-center gap-1 overflow-x-auto px-1"
              aria-label="Primary navigation"
            >
              {links.map((link) => {
                const active = link.href === activeHref;

                return (
                  <ButtonLink
                    key={link.href}
                    href={link.href}
                    variant="plain"
                    onClick={handleNavigate(link.href)}
                    aria-current={active ? "page" : undefined}
                    className={active ? "nav-bar-button nav-bar-button-active" : "nav-bar-button"}
                  >
                    <FontAwesomeIcon icon={link.icon} className="h-4 w-4" />
                    {link.label}
                  </ButtonLink>
                );
              })}
            </nav>
            <DetailsDropdown className="relative min-w-20 text-right">
              <summary className={buttonClassName("plain", "nav-icon-button")}>
            <FontAwesomeIcon icon={faUser} className="h-4 w-4" />
            <FontAwesomeIcon icon={faChevronDown} className="h-3 w-3" />
          </summary>
              <div className="absolute right-0 mt-2 w-44 rounded-md border border-border bg-surface p-2 text-left text-foreground shadow-lg">
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
        </div>
      </header>

      <header className="border-b border-border bg-surface px-4 py-3 md:hidden">
        <Link
          href="/"
          onClick={handleNavigate("/")}
          className="text-base font-semibold tracking-normal text-primary-900"
        >
          PyTrade
        </Link>
      </header>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-7 border-t border-primary-900 bg-surface px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-10px_30px_rgba(22,55,85,0.14)] md:hidden"
        aria-label="Primary navigation"
      >
        {links.map((link) => {
          const active = link.href === activeHref;

          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={handleNavigate(link.href)}
              aria-current={active ? "page" : undefined}
              className={active ? "mobile-nav-button mobile-nav-button-active" : "mobile-nav-button"}
            >
              <FontAwesomeIcon icon={link.icon} className="h-4 w-4" />
              <span className="max-w-full truncate">{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
