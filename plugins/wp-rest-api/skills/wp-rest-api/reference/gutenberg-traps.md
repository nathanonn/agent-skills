# Gutenberg traps

Five ways correct-looking markup goes wrong after it is stored. Each entry says what the trap is and
how to find it yourself; **this skill assumes no validator.** If you are running a markup validator
(`reference/integrations.md`), the *If validating* row says whether it would have caught the trap —
four of the five it cannot, because a validator reads the markup and not the destination site.

The shared symptom to watch for: **the frontend looks right and the editor does not.** That is the
tell for traps 1, 2 and 4. Trap 5 inverts it — the frontend looks right and the editor throws a
recovery prompt.

---

## 1 · The editor width clamp — the root block must be `alignfull`

| | |
|---|---|
| **Symptom** | The page renders full-width on the frontend and clamped narrow inside the block editor. Looks like the CSS did not load. |
| **Cause** | Gutenberg clamps every root-level block in the editor iframe to `--wp--style--global--content-size`, using a selector carrying `:where(:not(.alignleft):not(.alignright):not(.alignfull))`. An unaligned root matches it. |
| **Fix** | Serialize the page's single root block as full-aligned. |
| **Detection** | Read your own markup. The outermost block comment must carry `"align":"full"` **and** its element must carry the `alignfull` class. No request to the site is needed. |
| **If validating** | **Not caught.** Markup with an unaligned root passes clean. |

```html
<!-- wp:group {"align":"full","className":"my-page"} -->
<div class="wp-block-group alignfull my-page">
```

Both halves are load-bearing: `"align":"full"` is the attribute Gutenberg round-trips, and the
`alignfull` **class** is what the selector's `:not()` actually sees. Ship one without the other and
you get half the fix.

This is **exclusion, not a specificity contest.** `:where(:not(.alignfull))` means the clamp does
not match the element at all. There is nothing to out-specify.

**The `.my-page.my-page` double-class workaround is dead.** It cannot work: the
clamp arrives in anonymous JS-injected `<style>` elements that land after everything the enqueue
system can reach. If older material proposes it, ignore that material.

---

## 2 · `width: auto`, never `width: 100%`

| | |
|---|---|
| **Symptom** | The full-width root overflows or sits off by a small, consistent amount. Invisible in a screenshot. |
| **Cause** | On an `alignfull` root, `width: 100%` resolves against the *containing block* while the negative alignfull margins pull the box outside it. The error is exactly one root padding, on both the frontend and the editor. |
| **Fix** | `width: auto` on that root. |
| **Detection** | `grep` the stylesheet for `width: 100%` on the root selector. |
| **If validating** | Not caught — this is CSS, not markup. |

Wrong every time, and never obvious. If a layout is "slightly off and I can't see why", check this
first.

---

## 3 · Never key any of this to a pixel constant

| | |
|---|---|
| **Symptom** | The fix works on the machine it was written on and breaks on the next site. |
| **Cause** | The clamp width is the theme's content-size setting, and it **varies widely between themes** — same mechanism, a different number on every site. |
| **Fix** | Express the fix structurally (`alignfull`, `width: auto`) or in terms of the CSS custom property. Never hardcode a breakpoint or a max-width that assumes a measured number. |
| **If validating** | Not caught. |

---

## 4 · A template with no `core/post-content` strips `alignfull` entirely

| | |
|---|---|
| **Symptom** | The block attribute is set, the block is valid, the markup is right — and `alignfull` is simply not on the DOM wrapper. |
| **Cause** | With no `core/post-content` block in the page's resolved template, the editor derives no constrained root layout, falls back to `is-layout-flow`, and strips the class. |
| **Fix** | Not a markup fix. Either the page uses a template that contains `core/post-content`, or the template gets one. That is a human decision — **say so and stop.** |
| **Detection** | `GET /wp/v2/templates/lookup?slug=<page-slug>&_fields=id,slug,type,source,content.raw` and look for `core/post-content` in `content.raw`. Trust only an **exact `slug` match** — the lookup hierarchy falls through to `page` / `singular` / `index` and will happily hand you a template that is not the one in play. |
| **If validating** | Not caught. It is a property of the *destination site*, not of the markup. |

This is the general failure mode of the entire "build me a front page" workflow. Warn about it;
never gate on it, and never silently transform the markup to work around it.

---

## 5 · A container block saves only its inner blocks

| | |
|---|---|
| **Symptom** | The page renders perfectly on the frontend. The next time anyone opens the editor: *"This block contains unexpected or invalid content"* and a recovery prompt. |
| **Cause** | Raw HTML, a bare `<div>` or `<span>`, or loose text placed as a **direct child** of a `core/group` — or any other container block — makes that block invalid. A container's save implementation emits only its inner blocks; anything else in the saved HTML fails the comparison. |
| **Fix** | Wrap the content in a real block. Every direct child of a container must itself be a block comment pair. |
| **Detection** | Scan the markup for any direct child of a container that is not itself a block comment pair. |
| **If validating** | **Caught** — reported as `invalid-saved-content`. The message **does not name the cause**, so if you see it on a `core/group`, look for a bare child element before anything else. |

The `core/html` escape hatch is not available here either. A `<style>` or `<script>` smuggled in as
raw HTML is non-portable, depends on the author's `unfiltered_html` capability, and a validator
classifies `core/html` as an error — so it cannot be called validated markup either way. CSS goes to
the global-styles record instead — see the skill's §4.

---

## Quick table

| Trap | Frontend | Editor | If validating |
|---|---|---|---|
| 1 · unaligned root | correct | clamped narrow | no |
| 2 · `width: 100%` | off by one padding | off by one padding | no |
| 3 · pixel constant | correct here, broken elsewhere | same | no |
| 4 · no `core/post-content` | correct | `alignfull` stripped | no |
| 5 · bare child of a container | correct | recovery prompt | **yes**, as `invalid-saved-content` |

Traps 1 and 5 are **generation** defects — they belong in whatever produced the markup, not in the
push step. If you are generating markup in the same session, fix them there and re-check. If the
markup arrived already made, report the trap and hand it back; do not rewrite it in transit.
