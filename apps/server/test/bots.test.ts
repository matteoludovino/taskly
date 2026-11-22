import { createServer } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CreateBoardResponse } from "@taskly/shared";
import { buildApp } from "../src/app.ts";
import { BotClient } from "../src/tools/bot-client.ts";
import { randomOperation } from "../src/tools/moves.ts";
import { testDb } from "./support.ts";

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });

const db = testDb();
const port = await freePort();
// The bots talk to the server directly, so its own address is the origin they present.
const origin = `http://127.0.0.1:${port}`;
const app = await buildApp({ db, origins: [origin], publicWsUrl: `ws://127.0.0.1:${port}/ws` });

beforeAll(() => app.listen({ port, host: "127.0.0.1" }));
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe("bots on one board", () => {
  it("end up with exactly the server's board after many concurrent random changes", async () => {
    const create = await fetch(`${origin}/api/boards`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ title: "Bots", name: "Dona", color: "#2563eb" }),
    });
    const { boardId, key } = (await create.json()) as CreateBoardResponse;

    const bots = ["Robô 1", "Robô 2", "Robô 3"].map((name) => new BotClient({ origin, boardId, key, name }));
    for (const bot of bots) await bot.join();
    await Promise.all(bots.map((bot) => bot.open()));

    let seed = 42;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    await Promise.all(
      bots.map(async (bot) => {
        for (let i = 0; i < 40; i++) {
          const op = randomOperation(bot.board(), random);
          if (op) bot.submit(op);
          await new Promise((r) => setTimeout(r, random() * 10));
        }
      }),
    );
    await Promise.all(bots.map((bot) => bot.settled()));
    // Events still in flight to the other bots: give them a moment to arrive.
    const server = (await app.store.get(boardId))!;
    for (const bot of bots) {
      const deadline = Date.now() + 5000;
      while (bot.sync!.confirmed.seq < server.seq && Date.now() < deadline)
        await new Promise((r) => setTimeout(r, 20));
      expect(bot.sync!.confirmed).toEqual(server);
    }
    expect(server.seq).toBeGreaterThan(60);
    bots.forEach((bot) => bot.close());
  });
});
