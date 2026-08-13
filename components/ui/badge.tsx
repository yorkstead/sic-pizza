import * as React from "react";
import { cn } from "@/lib/utils";
export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) { return <span className={cn("inline-flex items-center rounded-full border bg-secondary px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground", className)} {...props} />; }
