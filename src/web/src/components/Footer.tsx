import { Link } from '../Link'
import { paths } from '../router'
import styles from './Footer.module.css'

export function Footer() {
  return (
    <footer className={styles.footer}>
      <Link href={paths.credits()}>Credits</Link>
    </footer>
  )
}
