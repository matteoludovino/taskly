// Usage: npm run load -w @taskly/server -- "<invite link>" [--clients 50] [--ops 100] [--every 100]
//
// Opens many connections to one board and measures how long each change takes to reach everyone:
// one client sends operations, the others note when each event arrives (same process, same clock).
// The server must run with TRUST_PROXY=true: each client presents its own address, as it would behind
// the web app's proxy, so the per-address limits on joining apply per client.
import { parseArgs } from "node:util";
import { uuidv7 } from "@taskly/shared";
import { BotClient } from "./bot-client.ts";
import { randomOperation } from "./moves.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    clients: { type: "string", default: "50" },
    ops: { type: "string", default: "100" },
    every: { type: "string", default: "100" },
  },
});
const link = new URL(positionals[0] ?? "");
const boardId = link.pathname.split("/").at(-1)!;
const key = new URLSearchParams(link.hash.slice(1)).get("k")!;
const clients = Number(values.clients);
const opsToSend = Number(values.ops);

const sentAt = new Map<string, number>();
/** Operations that became events (a random move can be a no-op: those reach nobody, rightly). */
const applied = new Set<string>();
const delays: number[] = [];
const bots: BotClient[] = [];
for (let i = 0; i < clients; i++) {
  const bot = new BotClient({
    origin: link.origin,
    boardId,
    key,
    name: `Carga ${i + 1}`,
    headers: { "x-forwarded-for": `10.0.${Math.floor(i / 250)}.${(i % 250) + 1}` },
    onEvent: (event) => {
      const sent = event.clientOpId ? sentAt.get(event.clientOpId) : undefined;
      if (sent === undefined) return;
      if (i === 0) applied.add(event.clientOpId!);
      else delays.push(performance.now() - sent);
    },
  });
  await bot.join();
  await bot.open();
  bots.push(bot);
}
await Promise.all(bots.map((bot) => bot.settled()));
console.log(`${clients} clients connected; sending ${opsToSend} operations…`);

const sender = bots[0]!;
for (let n = 0; n < opsToSend; n++) {
  const op = randomOperation(sender.board());
  if (op) {
    const clientOpId = uuidv7();
    sentAt.set(clientOpId, performance.now());
    sender.submitEnvelope({ clientOpId, op });
  }
  await new Promise((r) => setTimeout(r, Number(values.every)));
}
await new Promise((r) => setTimeout(r, 2000));

const sorted = [...delays].sort((a, b) => a - b);
const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
const expected = applied.size * (clients - 1);
console.log(
  JSON.stringify(
    {
      clients,
      operations: applied.size,
      deliveries: `${delays.length}/${expected}`,
      p50_ms: Math.round(at(50) * 10) / 10,
      p95_ms: Math.round(at(95) * 10) / 10,
      max_ms: Math.round(sorted.at(-1)! * 10) / 10,
    },
    null,
    2,
  ),
);
bots.forEach((bot) => bot.close());
process.exit(delays.length === expected ? 0 : 1);
