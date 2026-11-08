import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> & {
  leading: ReactNode;
  title: ReactNode;
  pill?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  href?: string;
  staticRow?: boolean;
};

/** Trailing content should be non-interactive: the row itself is a button. */
export default function ListRow({ leading, title, pill, meta, trailing, selected, className, type = "button", href, staticRow, ...props }: Props) {
  const classes = cn("flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50", selected ? "border-primary bg-primary/5 shadow-[0_0_0_1px_var(--primary),0_0_24px_var(--route-accent-glow)]" : "border-transparent", !staticRow && !selected && "hover:bg-muted", className);
  const content = <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground">{leading}</span>
      <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">{title}{pill}</span>{meta && <span className="block text-xs text-muted-foreground">{meta}</span>}</span>
      {trailing && <span className="shrink-0">{trailing}</span>}
    </>;
  if (href) return <Link href={href} className={classes}>{content}</Link>;
  if (staticRow) return <div className={classes}>
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground">{leading}</span>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">{title}{pill}</div>{meta && <div className="text-xs text-muted-foreground">{meta}</div>}</div>
    {trailing && <div className="shrink-0">{trailing}</div>}
  </div>;
  return <button {...props} type={type} aria-pressed={selected} data-no-glow className={classes}>{content}</button>;
}
