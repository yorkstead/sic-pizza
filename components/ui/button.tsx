import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius)] px-4 text-sm font-bold transition active:translate-y-px disabled:pointer-events-none disabled:opacity-45", {
  variants: { variant: {
    default: "border border-primary bg-primary text-primary-foreground shadow-xs hover:opacity-85",
    secondary: "border bg-secondary text-secondary-foreground hover:bg-muted", ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground", danger: "bg-danger text-white hover:brightness-110"
  }, size: { default: "h-11", lg: "h-13 px-6 text-base", icon: "size-11 px-0" } }, defaultVariants: { variant: "default", size: "default" }
});
export function Button({ className, variant, size, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) { return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />; }
