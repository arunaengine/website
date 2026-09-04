// A line-by-line comparison of two texts, used by the assistant's diff card.
// The inputs are capped where the card is created, so the table stays small.

export type DiffOp = 'same' | 'add' | 'remove'

export interface DiffLine {
  op: DiffOp
  text: string
}

/** The unified line comparison of two texts, over their longest common run. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const left = before.split('\n')
  const right = after.split('\n')
  const width = right.length + 1
  const common = new Uint32Array((left.length + 1) * width)
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      common[i * width + j] = left[i] === right[j]
        ? common[(i + 1) * width + j + 1] + 1
        : Math.max(common[(i + 1) * width + j], common[i * width + j + 1])
    }
  }
  const lines: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      lines.push({ op: 'same', text: left[i] })
      i += 1
      j += 1
    } else if (common[(i + 1) * width + j] >= common[i * width + j + 1]) {
      lines.push({ op: 'remove', text: left[i] })
      i += 1
    } else {
      lines.push({ op: 'add', text: right[j] })
      j += 1
    }
  }
  for (; i < left.length; i += 1) lines.push({ op: 'remove', text: left[i] })
  for (; j < right.length; j += 1) lines.push({ op: 'add', text: right[j] })
  return lines
}
