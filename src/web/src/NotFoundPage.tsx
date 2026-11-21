import { Footer } from './components/Footer'
import { useEffect } from 'react'
import { TopBar } from './components/TopBar'
import ui from './ui/ui.module.css'
import { Link } from './Link'
import { paths } from './router'

export function NotFoundPage({ message = 'There is nothing at this address.' }: { message?: string }) {
  useEffect(() => {
    document.title = 'Not found · Card Creator'
  }, [])

  return (
    <>
    <TopBar crumbs={[{ label: 'Not found' }]} />
    <main className={ui.page}>
      <h1>Not found</h1>
      <p>{message}</p>
      <Link href={paths.home()}>Go to the home page</Link>
    </main>
      <Footer />
    </>
  )
}
