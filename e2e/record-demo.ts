// Records docs/media/demo.gif: two windows on one board, side by side. Needs the production builds running
// (npm run build, then the API and `next start`), then: npx tsx e2e/record-demo.ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import type { BoardSnapshot, CreateBoardResponse } from "@taskly/shared";

const BASE = "http://localhost:3020";
const SIZE = { width: 880, height: 560 };
const dir = mkdtempSync(join(tmpdir(), "taskly-demo-"));
const pause = (page: Page, ms: number) => page.waitForTimeout(ms);
const tile = (page: Page, title: string) =>
  page.locator('[aria-roledescription="cartão arrastável"]').filter({ hasText: title });

const browser = await chromium.launch();
const contexts = await Promise.all(
  ["ana", "bruno"].map((name) =>
    browser.newContext({
      viewport: SIZE,
      locale: "pt-BR",
      recordVideo: { dir: join(dir, name), size: SIZE },
    }),
  ),
);
const [ana, bruno] = await Promise.all(contexts.map((c) => c.newPage()));
if (!ana || !bruno) throw new Error("no pages");

// A board with a few cards, made through the API as Ana.
const created = await ana.request.post(`${BASE}/api/boards`, {
  headers: { origin: BASE },
  data: { title: "Lançamento do app", name: "Ana", color: "#2563eb" },
});
const { boardId, key } = (await created.json()) as CreateBoardResponse;
const snapshot = (await (await ana.request.get(`${BASE}/api/boards/${boardId}`)).json()) as BoardSnapshot;
const [todo, doing] = Object.values(snapshot.board.columns).sort((a, b) =>
  a.position < b.position ? -1 : 1,
);
const op = (body: object) =>
  ana.request.post(`${BASE}/api/boards/${boardId}/ops`, {
    headers: { origin: BASE },
    data: { clientOpId: crypto.randomUUID(), op: body },
  });
for (const [title, column] of [
  ["Revisar textos da loja", todo],
  ["Testar em Android antigo", todo],
  ["Notas da versão", todo],
  ["Ajustar o onboarding", doing],
] as const) {
  await op({ type: "card.create", cardId: crypto.randomUUID(), columnId: column!.id, title });
}

const link = `${BASE}/b/${boardId}#k=${key}`;
await ana.goto(link);
await bruno.goto(link);
await bruno.getByLabel("Seu nome").fill("Bruno");
await bruno.getByRole("radio", { name: "Rosa" }).check({ force: true });
await pause(bruno, 600);
await bruno.getByRole("button", { name: "Entrar no quadro" }).click();
await pause(ana, 1500);

// Ana drags a card; it moves in Bruno's window.
const from = (await tile(ana, "Testar em Android antigo").boundingBox())!;
const to = (await ana.getByRole("region", { name: "Fazendo", exact: true }).locator("ol").boundingBox())!;
await ana.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
await ana.mouse.down();
await ana.mouse.move(to.x + to.width / 2, to.y + to.height + 20, { steps: 40 });
await ana.mouse.up();
await pause(ana, 1500);

// Bruno writes in that card's description; Ana opens it and watches him type.
await tile(bruno, "Testar em Android antigo").click();
await pause(bruno, 700);
await tile(ana, "Testar em Android antigo").click();
await pause(ana, 700);
const editor = bruno.getByRole("textbox", { name: "Descrição do cartão" });
await editor.click();
await bruno.keyboard.type("Testar no Moto G7 e no Galaxy A10, com a internet lenta.", { delay: 55 });
await pause(bruno, 600);
// Ana sets the priority; Bruno's dialog follows.
await ana.getByRole("dialog").getByLabel("Prioridade").selectOption("high");
await pause(ana, 2000);

await Promise.all(contexts.map((c) => c.close()));
await browser.close();

const video = (name: string) => join(dir, name, readdirSync(join(dir, name))[0]!);
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-i",
    video("ana"),
    "-i",
    video("bruno"),
    "-filter_complex",
    "[0:v][1:v]hstack=inputs=2,fps=10,scale=1200:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4",
    "-loop",
    "0",
    "docs/media/demo.gif",
  ],
  { stdio: "inherit" },
);
console.log("docs/media/demo.gif");
