import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "text" | "destructive";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: ButtonVariant;
  isLoading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
}

const VARIANT_CLASS_NAMES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  secondary: "bg-surface text-text border border-border hover:bg-surface-subtle",
  text: "bg-transparent text-accent hover:underline px-1",
  destructive: "bg-transparent text-danger border border-danger/30 hover:bg-danger-soft",
};

const SHARED_CLASS_NAMES =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 py-2.5 text-sm font-semibold " +
  "min-h-11 transition-colors duration-150 ease-out " +
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
      {isLoading ? (loadingLabel ?? "Working…") : children}
    </button>
  );
}
