import { describe, expect, it } from "vitest";
import { formatDue, isOverdue, today } from "./card-labels";

describe("card labels", () => {
  it("formats due dates as calendar days", () => {
    expect(formatDue("2026-12-24")).toMatch(/24.*dez/);
  });

  it("uses the local calendar day for today", () => {
    expect(today(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("flags open cards past their due date", () => {
    const now = new Date(2026, 10, 22, 10);
    expect(isOverdue({ dueDate: "2026-11-21", completed: false }, now)).toBe(true);
    expect(isOverdue({ dueDate: "2026-11-22", completed: false }, now)).toBe(false);
    expect(isOverdue({ dueDate: "2026-11-21", completed: true }, now)).toBe(false);
    expect(isOverdue({ dueDate: null, completed: false }, now)).toBe(false);
  });
});
