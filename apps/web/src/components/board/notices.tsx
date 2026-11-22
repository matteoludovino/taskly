import type { Notice } from "@/lib/use-board";

export function Notices({ notices }: { notices: Notice[] }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 grid justify-center gap-2 px-4"
    >
      {notices.map((notice) => (
        <p key={notice.id} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
          {notice.text}
        </p>
      ))}
    </div>
  );
}
