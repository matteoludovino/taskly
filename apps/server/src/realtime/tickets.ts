import { newSecret } from "../auth/secrets.ts";

export interface Grant {
  boardId: string;
  participantId: string;
}

/**
 * One-time passes to open a board's WebSocket. The browser can't send the participant cookie to the
 * server's own origin (the cookie belongs to the web app's), so it trades it for a ticket over the
 * same-origin REST API and presents the ticket in the handshake. Tickets live a minute, in memory, and
 * work once: a leaked handshake URL is useless.
 */
export class Tickets {
  private readonly grants = new Map<string, Grant & { expires: number }>();

  constructor(
    private readonly ttlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  issue(grant: Grant): string {
    this.sweep();
    const ticket = newSecret();
    this.grants.set(ticket, { ...grant, expires: this.now() + this.ttlMs });
    return ticket;
  }

  redeem(ticket: string | null): Grant | null {
    if (!ticket) return null;
    const grant = this.grants.get(ticket);
    this.grants.delete(ticket);
    if (!grant || grant.expires < this.now()) return null;
    return { boardId: grant.boardId, participantId: grant.participantId };
  }

  private sweep() {
    const now = this.now();
    for (const [ticket, grant] of this.grants) if (grant.expires < now) this.grants.delete(ticket);
  }
}
