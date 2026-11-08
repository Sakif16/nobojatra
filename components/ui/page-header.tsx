import type { ReactNode } from "react";
import BackLink from "@/components/BackLink";

export default function PageHeader({ title, subtitle, back, actions }: { title: string; subtitle?: ReactNode; back?: { href: string; label: string }; actions?: ReactNode }) {
  return <header className="space-y-3">{back && <BackLink href={back.href} label={back.label} />}<div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>{subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}</div>{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}</div></header>;
}
