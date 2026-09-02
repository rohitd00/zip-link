import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "text" | "destructive" | "destructive-solid";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: ButtonVariant;
  isLoading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
}

const VARIANT_CLASS_NAMES: Record<ButtonVariant, string> = {
  // Section 7.2: "Accent fill, white text, clear hover/focus."
  primary: "bg-accent text-white shadow-[var(--shadow-card)] hover:bg-accent-hover",
  secondary:
    "bg-surface text-text border border-border shadow-[var(--shadow-card)] hover:border-border-strong hover:bg-surface-subtle",
  text: "bg-transparent text-accent hover:text-accent-hover px-1",
  destructive:
    "bg-transparent text-danger border border-danger/25 hover:bg-danger-soft hover:border-danger/40",
  // Reserved for the final button inside a destructive-action confirmation
  // dialog — the design spec calls for exactly one solid danger button in
  // the whole product, so every other destructive trigger stays outlined.
  "destructive-solid": "bg-danger text-white shadow-[var(--shadow-card)] hover:bg-danger/90",
};

const SHARED_CLASS_NAMES =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 py-2.5 text-sm font-medium " +
  "min-h-11 transition-all duration-150 ease-out " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The one button component used everywhere in the dashboard. A variant
 * prop selects the visual style instead of scattering conditional class
 * strings across call sites, per Section 17 of the design specification.
 */
export function Button({
  variant = "primary",
  isLoading = false,
  loadingLabel,
  children,
  disabled,
  type = "button",
  ...restProps
}: ButtonProps) {
  const variantClassName = VARIANT_CLASS_NAMES[variant];

  return (
    <button
      type={type}
      disabled={disabled === true || isLoading}
      className={`${SHARED_CLASS_NAMES} ${variantClassName}`}
      {...restProps}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {isLoading ? (loadingLabel ?? "Working…") : children}
    </button>
  );
}
