import { SelectHTMLAttributes, forwardRef } from "react";

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helper?: string;
  options: { value: string | number; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, Props>(
  ({ label, error, helper, className = "", id, options, children, ...rest }, ref) => {
    const selectId = id || rest.name;
    return (
      <div className="mb-3">
        {label && (
          <label htmlFor={selectId} className="editorial-label block mb-1.5">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`pl-input ${error ? "error" : ""} ${className}`}
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
          {children}
        </select>
        {error && <div className="text-xs text-persimmon font-semibold mt-1">{error}</div>}
        {!error && helper && <div className="text-xs text-fog font-medium mt-1">{helper}</div>}
      </div>
    );
  }
);
Select.displayName = "Select";