import type { Activity, Focus, ServerMessage } from "@taskly/shared";

export interface Member {
  readonly boardId: string;
  readonly participantId: string;
  /** What this connection is doing (editing or dragging a card), if anything. */
  readonly focus: Focus | null;
  /** Played by the server (the demo's simulated teammate): present, but not a person watching. */
  readonly virtual?: true;
  sendRaw(data: string): void;
}

/** Who is connected to each board. A participant with several tabs counts once. */
export class Rooms {
  private readonly boards = new Map<string, Set<Member>>();

  /** Returns true when this makes the participant newly online. */
  join(member: Member): boolean {
    const members = this.boards.get(member.boardId) ?? new Set();
    this.boards.set(member.boardId, members);
    const wasOnline = this.isOnline(member.boardId, member.participantId);
    members.add(member);
    return !wasOnline;
  }

  /** Returns true when this takes the participant offline. */
  leave(member: Member): boolean {
    const members = this.boards.get(member.boardId);
    if (!members?.delete(member)) return false;
    if (members.size === 0) this.boards.delete(member.boardId);
    return !this.isOnline(member.boardId, member.participantId);
  }

  /** Real people connected (the simulated teammate doesn't count). */
  humans(boardId: string): number {
    return [...(this.boards.get(boardId) ?? [])].filter((m) => !m.virtual).length;
  }

  online(boardId: string): string[] {
    return [...new Set([...(this.boards.get(boardId) ?? [])].map((m) => m.participantId))];
  }

  /** Every connection's current focus (a person with two tabs may show up twice). */
  activity(boardId: string): Activity[] {
    return [...(this.boards.get(boardId) ?? [])].flatMap((m) =>
      m.focus ? [{ participantId: m.participantId, ...m.focus }] : [],
    );
  }

  /** Serialized once, sent to every member, in call order. */
  broadcast(boardId: string, message: ServerMessage): void {
    const members = this.boards.get(boardId);
    if (!members?.size) return;
    const data = JSON.stringify(message);
    for (const member of members) member.sendRaw(data);
  }

  connections(boardId: string): number {
    return this.boards.get(boardId)?.size ?? 0;
  }

  private isOnline(boardId: string, participantId: string): boolean {
    for (const m of this.boards.get(boardId) ?? []) if (m.participantId === participantId) return true;
    return false;
  }
}
