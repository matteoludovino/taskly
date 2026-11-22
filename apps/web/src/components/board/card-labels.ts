import type { CardState, Priority } from "@taskly/shared";

export const PRIORITY_LABEL: Record<Priority, string> = { low: "Baixa", med: "Média", high: "Alta" };

export const PRIORITY_STYLE: Record<Priority, string> = {
  low: "bg-zinc-100 text-zinc-700",
  med: "bg-amber-100 text-amber-900",
  high: "bg-red-100 text-red-800",
};

const short = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });

/** "24 de dez." for a YYYY-MM-DD due date (a calendar day: no time zone shift). */
export function formatDue(date: string): string {
  return short.format(new Date(`${date}T00:00:00Z`));
}

export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isOverdue(card: Pick<CardState, "dueDate" | "completed">, now = new Date()): boolean {
  return card.dueDate !== null && !card.completed && card.dueDate < today(now);
}
