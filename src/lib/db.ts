import Dexie, { type Table } from 'dexie'
import type { State } from 'ts-fsrs'

/** One skill of one item. Words have rec / lis / pro; grammar patterns have gram. */
export type Facet = 'rec' | 'lis' | 'pro' | 'gram'

export type CardRow = {
  id: string // `${itemKey}:${facet}`
  item: string // 'w123' or 'g1-01'
  facet: Facet
  due: number // ms
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: State
  last_review?: number
  introduced: number // ms, when first taught or seeded
  seeded?: boolean // marked known by the placement test
}

export type LogRow = {
  id?: number
  card: string
  ts: number
  rating: number
  drill: string
  ms: number
  correct: boolean
}

export type KV = { key: string; value: unknown }

class AppDB extends Dexie {
  cards!: Table<CardRow, string>
  logs!: Table<LogRow, number>
  kv!: Table<KV, string>
  constructor() {
    super('bao-hsk') // internal storage name from the first version; kept so saved progress survives
    this.version(1).stores({
      cards: 'id, item, facet, due, state',
      logs: '++id, card, ts',
      kv: 'key'
    })
  }
}

export const db = new AppDB()

export async function getKV<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key)
  return row ? (row.value as T) : fallback
}
export async function setKV(key: string, value: unknown) {
  await db.kv.put({ key, value })
}

/** Ask the browser to keep our storage (helps on iOS home-screen apps). */
export async function requestPersist() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist()
  } catch {
    /* not supported */
  }
}

export async function exportAll(): Promise<string> {
  const [cards, logs, kv] = await Promise.all([db.cards.toArray(), db.logs.toArray(), db.kv.toArray()])
  return JSON.stringify({ app: 'qian', version: 1, exported: new Date().toISOString(), cards, logs, kv })
}

export async function importAll(json: string) {
  const data = JSON.parse(json)
  if (data.app !== 'qian' && data.app !== 'bao-hsk') throw new Error('This file is not a Qian backup.')
  await db.transaction('rw', db.cards, db.logs, db.kv, async () => {
    await Promise.all([db.cards.clear(), db.logs.clear(), db.kv.clear()])
    await db.cards.bulkPut(data.cards)
    await db.logs.bulkPut(data.logs)
    await db.kv.bulkPut(data.kv)
  })
}

export async function resetAll() {
  await db.transaction('rw', db.cards, db.logs, db.kv, async () => {
    await Promise.all([db.cards.clear(), db.logs.clear(), db.kv.clear()])
  })
}
