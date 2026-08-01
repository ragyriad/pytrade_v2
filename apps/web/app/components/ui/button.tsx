import Link from "next/link";
import { forwardRef } from "react";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "ghost" | "outline" | "solid" | "plain";

const base =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2";

const variants: Record<ButtonVariant, string> = {
  ghost: "text-muted hover:bg-primary-50 hover:text-primary-900",
  outline: "border border-border bg-surface text-primary-800 hover:bg-primary-50",
  solid: "bg-primary-700 text-on-primary hover:bg-primary-800",
  plain: "",
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

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(
  function ButtonLink(
    {
      variant = "ghost",
      className = "",
      href,
      ...props
    },
    ref
  ) {
    return (
      <Link
        ref={ref}
        href={href}
        className={buttonClassName(variant, className)}
        {...props}
      />
    );
  }
);
