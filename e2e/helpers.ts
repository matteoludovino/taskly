import { expect, type Locator, type Page } from "@playwright/test";

export const column = (page: Page, title: string) => page.getByRole("region", { name: title, exact: true });
export const card = (page: Page, title: string) =>
  page.locator('[aria-roledescription="cartão arrastável"]').filter({ hasText: title });

export async function isLive(page: Page) {
  await expect(page.locator("header").getByRole("status").filter({ hasText: "Ao vivo" })).toBeVisible({
    timeout: 20_000,
  });
}

/** Creates a board from the landing page; returns its invite link. */
export async function createBoard(page: Page, title: string, name: string): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Nome do quadro").fill(title);
  await page.getByLabel("Seu nome").fill(name);
  await page.getByRole("button", { name: "Criar quadro" }).click();
  await page.waitForURL(/\/b\/[A-Za-z0-9]{10}#k=/);
  await isLive(page);
  return page.url();
}

export async function join(page: Page, link: string, name: string) {
  await page.goto(link);
  await page.getByLabel("Seu nome").fill(name);
  await page.getByRole("button", { name: "Entrar no quadro" }).click();
  await isLive(page);
}

export async function addCard(page: Page, columnTitle: string, title: string) {
  const list = column(page, columnTitle);
  await list.getByRole("button", { name: "+ Adicionar cartão" }).click();
  await list.getByRole("textbox", { name: "Título do cartão" }).fill(title);
  await list.getByRole("textbox", { name: "Título do cartão" }).press("Enter");
  await list.getByRole("textbox", { name: "Título do cartão" }).press("Escape");
  await expect(card(page, title)).toBeVisible();
}

export async function titlesIn(page: Page, columnTitle: string): Promise<string[]> {
  return column(page, columnTitle)
    .locator('[aria-roledescription="cartão arrastável"]')
    .evaluateAll((tiles) => tiles.map((t) => (t.getAttribute("aria-label") ?? "").split(";")[0]!));
}

/** Drags with real mouse movements (the drag library listens to mouse events, not HTML5 drag and drop). */
export async function drag(page: Page, from: Locator, to: Locator) {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + 30, { steps: 20 });
  await page.mouse.up();
}

export async function openCard(page: Page, title: string) {
  await card(page, title).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
