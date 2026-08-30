# Human Achievements

Live site (after Pages deploy): [https://pfaustino.github.io/human-achievements/](https://pfaustino.github.io/human-achievements/)

An interactive timeline of human invention from about **3.3 million years ago** to the present. Time is compressed in deep prehistory and expands toward today, so the acceleration of technology is visible. The catalog is built from Wikipedia’s [Timeline of historic inventions](https://en.wikipedia.org/wiki/Timeline_of_historic_inventions).

The playback, HUD, and GitHub Pages stack are adapted from [Death Atlas](https://github.com/pfaustino/death-atlas). The globe is gone; the hero is a zoomable, multi-era timeline.

```bash
npm install
npm run update-data
npm run dev
```

## Controls

| Action | How |
| --- | --- |
| Play / pause | Space or **Play** |
| Play through history | **Play history** |
| Previous / next milestone | ← → |
| Zoom | Scroll or pinch |
| Pan | Drag the timeline |
| Jump to an era | Era chips under the clock |
| Search | Name, inventor, place, category, era |
| Skip the opening card | **Skip** or Escape |

## Data

`npm run update-data` fetches the Wikipedia article through the MediaWiki API (wikitext, not live HTML scraping), normalizes dates, and writes `data/inventions.json`. Curated significance, tiers, and “why it matters” text live in `scripts/overrides.mjs` and are merged on import.

Prehistoric dates are archaeological estimates. The interface keeps them approximate (`c. 2.6 million years ago`, ranges, centuries) and distinguishes earliest-known evidence from later “invented in” claims.

Wikipedia text is used under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Every card links back to its article.

## Architecture

Death Atlas pieces that were reused:

- Vite + TypeScript + Vitest + GitHub Pages deploy
- Chronological playback with dwell, reverse, step, and a scrubber
- Overlay HUD (collapsible panels, keyboard, details card)
- Integer years with no year 0 (negative = BCE)

New for this project:

- Invention / overlapping-era data model
- Piecewise nonlinear time scale
- Canvas timeline with era bands, category lanes, and level-of-detail labels
- Wikipedia import script
