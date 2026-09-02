import type { InputHTMLAttributes } from "react";
import { useId } from "react";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  label: string;
  helperText?: string;
  errorMessage?: string;
}

/**
 * A labelled text input with helper text and an inline error slot. The
 * label always stays visible (placeholder text is never used as a label),
 * matching Section 7.3 of the design specification.
 */
export function TextField({ label, helperText, errorMessage, ...inputProps }: TextFieldProps) {
  const generatedId = useId();
  const inputId = inputProps.id ?? generatedId;
  const helperTextId = `${inputId}-helper`;
  const errorMessageId = `${inputId}-error`;
  const hasError = errorMessage !== undefined && errorMessage.length > 0;

  const describedByIds = [
    helperText !== undefined ? helperTextId : null,
    hasError ? errorMessageId : null,
  ]
    .filter((id) => id !== null)
    .join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-[13px] font-medium text-text">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={hasError}
        aria-describedby={describedByIds.length > 0 ? describedByIds : undefined}
        className={`min-h-11 rounded-[var(--radius-control)] border bg-surface px-3.5 py-2 text-sm text-text
          shadow-[var(--shadow-card)] outline-none transition-shadow duration-150
          placeholder:text-text-muted
          focus:border-accent focus:ring-[3px] focus:ring-accent-soft
          ${hasError ? "border-danger" : "border-border"}`}
        {...inputProps}
      />
      {helperText !== undefined && (
        <p id={helperTextId} className="text-xs text-text-muted">
          {helperText}
        </p>
      )}
      {hasError && (
        <p id={errorMessageId} role="alert" className="text-xs font-medium text-danger">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
