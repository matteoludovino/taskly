import { PARTICIPANT_COLORS } from "@taskly/shared";

const COLOR_NAMES: Record<(typeof PARTICIPANT_COLORS)[number], string> = {
  "#2563eb": "Azul",
  "#db2777": "Rosa",
  "#16a34a": "Verde",
  "#ea580c": "Laranja",
  "#7c3aed": "Roxo",
  "#0891b2": "Ciano",
  "#ca8a04": "Mostarda",
  "#dc2626": "Vermelho",
};

/** Name and colour: how the others will see you on the board (cursor, avatar, history). */
export function ParticipantFields({
  name,
  color,
  onName,
  onColor,
}: {
  name: string;
  color: string;
  onName: (value: string) => void;
  onColor: (value: string) => void;
}) {
  return (
    <>
      <label className="grid gap-1 text-sm font-medium text-zinc-700">
        Seu nome
        <input
          required
          maxLength={40}
          autoComplete="given-name"
          value={name}
          onChange={(e) => onName(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base font-normal text-zinc-900 focus:border-zinc-900 focus:outline-none"
        />
      </label>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium text-zinc-700">Sua cor</legend>
        <div className="flex flex-wrap gap-2">
          {PARTICIPANT_COLORS.map((value) => (
            <label key={value} className="cursor-pointer">
              <input
                type="radio"
                name="color"
                value={value}
                checked={color === value}
                onChange={() => onColor(value)}
                className="peer sr-only"
              />
              <span
                title={COLOR_NAMES[value]}
                className="block size-8 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-zinc-900 peer-focus-visible:ring-2 peer-focus-visible:ring-zinc-500"
                style={{ background: value }}
              />
              <span className="sr-only">{COLOR_NAMES[value]}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

export function randomColor(): string {
  return PARTICIPANT_COLORS[Math.floor(Math.random() * PARTICIPANT_COLORS.length)]!;
}
