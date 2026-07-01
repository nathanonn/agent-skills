# The extractor: what it returns

`scripts/extract-tokens.js` runs inside the live page via `playwright-cli run-code` and
returns one compact JSON object (printed under playwright-cli's `### Result` header;
`scripts/slice-result.sh` strips the wrapper). It is the productionized version of the
nucleus proven on cursor.com — noise-filtered vars, mode-based visible-element sampling,
CTA/input detection, and forced hover/focus.

## Output shape

```jsonc
{
  "themeSignal": {              // drives dual-theme detection (Stage 2)
    "htmlClass": "dark",        // class on <html> — look for "dark"/"light"
    "dataTheme": "",            // data-theme attr on <html>
    "colorScheme": "normal",    // CSS color-scheme
    "prefersDark": false,       // matchMedia('(prefers-color-scheme: dark)')
    "bodyBg": "rgb(255,255,255)" // current body background — lightness hints at theme
  },
  "vars":      { "--color-accent": "#f54e00", ... },  // noise-FILTERED :root tokens
  "varsExtra": { "--some-other-var": "...", ... },    // non-junk vars NOT in the keep-list
  "varsTotal": 252,            // total --* on :root (gauge of how much was filtered out)
  "elements": {                // mode computed-style per tag (most common value wins)
    "body": { "color": "...", "backgroundColor": "...", "fontFamily": "...", ... },
    "h1": {...}, "h2": {...}, "h3": {...}, "p": {...}, "a": {...},
    "input": {...}, "select": {...}, "textarea": {...},
    "button-primary": {...},   // the prominent hero CTA
    "input-field": {...}       // first visible main-content input
  },
  "states": {                  // forced via real Playwright actions; keep only if ≠ base
    "button-primary-hover": { "backgroundColor": "...", "boxShadow": "...", ... },
    "input-field-focus":   { "borderColor": "...", "boxShadow": "...", "outline": "...", ... }
  },
  "ctaText": "Get Started",    // label of the detected CTA — sanity-check it's a real button
  "notes": []                  // non-fatal per-section errors; [] is good
}
```

Each `elements.<tag>` carries: `color`, `backgroundColor`, `fontFamily`, `fontSize`,
`fontWeight`, `lineHeight`, `letterSpacing`, `borderRadius`, `padding`, `boxShadow`,
`borderColor`, `borderWidth`.

## How it avoids the known traps

- **Noise filter.** Keeps prefixes `--color- --text- --font- --font-weight- --radius-
  --spacing- --tracking- --leading- --breakpoint- --container- --max-width- --shadow-
  --blur-`; drops `--tw-* --_* --katex-* --media-* --animate-* --ease-* --duration*
  --number-flow*` and bare one-letter vars. Everything kept-but-not-matched lands in
  `varsExtra`.
- **Visible main-content only.** Excludes `header/footer/nav` and off-screen / `display:none`
  / zero-opacity elements, so a footer paragraph in `system-ui` can't masquerade as body type.
- **Mode, not first-match.** For each tag it samples up to 12 instances and takes the most
  common computed value — one outlier can't skew the result.
- **Prominent CTA.** Picks the largest visible main button in roughly the top 1.6 viewports
  (the hero CTA), tags it `data-dmd-cta`, then hovers it for the `-hover` state.
- **Partial over throwing.** Every section is wrapped; a failure pushes to `notes` and
  returns what it has.

## When `vars` is thin — relax the filter (non-Tailwind sites)

If `vars` has very few entries but `varsTotal` is high, the site uses non-standard var
names. Pull candidates out of `varsExtra` (it holds the non-junk vars the keep-list missed)
and/or lean entirely on the `elements` computed styles — those are always precise even with
zero useful vars. See `edge-cases.md` (EC-FW.1 / no-design-system). The keep/drop lists live
at the top of `extract-tokens.js` and are easy to widen if you want to re-run.

## Invocation recap

```bash
S=designmd
playwright-cli -s=$S open "<url>"; sleep 2
playwright-cli -s=$S run-code "$(cat "$SKILL/scripts/extract-tokens.js")" \
  | bash "$SKILL/scripts/slice-result.sh" > "<out>/raw/tokens/tokens.<slug>.json"
# additional pages: `goto` instead of `open`, then the same run-code line.
# Intermediate artifacts live under <out>/raw/ (tokens/, components/, copy/, logs/, map.json);
# the DESIGN file(s) + screenshots/ stay at <out>/ root.
```
