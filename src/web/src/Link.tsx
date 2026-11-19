import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { navigate } from './router'

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }

/** An ordinary link that navigates in-app on a plain left click. */
export function Link({ href, onClick, ...rest }: LinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    const plainClick =
      event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
    if (!event.defaultPrevented && plainClick) {
      event.preventDefault()
      navigate(href)
    }
  }
  return <a href={href} onClick={handleClick} {...rest} />
}
