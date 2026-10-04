'use client'

import type { AgWidgetApi, AgWidgetField, AgWidgetParams } from 'ag-studio'
import { useEffect, useRef, useState } from 'react'

/**
 * Shakedown's widgets know which tables they read, so they take their fields straight from the
 * report schema rather than asking the user to map them. Every read still goes through Studio's
 * data engine, so the page's filters and any cross-filter from another widget apply to it.
 */

export type Row = Record<string, unknown>

export function tableFields(
  api: AgWidgetApi,
  table: string,
  ids: readonly string[],
): AgWidgetField[] | undefined {
  const found = api.getSchema().find((entry) => entry.id === table)
  if (!found) return undefined
  const fields = ids.map((id) =>
    found.fields.find((field) => field.key === `${table}.${id}` || field.key.endsWith(`.${id}`)),
  )
  return fields.every(Boolean) ? (fields as AgWidgetField[]) : undefined
}

export interface ReadOptions {
  sortBy?: { id: string; direction: 'asc' | 'desc' }
  limit?: number
  /** Ignore cross-filters from other widgets, e.g. to list every campaign in scope. */
  ignoreCrossFilter?: boolean
}

/** Rows from one table, keyed by the plain field ids asked for. */
export async function readTable<T extends Row = Row>(
  api: AgWidgetApi,
  table: string,
  ids: readonly string[],
  options: ReadOptions = {},
): Promise<T[] | undefined> {
  const fields = tableFields(api, table, ids)
  if (!fields) return undefined
  const sortField = options.sortBy ? fields[ids.indexOf(options.sortBy.id)] : undefined
  const response = await api.getData(
    {
      kind: 'flat',
      fields,
      sort:
        sortField && options.sortBy
          ? [{ field: sortField, direction: options.sortBy.direction }]
          : undefined,
      limit: options.limit ? { count: options.limit } : undefined,
    },
    { queryId: table, crossFilter: options.ignoreCrossFilter ? 'none' : 'filter' },
  )
  const rows = (response.results as unknown as { rows: Row[] }).rows
  return rows.map(
    (row) => Object.fromEntries(ids.map((id, i) => [id, row[fields[i]?.key ?? id]])) as T,
  )
}

/**
 * Load a widget's data each time Studio hands it new params (new data, a filter, a cross-filter),
 * and keep Studio's overlay honest: loading, then displayed or "no data".
 */
export function useWidgetData<T>(
  params: AgWidgetParams,
  load: (api: AgWidgetApi) => Promise<T | undefined>,
  isEmpty: (value: T) => boolean,
): T | undefined {
  const [value, setValue] = useState<T>()
  const loaded = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: params is the refresh signal, as Studio documents
  useEffect(() => {
    let current = true
    const api = params.widgetApi
    api.setDisplayState('loading', { prominent: !loaded.current })
    load(api)
      .then((next) => {
        if (!current) return
        const empty = next === undefined || isEmpty(next)
        loaded.current = !empty
        setValue(next)
        api.setDisplayState(empty ? 'noData' : 'displayed')
      })
      .catch(() => {
        if (current) api.setDisplayState('noData')
      })
    return () => {
      current = false
    }
  }, [params])
  return value
}

export const usd = (value: unknown) => `$${Number(value ?? 0).toFixed(2)}`

/** A date the data engine may hand back as a Date, an epoch number or an ISO string. */
export const toTime = (value: unknown) =>
  value instanceof Date ? value.getTime() : new Date(value as string | number).getTime() || 0

/** The most recent campaign among those in scope, so a widget never mixes two runs. */
export function latest<T extends { started_at?: unknown }>(rows: readonly T[]): T | undefined {
  return [...rows].sort((a, b) => toTime(b.started_at) - toTime(a.started_at))[0]
}
