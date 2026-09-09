import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Standard frame for every full-page section. Fluid so large monitors are actually used, with a
 * generous cap so tables don't stretch into unreadable rows on ultrawide displays.
 */
export function PageShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="page-shell" className={cn("mx-auto w-full max-w-[1600px] px-6 py-8 2xl:px-8", className)} {...props} />;
}
