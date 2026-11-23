import { expect, test } from "@playwright/test";
import { addCard, card, column, createBoard, drag, isLive, join, openCard, titlesIn } from "./helpers";

test("a card dragged in one window moves in the other", async ({ browser }) => {
  const ana = await (await browser.newContext()).newPage();
  const bruno = await (await browser.newContext()).newPage();
  const link = await createBoard(ana, "Mudança", "Ana");
  await join(bruno, link, "Bruno");
  await addCard(ana, "A fazer", "Comprar caixas");
  await expect(card(bruno, "Comprar caixas")).toBeVisible();

  await drag(ana, card(ana, "Comprar caixas"), column(ana, "Fazendo").locator("ol"));
  await expect.poll(() => titlesIn(bruno, "Fazendo")).toEqual(["Comprar caixas"]);
  expect(await titlesIn(bruno, "A fazer")).toEqual([]);
});

test("offline edits merge when the network returns, and a contested field goes to the tray", async ({
  browser,
}) => {
  const anaContext = await browser.newContext();
  const brunoContext = await browser.newContext();
  const ana = await anaContext.newPage();
  const bruno = await brunoContext.newPage();
  const link = await createBoard(ana, "Sprint", "Ana");
  await join(bruno, link, "Bruno");
  await addCard(ana, "A fazer", "Frete");
  await expect(card(bruno, "Frete")).toBeVisible();

  await brunoContext.setOffline(true);
  await expect(bruno.locator("header").getByRole("status")).toContainText("Sem conexão");

  // Both work while apart: separate cards, and the same field of the same card.
  await addCard(bruno, "Fazendo", "Do Bruno, offline");
  await openCard(bruno, "Frete");
  await bruno.getByRole("dialog").getByLabel("Prioridade").selectOption("low");
  await addCard(ana, "Feito", "Da Ana, online");
  await openCard(ana, "Frete");
  await ana.getByRole("dialog").getByLabel("Prioridade").selectOption("high");
  await ana.getByRole("dialog").getByRole("button", { name: "Fechar" }).click();

  await brunoContext.setOffline(false);
  await isLive(bruno);
  // Everything merged on both sides…
  for (const page of [ana, bruno]) {
    await expect(card(page, "Do Bruno, offline")).toBeVisible();
    await expect(card(page, "Da Ana, online")).toBeVisible();
  }
  // …except the priority both changed: Bruno chooses.
  const choice = bruno.getByRole("dialog").getByRole("alert");
  await expect(choice).toContainText("Ana mudou a prioridade para Alta");
  await choice.getByRole("button", { name: "Manter o meu" }).click();
  await expect(card(ana, "Frete")).toContainText("Baixa");
});

test("two people type in the same description", async ({ browser }) => {
  const ana = await (await browser.newContext()).newPage();
  const bruno = await (await browser.newContext()).newPage();
  const link = await createBoard(ana, "Textos", "Ana");
  await join(bruno, link, "Bruno");
  await addCard(ana, "A fazer", "Notas da versão");

  await openCard(ana, "Notas da versão");
  const anaEditor = ana.getByRole("textbox", { name: "Descrição do cartão" });
  await expect(anaEditor).toHaveAttribute("contenteditable", "true");
  await anaEditor.click();
  await ana.keyboard.type("Corrigido o login.");

  await openCard(bruno, "Notas da versão");
  const brunoEditor = bruno.getByRole("textbox", { name: "Descrição do cartão" });
  await expect(brunoEditor).toContainText("Corrigido o login.");
  // Ana's cursor shows on Bruno's side, with her name.
  await expect(bruno.locator(".collaboration-carets__label", { hasText: "Ana" })).toBeVisible();
  await brunoEditor.click();
  await bruno.keyboard.press("Control+End");
  await bruno.keyboard.type(" Novo ícone.");
  await ana.keyboard.press("Control+Home");
  await ana.keyboard.type("Versão 2: ");

  // The text itself, without the other people's cursor labels drawn inside it.
  const text = (editor: typeof anaEditor) =>
    editor.evaluate((el) => {
      const copy = el.cloneNode(true) as HTMLElement;
      copy.querySelectorAll(".collaboration-carets__label").forEach((label) => label.remove());
      return copy.textContent;
    });
  for (const editor of [anaEditor, brunoEditor]) {
    await expect.poll(() => text(editor)).toBe("Versão 2: Corrigido o login. Novo ícone.");
  }
});

test("reloading with changes not yet sent loses nothing", async ({ browser }) => {
  const ana = await (await browser.newContext()).newPage();
  const bruno = await (await browser.newContext()).newPage();
  // A connection that stops delivering what Ana sends (it stays open: no error, nothing arrives).
  let stuck = false;
  await ana.routeWebSocket(/\/ws/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      if (!stuck) server.send(message);
    });
    server.onMessage((message) => ws.send(message));
  });
  const link = await createBoard(ana, "Recarregar", "Ana");
  await join(bruno, link, "Bruno");

  stuck = true;
  await addCard(ana, "A fazer", "Feito antes de recarregar");
  await expect(card(bruno, "Feito antes de recarregar")).toHaveCount(0);

  // Leaving with unsent changes asks first.
  let asked = false;
  ana.on("dialog", (dialog) => {
    asked = dialog.type() === "beforeunload";
    void dialog.accept();
  });
  await ana.waitForTimeout(400); // the saved copy is written shortly after each change
  await ana.reload();
  expect(asked).toBe(true);

  // Back from the browser's storage, with the connection still stuck…
  await expect(card(ana, "Feito antes de recarregar")).toBeVisible();
  // …then the network recovers: the browser says so and the app reconnects at once.
  stuck = false;
  await ana.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });
  await isLive(ana);
  await expect(card(bruno, "Feito antes de recarregar")).toBeVisible();
});
