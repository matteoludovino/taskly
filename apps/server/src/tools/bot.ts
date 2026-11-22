// Usage: npm run bot -w @taskly/server -- "<invite link>" [--name Robô] [--every 1500] [--count 50]
//
// Joins the board in the invite link and keeps making changes, like a busy teammate. Handy to watch a
// board update live from another window, or to load one up.
import { parseArgs } from "node:util";
import { BotClient } from "./bot-client.ts";
import { randomOperation } from "./moves.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: "string", default: "Robô" },
    every: { type: "string", default: "1500" },
    count: { type: "string", default: "0" },
  },
});

const link = positionals[0];
if (!link) {
  console.error(
    'Usage: npm run bot -w @taskly/server -- "<invite link>" [--name Robô] [--every 1500] [--count 50]',
  );
  process.exit(1);
}
const url = new URL(link);
const boardId = url.pathname.split("/").at(-1)!;
const key = new URLSearchParams(url.hash.slice(1)).get("k");
if (!key) throw new Error("The link has no key (#k=…). Use the full invite link.");

const bot = new BotClient({ origin: url.origin, boardId, key, name: values.name, log: console.log });
await bot.join();
await bot.open();

const every = Number(values.every);
const count = Number(values.count);
let made = 0;
const timer = setInterval(() => {
  const op = randomOperation(bot.board());
  if (op) bot.submit(op);
  made += 1;
  if (count && made >= count) stop();
}, every);

async function stop() {
  clearInterval(timer);
  await bot.settled().catch(() => undefined);
  bot.close();
  process.exit(0);
}
process.on("SIGINT", () => void stop());
