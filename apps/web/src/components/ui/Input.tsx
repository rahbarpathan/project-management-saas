import React, { forwardRef, useId } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      leftAddon,
      rightAddon,
      id,
      className = '',
      disabled,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-semibold text-text-primary uppercase tracking-wider"
          >
            {label}
            {props.required && <span className="text-danger ml-1">*</span>}
          </label>
        )}

        <div className="relative flex items-center w-full">
          {leftAddon && (
            <div className="absolute left-3 flex items-center pointer-events-none text-text-muted">
              {leftAddon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : helperText ? helperId : undefined}
            className={`w-full rounded-md border bg-surface text-text-primary text-sm px-3.5 py-2 transition-colors placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50 disabled:cursor-not-allowed ${
              error
                ? 'border-danger focus-visible:ring-danger'
                : 'border-border hover:border-text-muted'
            } ${leftAddon ? 'pl-10' : ''} ${rightAddon ? 'pr-10' : ''} ${className}`}
            {...props}
          />

          {rightAddon && (
            <div className="absolute right-3 flex items-center pointer-events-none text-text-muted">
              {rightAddon}
            </div>
          )}
        </div>

        {error && (
          <p id={errorId} className="text-xs text-danger font-medium flex items-center gap-1 mt-0.5" role="alert">
            <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>{error}</span>
          </p>
        )}

        {!error && helperText && (
          <p id={helperId} className="text-xs text-text-muted mt-0.5">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
