import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "dark" | "ghost";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  arrow?: boolean;
  loading?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary: "pl-btn-primary",
  dark: "pl-btn-dark",
  ghost: "pl-btn-ghost",
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = "primary", arrow, loading, children, className = "", disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`${variantClass[variant]} ${className} ${
        disabled || loading ? "opacity-60 cursor-not-allowed" : ""
      }`}
      {...rest}
    >
      <span className="flex items-center gap-2">
        {loading ? <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : null}
        {children}
        {arrow ? <span className="font-extrabold transition-transform">→</span> : null}
      </span>
    </button>
  )
);
Button.displayName = "Button";
