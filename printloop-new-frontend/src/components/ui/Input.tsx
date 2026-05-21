import { InputHTMLAttributes, forwardRef } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
}

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ label, error, helper, className = "", id, ...rest }, ref) => {
    const inputId = id || rest.name;
    return (
      <div className="mb-3">
        {label && (
          <label htmlFor={inputId} className="editorial-label block mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`pl-input ${error ? "error" : ""} ${className}`}
          {...rest}
        />
        {error && <div className="text-xs text-persimmon font-semibold mt-1">{error}</div>}
        {!error && helper && <div className="text-xs text-fog font-medium mt-1">{helper}</div>}
      </div>
    );
  }
);
Input.displayName = "Input";
