import { describe, expect, it } from 'vitest'
import { isTextField, shortcutFor } from './shortcuts'

const key = (k: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
})

describe('shortcutFor', () => {
  it.each([
    [key('z', { ctrlKey: true }), 'undo'],
    [key('z', { metaKey: true }), 'undo'],
    [key('Z', { ctrlKey: true, shiftKey: true }), 'redo'],
    [key('y', { ctrlKey: true }), 'redo'],
    [key('z'), null],
    [key('z', { ctrlKey: true, altKey: true }), null],
    [key('x', { ctrlKey: true }), null],
  ])('%o → %s', (event, expected) => {
    expect(shortcutFor(event)).toBe(expected)
  })
})

describe('isTextField', () => {
  it('is true for text inputs, number inputs, textareas, selects and contenteditable', () => {
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    const number = Object.assign(document.createElement('input'), { type: 'number' })

    for (const el of [document.createElement('input'), number, document.createElement('textarea'), document.createElement('select')]) {
      expect(isTextField(el)).toBe(true)
    }
    // jsdom does not compute isContentEditable, so check the attribute route via a real-ish stub.
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    expect(isTextField(editable)).toBe(true)
  })

  it('is false for buttons, sliders, checkboxes and the page itself', () => {
    const range = Object.assign(document.createElement('input'), { type: 'range' })
    const checkbox = Object.assign(document.createElement('input'), { type: 'checkbox' })

    for (const el of [document.createElement('button'), range, checkbox, document.body, null]) {
      expect(isTextField(el)).toBe(false)
    }
  })
})
