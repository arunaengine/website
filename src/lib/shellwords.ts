// Shell-style command-line tokenization for executor argv fields. This is NOT
// a shell: no expansion, globbing or pipes, just quoting rules so an argv can
// be typed (and round-tripped) as one natural line.
//
// Rules: tokens split on whitespace; single quotes group verbatim; double
// quotes group with backslash escapes for \" and \\ inside; commas and every
// other character are literal (--fields a,b,c stays one argument); an
// unterminated quote is a validation error.

export interface TokenizeResult {
  argv: string[]
  error: string | null
}

export function tokenizeCommand(input: string): TokenizeResult {
  const argv: string[] = []
  let current = ''
  let hasToken = false
  let i = 0
  while (i < input.length) {
    const ch = input[i]
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      if (hasToken) {
        argv.push(current)
        current = ''
        hasToken = false
      }
      i++
      continue
    }
    if (ch === "'") {
      const end = input.indexOf("'", i + 1)
      if (end === -1) return { argv: [], error: "Unterminated single quote (')." }
      current += input.slice(i + 1, end)
      hasToken = true
      i = end + 1
      continue
    }
    if (ch === '"') {
      i++
      let closed = false
      while (i < input.length) {
        const c = input[i]
        if (c === '\\' && i + 1 < input.length && (input[i + 1] === '"' || input[i + 1] === '\\')) {
          current += input[i + 1]
          i += 2
          continue
        }
        if (c === '"') {
          closed = true
          i++
          break
        }
        current += c
        i++
      }
      if (!closed) return { argv: [], error: 'Unterminated double quote (").' }
      hasToken = true
      continue
    }
    current += ch
    hasToken = true
    i++
  }
  if (hasToken) argv.push(current)
  return { argv, error: null }
}

// Joins an argv back into a line tokenizeCommand parses to the same argv:
// plain tokens stay bare, anything with whitespace or quote characters gets
// quoted (single quotes preferred, double quotes with escapes as fallback).
export function quoteCommand(argv: string[]): string {
  return argv.map(quoteToken).join(' ')
}

function quoteToken(token: string): string {
  if (token === '') return "''"
  if (!/[\s'"\\]/.test(token)) return token
  if (!token.includes("'")) return `'${token}'`
  return `"${token.replace(/[\\"]/g, (c) => `\\${c}`)}"`
}
