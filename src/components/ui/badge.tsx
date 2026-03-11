import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-[var(--primary)] text-white",
        secondary: "bg-[var(--background-tertiary)] text-[var(--foreground)]",
        destructive: "bg-[var(--destructive)] text-white",
        outline: "border border-[var(--border-secondary)] text-[var(--foreground)]",
        // Status variants for Git
        modified: "bg-[var(--status-modified)] text-black",
        added: "bg-[var(--status-added)] text-white",
        deleted: "bg-[var(--status-deleted)] text-white",
        untracked: "bg-[var(--status-untracked)] text-black",
        renamed: "bg-[var(--status-renamed)] text-black",
        conflict: "bg-[var(--status-conflict)] text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
