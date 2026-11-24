import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from 'ts-fsrs'
import { db, type CardRow, type Facet } from './db'

let retention = 0.9
let scheduler = make()
function make() {
  return fsrs(generatorParameters({ request_retention: retention, enable_fuzz: true, enable_short_term: false }))
}
export function setRetention(r: number) {
  if (r !== retention) {
    retention = r
    scheduler = make()
  }
}

const DAY = 86_400_000

function toCard(row: CardRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review ? new Date(row.last_review) : undefined
  }
}

function fromCard(base: Pick<CardRow, 'id' | 'item' | 'facet' | 'introduced' | 'seeded'>, c: Card): CardRow {
  return {
    ...base,
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review?.getTime()
  }
}

export const cardId = (item: string, facet: Facet) => `${item}:${facet}`

export function newCard(item: string, facet: Facet, now = Date.now()): CardRow {
  return fromCard({ id: cardId(item, facet), item, facet, introduced: now }, createEmptyCard(new Date(now)))
}

/** A card for something the learner already knows: starts as a review with ~10 days stability,
 *  first check spread over the next 3 weeks so it isn't one big pile. */
export function seededCard(item: string, facet: Facet, now = Date.now()): CardRow {
  const due = now + Math.floor((1 + Math.random() * 20) * DAY)
  return {
    id: cardId(item, facet),
    item,
    facet,
    introduced: now,
    seeded: true,
    due,
    stability: 10,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: Math.round((due - now) / DAY),
    learning_steps: 0,
    reps: 1,
    lapses: 0,
    state: State.Review,
    last_review: now
  }
}

export async function review(row: CardRow, grade: Grade, drill: string, ms: number, correct: boolean) {
  const now = new Date()
  const next = scheduler.next(toCard(row), now, grade).card
  const updated = fromCard(row, next)
  await db.transaction('rw', db.cards, db.logs, async () => {
    await db.cards.put(updated)
    await db.logs.add({ card: row.id, ts: now.getTime(), rating: grade, drill, ms, correct })
  })
  return updated
}

/** Turn an auto-graded answer into an FSRS grade. */
export function gradeFrom(correct: boolean, ms: number, production: boolean): Grade {
  if (!correct) return Rating.Again
  if (ms > 15_000) return Rating.Hard
  if (production && ms < 5_000) return Rating.Easy
  if (!production && ms < 2_500) return Rating.Easy
  return Rating.Good
}

/** Grade for a newly taught item, from mistakes made on its learning ladder. */
export function gradeFromLadder(mistakes: number): Grade {
  return mistakes === 0 ? Rating.Good : mistakes === 1 ? Rating.Hard : Rating.Again
}

export { Rating, State }
