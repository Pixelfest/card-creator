// The block structure of just enough Markdown for assets/CREDITS.md: #/##/### headings,
// "- " lists and paragraphs. Inline formatting is rendered by Markdown.tsx.

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; text: string }

export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  let list: string[] | null = null

  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
    if (list) blocks.push({ kind: 'list', items: list })
    paragraph = []
    list = null
  }

  const withoutComments = markdown.replace(/<!--[\s\S]*?-->/g, '')
  for (const raw of withoutComments.split(/\r?\n/)) {
    const line = raw.trim()
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    const item = /^[-*]\s+(.*)$/.exec(line)
    if (!line) {
      flush()
    } else if (heading) {
      flush()
      blocks.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3, text: heading[2] })
    } else if (item) {
      if (paragraph.length) flush()
      list ??= []
      list.push(item[1])
    } else if (list) {
      list[list.length - 1] += ` ${line}`
    } else {
      paragraph.push(line)
    }
  }
  flush()
  return blocks
}
