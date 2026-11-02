import type { Extension } from '@codemirror/state'
import type { StreamParser } from '@codemirror/language'

// Header lines of FASTA (">") and FASTQ ("@", "+") files; sequence lines stay plain.
const sequenceHeaders: StreamParser<null> = {
  startState: () => null,
  token(stream) {
    if (stream.sol() && /[>@+]/.test(stream.peek() ?? '')) {
      stream.skipToEnd()
      return 'keyword'
    }
    stream.skipToEnd()
    return null
  },
}

// Short names a Markdown code block may carry, mapped to the names below.
const ALIASES: Record<string, string> = {
  py: 'python', js: 'javascript', ts: 'typescript', sh: 'shell', bash: 'shell', zsh: 'shell', console: 'shell',
  yml: 'yaml', rs: 'rust', rb: 'ruby', kt: 'kotlin', cs: 'csharp', 'c++': 'cpp', html: 'xml', jsonld: 'json',
  fa: 'fasta', fq: 'fastq',
}

/** The language name a code block's info string stands for. */
export function blockLanguage(info: string): string {
  const name = info.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  return ALIASES[name] ?? name
}

// Each syntax package loads in its own dynamic chunk, fetched only when a file
// of that language is previewed; unknown languages render as plain text.
export async function languageExtension(language?: string): Promise<Extension | null> {
  switch (language) {
    case 'json':
      return (await import('@codemirror/lang-json')).json()
    case 'javascript':
      return (await import('@codemirror/lang-javascript')).javascript()
    case 'jsx':
      return (await import('@codemirror/lang-javascript')).javascript({ jsx: true })
    case 'typescript':
      return (await import('@codemirror/lang-javascript')).javascript({ typescript: true })
    case 'tsx':
      return (await import('@codemirror/lang-javascript')).javascript({ typescript: true, jsx: true })
    case 'python':
      return (await import('@codemirror/lang-python')).python()
    case 'rust':
      return (await import('@codemirror/lang-rust')).rust()
    case 'yaml':
      return (await import('@codemirror/lang-yaml')).yaml()
    case 'sql':
      return (await import('@codemirror/lang-sql')).sql()
    case 'css':
      return (await import('@codemirror/lang-css')).css()
    case 'xml':
      return (await import('@codemirror/lang-xml')).xml()
    case 'shell': {
      const { StreamLanguage } = await import('@codemirror/language')
      const { shell } = await import('@codemirror/legacy-modes/mode/shell')
      return StreamLanguage.define(shell)
    }
    case 'toml': {
      const { StreamLanguage } = await import('@codemirror/language')
      const { toml } = await import('@codemirror/legacy-modes/mode/toml')
      return StreamLanguage.define(toml)
    }
    case 'properties': {
      const { StreamLanguage } = await import('@codemirror/language')
      const { properties } = await import('@codemirror/legacy-modes/mode/properties')
      return StreamLanguage.define(properties)
    }
    case 'c':
    case 'cpp':
    case 'java':
    case 'csharp':
    case 'kotlin': {
      const { StreamLanguage } = await import('@codemirror/language')
      const clike = await import('@codemirror/legacy-modes/mode/clike')
      return StreamLanguage.define(clike[language])
    }
    case 'go': {
      const { StreamLanguage } = await import('@codemirror/language')
      return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/go')).go)
    }
    case 'ruby': {
      const { StreamLanguage } = await import('@codemirror/language')
      return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/ruby')).ruby)
    }
    case 'swift': {
      const { StreamLanguage } = await import('@codemirror/language')
      return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/swift')).swift)
    }
    case 'r': {
      const { StreamLanguage } = await import('@codemirror/language')
      return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/r')).r)
    }
    case 'dockerfile': {
      const { StreamLanguage } = await import('@codemirror/language')
      return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/dockerfile')).dockerFile)
    }
    case 'fasta':
    case 'fastq': {
      const { StreamLanguage } = await import('@codemirror/language')
      return StreamLanguage.define(sequenceHeaders)
    }
    case 'diff': {
      const { StreamLanguage } = await import('@codemirror/language')
      return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/diff')).diff)
    }
    default:
      return null
  }
}
