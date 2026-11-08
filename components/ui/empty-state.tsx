import type { ReactNode } from "react";

export default function EmptyState({ icon, title, description, action, pageHeading = false }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; pageHeading?: boolean }) {
  return <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-6 text-center">{icon && <span aria-hidden="true" className="text-muted-foreground">{icon}</span>}{pageHeading ? <h1 className="text-xl font-semibold text-foreground">{title}</h1> : <p className="text-sm font-medium text-foreground">{title}</p>}{description && <p className="text-sm text-muted-foreground">{description}</p>}{action}</div>;
}
