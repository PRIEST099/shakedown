/** Shared geometry for the imp rig: one species, one rig, six costumes, on a 240×240 artboard. */

export type ImpState = 'idle' | 'running' | 'leak' | 'sealed' | 'inconclusive'

export const BODY_PATH =
  'M120 74 C154 74 170 102 170 136 C170 170 150 192 120 192 C90 192 70 170 70 136 C70 102 86 74 120 74 Z'

export const HORN_LEFT = 'M97 88 C92 72 89 60 92 48 C101 56 108 67 111 80 Z'
export const HORN_RIGHT = 'M143 88 C148 72 151 60 148 48 C139 56 132 67 129 80 Z'

export const TAIL_PATH = 'M164 170 C186 176 197 162 192 150'
export const TAIL_TIP = 'M192 138 C198 143 200 149 192 154 C184 149 186 143 192 138 Z'

export const LEGS = [
  'M106 189 C104 199 102 204 98 208',
  'M134 189 C136 199 138 204 142 208',
] as const

export interface Arm {
  d: string
  hand: readonly [number, number]
  /** Mirror the mitten so the thumb points inward. */
  flip?: boolean
}

export const DEFAULT_ARMS: readonly [Arm, Arm] = [
  { d: 'M74 142 C60 148 54 160 52 170', hand: [51, 174] },
  { d: 'M166 142 C180 148 186 160 188 170', hand: [189, 174], flip: true },
]
