import { describe, expect, it } from 'vitest'
import { matchRoute } from './router'

describe('matchRoute', () => {
  it('matches the home page', () => {
    expect(matchRoute('/')).toEqual({ name: 'home' })
  })

  it('matches a Collection URL', () => {
    expect(matchRoute('/c/3f9XkQ2bL0aZ7yT1mN4pRs')).toEqual({
      name: 'collection',
      collectionId: '3f9XkQ2bL0aZ7yT1mN4pRs',
    })
  })

  it('matches a Set URL', () => {
    expect(matchRoute('/c/3f9XkQ2bL0aZ7yT1mN4pRs/s/aaaaaaaaaaaaaaaaaaaaaa')).toEqual({
      name: 'set',
      collectionId: '3f9XkQ2bL0aZ7yT1mN4pRs',
      setId: 'aaaaaaaaaaaaaaaaaaaaaa',
    })
  })

  it.each(['/c/', '/c/short', '/c/3f9XkQ2bL0aZ7yT1mN4pRs/s/short', '/c/3f9XkQ2bL0aZ7yT1mN4pRs-', '/nope'])('treats %s as not found', (path) => {
    expect(matchRoute(path)).toEqual({ name: 'notFound' })
  })
})
