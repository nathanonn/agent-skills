# Animation — shipping a CDN JS library to a page

GSAP + ScrollTrigger is the worked example. Every rule here holds for any animation library
loaded from a CDN.

The snippet **mechanics** — capability probe, scopes, the never-brick write sequence, `code_error`,
the panic button — are in `reference/code-snippets.md`. Read that first; this file covers only what
is specific to animation.

## There is no shortcut, and that is deliberate

| Route | Why it is not available |
|---|---|
| `<script>` or `<style>` inside a `core/html` block | non-portable, depends on the author's `unfiltered_html` capability, and cannot be called validated markup. A block validator rejects `core/html` outright |
| global-styles `styles.css` (the skill's §4) | takes **CSS only**. There is no JS field on the record |
| a `*-js` scoped snippet | see below |

So JS reaches the page exactly one way: a **PHP snippet that calls `wp_enqueue_script`**. That is
the route, not a workaround.

**Never ship JS as a `site-head-js` or `site-footer-js` snippet.** Those scopes are Pro-only. On
the free plugin the row is stored, the create returns 200, the activating write returns 200, and
the read-back shows `active:true, code_error:null` — while the payload has no execution path at
all and silently never runs. Ship a **PHP snippet scoped `front-end`** instead — `wp_enqueue_scripts`
is a front-end hook, so that scope is strictly narrower than `global` for no loss. `global` also
works; `reference/code-snippets.md` owns the scope table.

## Order of operations

Markup up and verified, then CSS up and verified, **then** the snippet. An animation layered onto
a page you have not yet confirmed renders gives you two suspects for one symptom.

## The snippet skeleton

`ns` is a namespace prefix — the author picks it; every
function, constant and CSS class the snippet touches carries it. No opening `<?php` tag: the
plugin stores and evaluates the body without one.

```php
if ( ! defined( 'NS_ANIM_VERSION' ) ) {
	define( 'NS_ANIM_VERSION', '3.15.0' );   // exact, never "latest"
}

if ( ! function_exists( 'ns_anim_is_target' ) ) {
	function ns_anim_is_target() {
		if ( is_admin() ) {
			return false;
		}
		if ( function_exists( 'wp_doing_ajax' ) && wp_doing_ajax() ) {
			return false;
		}
		if ( function_exists( 'wp_is_json_request' ) && wp_is_json_request() ) {
			return false;
		}
		if ( is_feed() || is_embed() ) {
			return false;
		}
		return is_front_page();   // or a slug check — never a hardcoded post ID
	}
}

if ( ! function_exists( 'ns_anim_inline_js' ) ) {
	function ns_anim_inline_js() {
		return <<<'JS'
(function () {
  "use strict";
  var root = document.querySelector(".ns-root");
  if (!root) { return; }
  var gsap = window.gsap, ScrollTrigger = window.ScrollTrigger;
  // Either library missing: leave the page exactly as served.
  if (!gsap || !ScrollTrigger || typeof gsap.matchMedia !== "function") { return; }
  gsap.registerPlugin(ScrollTrigger);
  // …build() inside gsap.matchMedia(), per the robustness contract below.
})();
JS;
	}
}

if ( ! function_exists( 'ns_anim_enqueue' ) ) {
	function ns_anim_enqueue() {
		if ( ! ns_anim_is_target() ) {
			return;
		}
		$ns_base = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/' . NS_ANIM_VERSION . '/';

		wp_enqueue_script( 'ns-gsap', $ns_base . 'gsap.min.js', array(), NS_ANIM_VERSION, true );
		wp_enqueue_script(
			'ns-gsap-scrolltrigger',
			$ns_base . 'ScrollTrigger.min.js',
			array( 'ns-gsap' ),          // dependency array is what orders the two tags
			NS_ANIM_VERSION,
			true                          // footer
		);
		// 'after' prints the init behind its dependency — no JS file has to be hosted anywhere.
		wp_add_inline_script( 'ns-gsap-scrolltrigger', ns_anim_inline_js(), 'after' );
	}
}

if ( ! has_action( 'wp_enqueue_scripts', 'ns_anim_enqueue' ) ) {
	add_action( 'wp_enqueue_scripts', 'ns_anim_enqueue' );
}
```

## Rules

| Rule | Why |
|---|---|
| Wrap **every** function declaration in `function_exists()` | a redeclare fatal in a global-scope snippet is evaluated before routing and takes the site, `/wp-json/` and `/wp-admin/` with it |
| Guard the `add_action` with `has_action()` | the same snippet body re-evaluated must not double-hook |
| NOWDOC `<<<'JS'`, **never** a heredoc `<<<JS` | a heredoc interpolates the `$` characters in the JavaScript and corrupts the payload silently |
| No opening `<?php` tag in the snippet body | the plugin stores and evaluates without one; send it and the server strips it, so every later diff reports drift that is not there |
| Gate the render: not `is_admin()`, not AJAX, not a REST/JSON request, not a feed or oEmbed | `wp_enqueue_scripts` is front-end only to begin with. The guard is belt and braces, and it costs nothing |
| Identify the page with `is_front_page()` or a slug check | **never a hardcoded post ID** — it is not portable and it is wrong the moment the page is recreated |
| Pin the library version exactly in the CDN URL | `latest` re-points under you between page loads. No SRI attributes: core has no first-class way to emit them, and a mismatched hash would kill the animation outright rather than degrade it — version pinning is the substitute |
| Namespace-prefix every function, constant, script handle and CSS selector | a snippet shares a global scope with the theme, every plugin, and every other snippet |

## The robustness contract — a requirement, not a description

**If the JS never loads, never parses, or is blocked, the page must be fully readable.** This is
the rule that makes shipping animation to someone else's site defensible.

| Requirement | How it is met |
|---|---|
| Nothing is hidden by CSS | no `opacity: 0`, `visibility: hidden` or off-screen transform in the stylesheet — ever |
| Every start state is written by JS at runtime | `gsap.set()` / `gsap.from()` inside the init, so the resting state is the state the browser already painted |
| Reduced motion means no motion | the whole build runs inside `gsap.matchMedia()` keyed on `(prefers-reduced-motion: no-preference)`; if the condition is false, nothing is set and nothing moves |
| Library missing ⇒ no-op | bail early when `window.gsap`, the plugin global, or the API you need is absent. Do not half-run |
| A trigger that never fires must not strand content | a timed failsafe that reads computed style and `clearProps` on anything still invisible |
| A `fromTo` resting state is the visible one | e.g. a progress rail animates `scaleY` 0 → 1, so with JS off it is a full bar, not an empty one |

A CSS start state is the one failure that turns a broken script into a blank page. No argument about
flashes of unstyled content justifies `opacity: 0` in the stylesheet.

## The performance contract

Transforms (`x`, `y`, `yPercent`, `scaleY`) and `opacity` **only**. Never animate `width`, `height`,
`top`, `left`, `margin` or `padding` — those hit layout on every frame.

## Verification

| # | Check | Who can run it |
|---|---|---|
| 1 | read the snippet back: `active` is `true`, `code_error` is null | you, over REST |
| 2 | unauthenticated `GET /` and `GET /wp-json/` — status and byte count against the preflight before-picture | you, over REST |
| 3 | the library globals are live: `typeof window.gsap`, `typeof window.ScrollTrigger` in the console | **browser only** |
| 4 | zero horizontal overflow at a desktop width and two narrow widths (e.g. 1440, 390, 380) | **browser only** |
| 5 | the hero heading and a late section both compute `opacity: 1` with JS disabled, or with reduced motion on | **browser only** |

Checks 3–5 cannot be done from `curl`. Say so, hand over the front-end URL, and ask for the result:
a 200 from the snippet route proves the code was stored, never that the animation runs or that the
page survives without it.
