"use client";

import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useState, useSyncExternalStore } from "react";
import { DESCRIPTION_MAX_CHARS, type ParticipantState } from "@taskly/shared";
import { DescriptionDoc, type DescriptionStatus } from "@/lib/description";
import type { LiveBoard } from "@/lib/live-board";

/** Dark or white text, whichever reads better on the participant's colour. */
function inkOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear(r!) + 0.7152 * linear(g!) + 0.0722 * linear(b!);
  return luminance > 0.3 ? "#18181b" : "#ffffff";
}

function renderCaret(user: Record<string, string>): HTMLElement {
  const caret = document.createElement("span");
  caret.classList.add("collaboration-carets__caret");
  caret.style.borderColor = user["color"] ?? "#71717a";
  const label = document.createElement("span");
  label.classList.add("collaboration-carets__label");
  label.style.backgroundColor = user["color"] ?? "#71717a";
  label.style.color = inkOn(user["color"] ?? "#71717a");
  label.textContent = user["name"] ?? "";
  caret.append(label);
  return caret;
}

const STATUS_TEXT: Record<string, string> = {
  loading: "Carregando a descrição…",
  synced: "",
  offline: "Sem conexão: o que você escrever vai quando ela voltar.",
  unavailable: "A descrição abre quando a conexão voltar.",
  not_found: "Esta descrição não está disponível.",
  too_large: "A descrição chegou ao limite de tamanho e não aceita mais alterações.",
};

const statusKey = (status: DescriptionStatus) => (typeof status === "string" ? status : status.denied);

/** The card's description, edited by everyone at once: one Yjs document, one cursor per person. */
export function DescriptionEditor({
  live,
  cardId,
  me,
}: {
  live: LiveBoard;
  cardId: string;
  me: ParticipantState;
}) {
  // One document per open dialog; created after mount (it subscribes over the socket), gone on close.
  const [session, setSession] = useState<DescriptionDoc | null>(null);
  useEffect(() => {
    const doc = new DescriptionDoc(live, cardId, { name: me.name, color: me.color });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the document is an external system
    setSession(doc);
    return () => doc.destroy();
  }, [live, cardId, me.name, me.color]);

  if (!session) return <p className="text-sm text-zinc-500">{STATUS_TEXT["loading"]}</p>;
  return <Editor key={session.doc.guid} session={session} me={me} />;
}

function Editor({ session, me }: { session: DescriptionDoc; me: ParticipantState }) {
  const status = useSyncExternalStore(session.subscribeStatus, session.getStatus, session.getStatus);
  const editable = DescriptionDoc.editable(status);

  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: [
      // Yjs keeps the history (undo only undoes your own changes).
      StarterKit.configure({
        undoRedo: false,
        heading: { levels: [3] },
        codeBlock: false,
        horizontalRule: false,
      }),
      Collaboration.configure({ document: session.doc, field: "description" }),
      CollaborationCaret.configure({
        provider: { awareness: session.awareness },
        user: { name: me.name, color: me.color },
        render: renderCaret,
      }),
      CharacterCount.configure({ limit: DESCRIPTION_MAX_CHARS }),
      Placeholder.configure({ placeholder: "Adicione detalhes, links, uma lista do que falta…" }),
    ],
    editorProps: {
      attributes: { "aria-label": "Descrição do cartão", class: "description-content" },
    },
  });

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  const characters: number = editor?.storage.characterCount.characters() ?? 0;
  const message = STATUS_TEXT[statusKey(status)];
  return (
    <div className="grid gap-1">
      <div
        className={`rounded-lg border px-3 py-2 ${editable ? "border-zinc-300 focus-within:border-zinc-900" : "border-zinc-200 bg-zinc-50"}`}
      >
        <EditorContent editor={editor} />
      </div>
      <div className="flex justify-between gap-3 text-xs text-zinc-500">
        <span role="status">{message}</span>
        {characters > DESCRIPTION_MAX_CHARS * 0.8 && (
          <span className="tabular-nums">
            {characters.toLocaleString("pt-BR")} / {DESCRIPTION_MAX_CHARS.toLocaleString("pt-BR")}
          </span>
        )}
      </div>
    </div>
  );
}
