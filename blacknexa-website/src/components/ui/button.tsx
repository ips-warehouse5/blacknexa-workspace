import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "outline" | "ghost";
  children: ReactNode;
};

const base =
  "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[3px] px-6 text-[14.5px] font-semibold transition-[filter,transform,border-color,color] duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60";

export function Button({ variant = "solid", className = "", children, ...props }: ButtonProps) {
  const style =
    variant === "solid"
      ? { background: "var(--bn-accent)", color: "var(--bn-accent-foreground)" }
      : variant === "outline"
        ? {
            background: "transparent",
            color: "var(--bn-text-primary)",
            border: "1px solid var(--bn-border)",
          }
        : { background: "transparent", color: "var(--bn-text-secondary)", border: "0" };

  return (
    <button
      className={`${base} ${variant === "solid" ? "hover:brightness-110 active:translate-y-px" : "hover:border-accent hover:text-accent-text"} ${className}`}
      style={style}
      {...props}
    >
      {children}
    </button>
  );
}
