/** Tailwind palette names used for sidebar item icon colors (shade 400 for swatches). */
export const ITEM_ICON_COLOR_IDS = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "slate",
] as const

export type ItemIconColorId = (typeof ITEM_ICON_COLOR_IDS)[number]

export type ItemIconColor = {
  id: ItemIconColorId
  label: string
  /** Full Tailwind class so JIT includes it (e.g. bg-sky-400). */
  swatchClass: string
}

const SWATCH_CLASS_BY_ID: Record<ItemIconColorId, string> = {
  red: "bg-red-400",
  orange: "bg-orange-400",
  amber: "bg-amber-400",
  yellow: "bg-yellow-400",
  lime: "bg-lime-400",
  green: "bg-green-400",
  emerald: "bg-emerald-400",
  teal: "bg-teal-400",
  cyan: "bg-cyan-400",
  sky: "bg-sky-400",
  blue: "bg-blue-400",
  indigo: "bg-indigo-400",
  violet: "bg-violet-400",
  purple: "bg-purple-400",
  fuchsia: "bg-fuchsia-400",
  pink: "bg-pink-400",
  rose: "bg-rose-400",
  slate: "bg-slate-400",
}

/** Maps legacy stored ids to the nearest Tailwind palette name. */
const LEGACY_COLOR_ALIASES: Record<string, ItemIconColorId> = {
  gray: "slate",
  brown: "orange",
  crimson: "red",
}

export const ITEM_ICON_COLORS: ItemIconColor[] = ITEM_ICON_COLOR_IDS.map((id) => ({
  id,
  label: id.charAt(0).toUpperCase() + id.slice(1),
  swatchClass: SWATCH_CLASS_BY_ID[id],
}))

const colorById = new Map(ITEM_ICON_COLORS.map((color) => [color.id, color]))

export function isItemIconColorId(value: string): value is ItemIconColorId {
  return colorById.has(value as ItemIconColorId)
}

export function resolveItemIconColorId(value: string | null | undefined): ItemIconColorId | null {
  if (!value) {
    return null
  }
  if (isItemIconColorId(value)) {
    return value
  }
  return LEGACY_COLOR_ALIASES[value] ?? null
}

export function isItemIconColorInput(value: string | null | undefined): boolean {
  return value == null || resolveItemIconColorId(value) !== null
}

export function getItemIconColor(id: string | null | undefined): ItemIconColor | null {
  const resolved = resolveItemIconColorId(id)
  if (!resolved) {
    return null
  }
  return colorById.get(resolved) ?? null
}

export function getItemIconSwatchClass(id: string | null | undefined): string | null {
  return getItemIconColor(id)?.swatchClass ?? null
}
