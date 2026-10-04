'use client'

import { color } from '@shakedown/tokens'
import { studioTheme } from 'ag-studio'

/**
 * The Returns Desk, as an AG Studio theme. Two colour modes, switched with the
 * `data-ag-theme-mode` attribute: Day shift (receipt paper) and Night shift (ink). Only money gets
 * colour: red ink for what would have leaked, teal for what is sealed, highlighter for "look here".
 * Everything else stays in ink and paper, so a chart's colour always means money.
 */

export const DAY = 'day-shift'
export const NIGHT = 'night-shift'

const fonts = {
  fontFamily: 'var(--sd-font-ui)',
  chartFontFamily: 'var(--sd-font-ui)',
  studioWidgetTitleFontFamily: 'var(--sd-font-display)',
  studioPanelHeaderFontFamily: 'var(--sd-font-display)',
}

export const consoleTheme = studioTheme
  .withParams(
    {
      ...fonts,
      browserColorScheme: 'light',
      backgroundColor: color.counter,
      foregroundColor: color.ink,
      textColor: color.ink,
      subtleTextColor: color.graphite,
      borderColor: color.perforation,
      accentColor: color.ink,
      rowHoverColor: color.receiptDim,
      studioCanvasBackgroundColor: color.paper,
      studioWidgetBackgroundColor: color.counter,
      studioWidgetBorderRadius: 10,
      studioWidgetTitleTextColor: color.ink,
      chartTextColor: color.ink,
      chartSubtleTextColor: color.graphite,
      chartAxisLineColor: color.perforation,
      chartGridLineColor: color.receiptDim,
      // Money at risk, in warm inks. Teal is kept back: on a chart it would read as "sealed".
      chartPaletteFills1Color: color.red600,
      chartPaletteFills2Color: '#D9622B',
      chartPaletteFills3Color: '#C9A400',
      chartPaletteFills4Color: color.pencil,
      chartPaletteFills5Color: color.smudge,
      chartPaletteFills6Color: color.red300,
      chartPaletteFills7Color: color.chalk3,
      chartPaletteFills8Color: color.perforation,
    },
    DAY,
  )
  .withParams(
    {
      ...fonts,
      browserColorScheme: 'dark',
      backgroundColor: color.inkPanel,
      foregroundColor: color.paper,
      textColor: color.paper,
      subtleTextColor: color.chalk2,
      borderColor: color.inkLine,
      accentColor: color.paper,
      rowHoverColor: color.inkRaised,
      studioCanvasBackgroundColor: color.ink,
      studioWidgetBackgroundColor: color.inkPanel,
      studioWidgetBorderRadius: 10,
      studioWidgetTitleTextColor: color.paper,
      chartTextColor: color.paper,
      chartSubtleTextColor: color.chalk2,
      chartAxisLineColor: color.inkLine,
      chartGridLineColor: color.inkRaised,
      chartPaletteFills1Color: color.red400,
      chartPaletteFills2Color: '#FF9F68',
      chartPaletteFills3Color: color.highlighter,
      chartPaletteFills4Color: color.chalk2,
      chartPaletteFills5Color: color.chalk3,
      chartPaletteFills6Color: color.red300,
      chartPaletteFills7Color: color.dusk,
      chartPaletteFills8Color: color.inkLine,
    },
    NIGHT,
  )
