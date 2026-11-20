import type { ReactNode } from 'react'
import { parseBlocks } from './parseMarkdown'

// Inline Markdown for CREDITS.md: **bold**, `code` and [links](https://…). Builds React
// elements, never HTML strings, so nothing in the file can inject markup.
const inlinePattern = /\*\*(.+?)\*\*|`(.+?)`|\[([^\]]+)\]\(([^)\s]+)\)/g

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(inlinePattern)) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const [, bold, code, linkText, href] = match
    const key = match.index
    if (bold !== undefined) nodes.push(<strong key={key}>{bold}</strong>)
    else if (code !== undefined) nodes.push(<code key={key}>{code}</code>)
    else if (/^https?:\/\//.test(href)) {
      nodes.push(
        <a key={key} href={href} target="_blank" rel="noreferrer">
          {linkText}
        </a>,
      )
    } else nodes.push(linkText)
    last = match.index + match[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function Markdown({ source }: { source: string }) {
  return (
    <>
      {parseBlocks(source).map((block, i) => {
        if (block.kind === 'heading') {
          const Tag = (['h2', 'h3', 'h4'] as const)[block.level - 1]
          return <Tag key={i}>{renderInline(block.text)}</Tag>
        }
        if (block.kind === 'list') {
          return (
            <ul key={i}>
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          )
        }
        return <p key={i}>{renderInline(block.text)}</p>
      })}
    </>
  )
}
