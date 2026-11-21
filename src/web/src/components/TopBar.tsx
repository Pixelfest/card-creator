import type { ReactNode } from 'react'
import { Link } from '../Link'
import { paths } from '../router'
import styles from './TopBar.module.css'

/** One step in the breadcrumb: a link to go back up, or (without `href`) the current page. */
export type Crumb = { label: ReactNode; href?: string }

/**
 * The bar across the top of every page: the app name (a link home), a breadcrumb to where you
 * are, and the page's own actions on the right.
 */
export function TopBar({ crumbs = [], children, className }: { crumbs?: Crumb[]; children?: ReactNode; className?: string }) {
  return (
    <header className={`${styles.bar} ${className ?? ''}`}>
      <nav aria-label="Breadcrumb" className={styles.nav}>
        <ol className={styles.crumbs}>
          <li className={styles.brand}>
            <Link href={paths.home()}>Card Creator</Link>
          </li>
          {crumbs.map((crumb, i) => (
            <li key={i} className={styles.crumb} aria-current={crumb.href ? undefined : 'page'}>
              {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : crumb.label}
            </li>
          ))}
        </ol>
      </nav>
      {children && <div className={styles.end}>{children}</div>}
    </header>
  )
}
