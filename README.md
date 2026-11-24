# Qian 千

A calm, daily Mandarin practice app for the 1,000 words of the new HSK 1–3 (2025 syllabus) and core grammar.
It runs in the browser, installs to the iPhone home screen, and works offline after the first load.

## What's in it

- **Placement test** on first launch, so words you already know become light reviews instead of new lessons.
- **Daily run** of 5, 10, 15 or 20 minutes. Reviews come first, then new words (teach card → recognise → type the pinyin → use in a sentence), a grammar pattern on its day, and a sentence challenge.
- **Spaced repetition** with FSRS ([ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)). Each word has three skills, unlocked in stages: recognise → listen → produce.
- **Drills:** meaning pick, listen pick, pinyin typing (tone numbers or tone marks), fill the gap, sentence builder, grammar choice.
- **Progress map** of all 1,000 words, a searchable word list, and English / Thai meanings.
- **Design:** Apple-style grouped surfaces, system font for interface text, Kaiti (LXGW WenKai, SIL OFL) for every hanzi, light and dark mode. A cinnabar seal marks each finished day.
- Progress is stored on the device (IndexedDB). Settings → Backup saves and restores a JSON file.

## Content status

| | Words | Thai + examples | Grammar written |
| --- | --- | --- | --- |
| HSK 1 | 300 | 300 | 28 of 28 |
| HSK 2 | 200 | coming | 0 of 26 |
| HSK 3 | 500 | coming | 0 of 34 |

HSK 2–3 words can already be learned with English meanings; their example sentences and Thai meanings come next.

## Project layout

```
data/        official word list (from the HSK 3.0 syllabus PDF), grammar index, handwriting lists
content/     hand-written content: hsk1_*.txt (Thai, themes, example sentences), grammar1.txt
scripts/     build_data.py checks every sentence uses only words at its level, then writes src/data/
             build_font.py rebuilds public/fonts/kai.woff2 with just the characters the app uses
src/lib/     data, scheduler (FSRS), session planner, pinyin checking, storage, audio
src/ui/      screens and drills (Preact)
```

## Working on it

```sh
npm install
npm run dev          # local dev server
npm run build        # type-check + production build into dist/
```

To change content, edit the files in `content/`, then:

```sh
pip install jieba pypinyin
npm run data         # validates sentences and regenerates src/data/*.json
```

Content line format (`content/hsk1_*.txt`):
`id|English|Thai|theme|sentence 1|English|Thai|sentence 2|English|Thai`

## Deploying

Cloudflare Workers builds and deploys automatically on every push to `main`
(build: `npm run build`, deploy: `npx wrangler deploy`, config in `wrangler.jsonc`). Static assets are served free.
