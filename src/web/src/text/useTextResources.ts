import { useMemo } from 'react'
import { useAssets } from '../assets/api'
import { useFonts } from './fonts'
import { canvasMeasurer } from './measure'
import { createTextResources, type TextResources } from './textResources'

/** Text resources once every library font has loaded (or failed); undefined until then. */
export function useTextResources(): TextResources | undefined {
  const manifest = useAssets().data
  const fonts = useFonts().data
  return useMemo(() => (fonts ? createTextResources(fonts, canvasMeasurer, manifest) : undefined), [fonts, manifest])
}
