// Names, paths and stored values reach the model only as cleaned, quoted data,
// so a line break or a phrase inside one can never pose as an instruction.

const MAX_VALUE_CHARS = 200

/** One line of plain text: control and format characters removed, length bounded. */
export function cleanValue(value: string, max = MAX_VALUE_CHARS): string {
  const flat = value
    .replace(/\p{Cf}/gu, '')
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/** A cleaned value in double quotes; "<" is escaped so a value cannot close a data block. */
export function quoted(value: string, max?: number): string {
  return JSON.stringify(cleanValue(value, max)).replace(/</g, '\\u003c')
}
