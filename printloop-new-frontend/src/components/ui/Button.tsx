import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "dark" | "ghost";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  arrow?: boolean;
  loading?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary: "pl-btn-primary",
  dark: "pl-btn-dark",
  ghost: "pl-btn-ghost",
};

const sizeClass: Record<Size, string> = {
  sm: "pl-btn-sm",
  md: "",
  lg: "pl-btn-lg",
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = "primary", size = "md", arrow, loading, children, className = "", disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`${variantClass[variant]} ${sizeClass[size]} ${className} ${
        disabled || loading ? "opacity-60 cursor-not-allowed" : ""
      }`}
      {...rest}
    >
      <span className="flex items-center gap-2">
        {loading ? <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : null}
        {children}
        {arrow ? <span className="font-extrabold pl-arrow">→</span> : null}
      </span>
    </button>
  )
);
Button.displayName = "Button";
