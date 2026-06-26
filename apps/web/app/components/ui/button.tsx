import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "ghost" | "outline" | "solid";

const base =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2";

const variants: Record<ButtonVariant, string> = {
  ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950",
  outline: "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
  solid: "bg-emerald-700 text-white hover:bg-emerald-800",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  href: string;
  variant?: ButtonVariant;
};

export function buttonClassName(variant: ButtonVariant = "outline", className = "") {
  return `${base} ${variants[variant]} ${className}`.trim();
}

export function Button({ variant = "outline", className = "", ...props }: ButtonProps) {
  return <button className={buttonClassName(variant, className)} {...props} />;
}

export function ButtonLink({
  variant = "ghost",
  className = "",
  href,
  ...props
}: ButtonLinkProps) {
  return <Link href={href} className={buttonClassName(variant, className)} {...props} />;
}
