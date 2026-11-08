import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Common = { children: ReactNode; icon?: ReactNode; selected?: boolean; className?: string };
type Props = Common & (
  | { href: string; label?: never; buttonProps?: never }
  | { href?: never; label?: false; buttonProps?: ButtonHTMLAttributes<HTMLButtonElement> }
  | { href?: never; label: true; buttonProps?: never }
);

export default function Chip(props: Props) {
  const { children, icon, selected, className } = props;
  const classes = cn("inline-flex min-h-9 items-center justify-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors", selected ? "border-primary bg-primary/10 text-primary" : "border-input bg-background/60 text-foreground", className);
  const content = <>{icon && <span aria-hidden="true" className="shrink-0">{icon}</span>}{children}</>;
  if ("label" in props && props.label) return <span className={classes}>{content}</span>;
  if (props.href) return <Link href={props.href} className={cn(classes, "hover:bg-muted")}>{content}</Link>;
  const buttonProps = props.buttonProps;
  return <button {...buttonProps} type={buttonProps?.type ?? "button"} aria-pressed={selected} className={cn(classes, "hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45")}>{content}</button>;
}
