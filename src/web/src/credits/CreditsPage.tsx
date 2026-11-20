import { useEffect } from 'react'
import { useCredits } from '../assets/api'
import { Footer } from '../components/Footer'
import { Link } from '../Link'
import { paths } from '../router'
import styles from './CreditsPage.module.css'
import { Markdown } from './Markdown'

export function CreditsPage() {
  const credits = useCredits()

  useEffect(() => {
    document.title = 'Credits · Card Creator'
  }, [])

  return (
    <>
      <main className={styles.page}>
        <Link href={paths.home()}>← Home</Link>
        <h1>Credits</h1>

        <section aria-labelledby="twemoji">
          <h2 id="twemoji">Emoji</h2>
          <p>
            Emoji graphics are from{' '}
            <a href="https://github.com/jdecked/twemoji" target="_blank" rel="noreferrer">
              Twemoji
            </a>
            , copyright Twitter, Inc. and other contributors, licensed under{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
              CC-BY 4.0
            </a>
            .
          </p>
        </section>

        <section className={styles.credits} aria-label="Asset credits">
          {credits.isPending && <p className={styles.hint}>Loading…</p>}
          {credits.isError && (
            <p role="alert" className={styles.error}>
              Couldn't load the credits.{' '}
              <button type="button" onClick={() => credits.refetch()}>
                Retry
              </button>
            </p>
          )}
          {credits.data && <Markdown source={credits.data.markdown} />}
        </section>
      </main>
      <Footer />
    </>
  )
}
