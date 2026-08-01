"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBars,
  faCalendarDays,
  faChartLine,
  faChartPie,
  faChevronDown,
  faGear,
  faMoneyBillWave,
  faReceipt,
  faTable,
  faUser,
  faWallet,
} from "@fortawesome/free-solid-svg-icons";
import { buttonClassName, ButtonLink } from "../ui/button";
import { DetailsDropdown } from "../ui/detailsDropdown";

const links = [
  { href: "/", label: "Portfolio", icon: faChartPie },
  { href: "/securities", label: "Securities", icon: faChartLine },
  { href: "/dividends", label: "Dividends", icon: faWallet },
  { href: "/calendar", label: "Calendar", icon: faCalendarDays },
  { href: "/data", label: "Data tables", icon: faTable },
  { href: "/options", label: "Options", icon: faChartLine },
  { href: "/costs", label: "Costs", icon: faReceipt },
  { href: "/cash", label: "Cash", icon: faMoneyBillWave },
];

const mobileLinks = links.slice(0, 4);
const moreLinks = links.slice(4);

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => void;
};

function isActivePath(pathname: string, href: string): boolean {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

function UserMenu({ compact = false, mobile = false }: { compact?: boolean; mobile?: boolean }) {
  const className = [
    "nav-user-button",
    compact ? "nav-user-button-compact" : "",
    mobile ? "nav-user-button-mobile" : "",
  ].filter(Boolean).join(" ");

  return (
    <DetailsDropdown className="relative text-right">
      <summary
        className={buttonClassName("plain", className)}
        aria-label="Open user menu"
      >
        <FontAwesomeIcon icon={faUser} className="h-4 w-4" />
        {!compact ? <FontAwesomeIcon icon={faChevronDown} className="h-3 w-3" /> : null}
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-44 rounded-md border border-border bg-surface p-2 text-left text-foreground shadow-lg">
        <button className={buttonClassName("ghost", "w-full justify-start")}>
          <FontAwesomeIcon icon={faUser} className="h-4 w-4" /> Demo user
        </button>
        <button className={buttonClassName("ghost", "w-full justify-start")}>
          <FontAwesomeIcon icon={faGear} className="h-4 w-4" /> Settings
        </button>
      </div>
    </DetailsDropdown>
  );
}

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const activeHref = links.find((link) => isActivePath(pathname, link.href))?.href ?? "/";
  const isMoreActive = moreLinks.some((link) => link.href === activeHref);

  const handleNavigate = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (isActivePath(pathname, href)) return;
    event.preventDefault();
    const navigate = () => router.push(href);
    const viewTransitionDocument = document as ViewTransitionDocument;
    if (viewTransitionDocument.startViewTransition) viewTransitionDocument.startViewTransition(navigate);
    else navigate();
  };

  return (
    <>
      <header className="sticky top-0 z-30 hidden border-b border-action-strong text-on-action lg:block">
        <div className="navigation-bar">
          <div className="nav-desktop-shell">
            <Link href="/" onClick={handleNavigate("/")} className="nav-brand">
              PyTrade
            </Link>
            <nav className="nav-desktop-links" aria-label="Primary navigation">
              {links.map((link) => (
                <ButtonLink
                  key={link.href}
                  href={link.href}
                  variant="plain"
                  onClick={handleNavigate(link.href)}
                  aria-current={link.href === activeHref ? "page" : undefined}
                  className={
                    link.href === activeHref
                      ? "nav-bar-button nav-bar-button-active"
                      : "nav-bar-button"
                  }
                >
                  <FontAwesomeIcon icon={link.icon} className="h-4 w-4" />
                  {link.label}
                </ButtonLink>
              ))}
            </nav>
            <UserMenu />
          </div>
        </div>
      </header>

      <header className="sticky top-0 z-30 hidden border-b border-action-strong text-on-action md:block lg:hidden">
        <div className="navigation-bar">
          <div className="nav-tablet-shell">
            <Link href="/" onClick={handleNavigate("/")} className="nav-brand">
              PyTrade
            </Link>
            <nav className="nav-tablet-links" aria-label="Primary navigation">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={handleNavigate(link.href)}
                  aria-current={link.href === activeHref ? "page" : undefined}
                  aria-label={link.label}
                  title={link.label}
                  className={
                    link.href === activeHref
                      ? "nav-tablet-button nav-tablet-button-active"
                      : "nav-tablet-button"
                  }
                >
                  <FontAwesomeIcon icon={link.icon} className="h-4 w-4" />
                </Link>
              ))}
            </nav>
            <UserMenu compact />
          </div>
        </div>
      </header>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
        <Link
          href="/"
          onClick={handleNavigate("/")}
          className="text-base font-semibold tracking-normal text-action-strong"
        >
          PyTrade
        </Link>
        <UserMenu compact mobile />
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-action-strong bg-surface px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 shadow-[var(--shadow-mobile-nav)] md:hidden" aria-label="Primary navigation">
        {mobileLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={handleNavigate(link.href)}
            aria-current={link.href === activeHref ? "page" : undefined}
            className={
              link.href === activeHref
                ? "mobile-nav-button mobile-nav-button-active"
                : "mobile-nav-button"
            }
          >
            <FontAwesomeIcon icon={link.icon} className="h-4 w-4" />
            <span>{link.label}</span>
          </Link>
        ))}
        <DetailsDropdown className="relative">
          <summary
            className={
              isMoreActive
                ? "mobile-nav-button mobile-nav-button-active"
                : "mobile-nav-button"
            }
            aria-label="Open more navigation"
          >
            <FontAwesomeIcon icon={faBars} className="h-4 w-4" />
            <span>More</span>
          </summary>
          <div className="absolute bottom-[calc(100%+0.5rem)] right-1 grid w-52 gap-1 rounded-md border border-border bg-surface p-2 shadow-xl">
            {moreLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={handleNavigate(link.href)}
                className="flex h-10 items-center gap-3 rounded px-3 text-sm font-medium text-foreground hover:bg-interactive-surface"
              >
                <FontAwesomeIcon icon={link.icon} className="h-4 w-4 text-action" />
                {link.label}
              </Link>
            ))}
          </div>
        </DetailsDropdown>
      </nav>
    </>
  );
}
