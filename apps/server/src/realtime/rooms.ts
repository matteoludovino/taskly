import type { ServerMessage } from "@taskly/shared";

export interface Member {
  readonly boardId: string;
  readonly participantId: string;
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

  online(boardId: string): string[] {
    return [...new Set([...(this.boards.get(boardId) ?? [])].map((m) => m.participantId))];
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
