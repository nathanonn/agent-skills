# wp-rest-api

Push block markup, CSS and JS into a WordPress site over the core REST API with an admin Application Password. Uses curl and jq only.

Version 1.0.1 · Works with: Any agent · [SKILL.md](skills/wp-rest-api/SKILL.md)

## What it does

**Push generated block markup, CSS and animation JS into a live WordPress site over the core REST API — `curl` and `jq`, nothing else.**

Closes the last mile that used to be a copy-paste into the block editor's Code Editor. The markup is generated elsewhere; this skill transmits the bytes unchanged and then reports honestly on what the site did with them. A three-request preflight settles whether the site answers, whether the credential belongs to an administrator, and whether the active theme is a block theme — which decides whether the CSS route exists at all. Pages go through a slug-lookup upsert, because a colliding slug does not 409: WordPress appends `-2` and answers 201, so a create-first script reads as clean success while quietly making a duplicate nobody asked for. CSS lands on the user global-styles record as a deep merge and never a replace, because a naive replace destroys the site's entire colors, typography and variations record — and the skill scans for a single `<` first, which stores fine, renders fine, and makes Site Editor → Additional CSS reject the whole sheet. PHP and JS go through the Code Snippets plugin route, created inactive and switched on only after the error field comes back null. Verification is four steps, and the skill says out loud that only the last one — a human opening the page in the block editor — proves anything, because a byte-exact read-back and a green frontend both pass while the editor shows a recovery prompt.

## Say

- "publish this design to my site"
- "push this block markup to WordPress"
- "send this CSS to my site"
- "make this my front page"
- "add a GSAP animation to my WordPress site"

Slash command: `/wp-rest-api` (npx or manual install), `/wp-rest-api:wp-rest-api` (marketplace install).

## Example

```
/wp-rest-api Publish content/hero.html to https://example.com as the landing page
```

With a marketplace install, use `/wp-rest-api:wp-rest-api` instead.

## Requirements

`curl` and `jq` 1.6+, plus `grep` and `diff` for the verification steps. An admin **Application Password** on the target site, reached over `https` or loopback `http`. No MCP server, no CLI, no SSH, no database access. The CSS route needs a **block theme** — on a classic theme there is no global-styles record, and the skill says so and stops rather than guessing. The snippet route additionally needs the **Code Snippets** plugin installed and active, and asks before installing it or running anything.

Shared tools: see [Requirements](../../README.md#requirements).

## Supports

pages, the user global-styles record (`styles.css`), the static-front-page setting, and PHP/JS snippets via `code-snippets/v1`. Seven reference files cover the exact endpoints, the non-negotiable safety rules, five Gutenberg traps, the snippet route end to end, GSAP and scroll animation, troubleshooting, and two optional companions.

## Limits

Out of scope and said plainly rather than improvised around: template editing, media upload, menus, navigation, and block patterns.

## Install

```
/plugin install wp-rest-api@nathanonn-agent-skills
npx skills add nathanonn/agent-skills --skill wp-rest-api
```

More options: [docs/install.md](../../docs/install.md).
