# Media recipes

Commands for generating the images and video a prototype's fixtures reference.
The kit ships **no binary assets** — generating on demand keeps the skill small
and the assets fresh. Run only the recipes the plugin actually needs.

Generate media **before** fixtures. A fixture pointing at a file that does not
exist is invisible until something renders it, which is usually several phases
too late.

## The three placeholders that do ship

`media/placeholder-*.svg` are load-bearing, not decoration. Each backs a gap the
fixtures should deliberately contain, and each is served from
`Chrome.configure({ mediaPath })`.

| Asset | Stands in for |
| --- | --- |
| `placeholder-image.svg` | an image attachment carrying no `file` |
| `placeholder-video.svg` | a video attachment carrying no `poster` |
| `placeholder-unavailable.svg` | an attachment the `missing` predicate names, **and** any source the browser fails to load |

A failed load is loud: the tile swaps in the unavailable placeholder, gains
`.is-missing`, carries the reason in its `title`, and logs to the console. Leave
at least one fixture in each of the three shapes — a complete fixture set never
reaches any of these paths, so they go unexercised precisely where they matter.
Do not style `.is-missing` away, and do not delete these three files when
trimming unused kit assets.

## Images

Write SVGs directly — no toolchain, and they scale without artefacts. Vary the
aspect ratios **deliberately**: a fixture set of uniform squares hides
contain-fitting bugs, thumbnail-ratio bugs and layout bugs that only appear when
something is taller than it is wide.

A usable spread for a dozen images: `1200×1200`, `1600×1000`, `1000×1400`,
`1400×1000`, `900×1600`, `1600×900`.

```bash
cat > assets/media/item-01.svg <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">
  <rect width="1600" height="1000" fill="#dfe7f0"/>
  <circle cx="800" cy="470" r="260" fill="#7fa8d4"/>
  <text x="800" y="900" text-anchor="middle" font-family="Segoe UI,Helvetica,sans-serif"
        font-size="64" fill="#33475e">item-01 · 1600×1000</text>
</svg>
SVG
```

Label every generated image with its own filename and dimensions. When a
thumbnail renders at the wrong size or the wrong item appears in a slot, the
label says so without measuring anything.

## Video

Real `<video>` elements with real files, not a mocked player. Autoplay, muting,
looping and — the one that matters — **autoplay rejection** then become genuine
browser behaviour. A fake player that always plays cannot falsify an autoplay
policy, so a spec rule about it stays unverified while looking verified.

That is for the screen that plays something. The kit's Media Library grid
renders a video as its poster plus a play affordance instead: a `<video>` aimed
at a file that was never generated reports `videoWidth: 0` and paints a blank
white tile with nothing on the console.

**Preferred — animated gradient, 6 seconds, silent:**

```bash
ffmpeg -y -f lavfi -i "gradients=size=1280x720:duration=6:speed=0.12:n=3" \
  -vf "drawtext=text='clip-01':fontcolor=white@0.85:fontsize=48:x=60:y=h-110" \
  -c:v libx264 -pix_fmt yuv420p -t 6 -r 24 assets/video/clip-01.mp4
```

**Fallback — when `gradients` is unavailable.** Some ffmpeg builds reject the
filter outright, and it rejects both `d=` and `duration=` when they do. Check
with `ffmpeg -filters | grep gradients` and use this instead:

```bash
ffmpeg -y -f lavfi -i "color=c=0x2b4a6f:size=1280x720:duration=6:rate=24" \
  -vf "drawbox=x='mod(t*180,1180)':y=280:w=100:h=100:color=0xf0b429:t=fill,\
drawtext=text='clip-01':fontcolor=white@0.85:fontsize=48:x=60:y=h-110" \
  -c:v libx264 -pix_fmt yuv420p -t 6 -r 24 assets/video/clip-01.mp4
```

The moving box matters: a static frame makes a paused player and a playing
player look identical, so nothing on screen distinguishes autoplay working from
autoplay silently failing.

**No ffmpeg at all.** Say so, and note in the README's *Not verified* list that
video behaviour was not exercised. Do not substitute an animated GIF or a CSS
animation behind a `<video>`-shaped wrapper — that reinstates the mocked player
this recipe exists to avoid.

**Poster frames** (a video's still image, and a fixture in its own right):

```bash
ffmpeg -y -i assets/video/clip-01.mp4 -vf "select=eq(n\,40)" -vframes 1 \
  assets/media/poster-clip-01.jpg
```

Leave at least one video without a poster, so `placeholder-video.svg` stands in
for it. The fallback chain — `poster` → `placeholder-video.svg`, and
`placeholder-unavailable.svg` for anything that then fails to load — only runs
when something is missing, so a complete fixture set never exercises it.

## Fixture hostnames

Use `example.com` and its subdomains — `cdn.example.com`, `videos.example.com`.

Reserved TLDs that look right and are not: `.test`, `.local`, `.localhost`,
`.internal`, `.invalid`. A plugin that validates URLs almost always blocks
local-network suffixes, and `.test` is on that list — fixtures written under it
are rejected by the prototype's own validation, which reads as a bug in the
engine for as long as it takes to find.

Bare IPs (`10.0.0.5`, `192.168.1.1`, `127.0.0.1`) are blocked by the same rules.
Keep one deliberately, as an adversarial fixture, and expect it to be rejected.

## Offline resolution

Remote URLs are never fetched. Map each one to a bundled file:

```js
var REMOTE_MAP = {
  'https://cdn.example.com/product/detail.jpg': 'assets/media/item-04.svg',
  'https://videos.example.com/product/tour.mp4': 'assets/video/clip-01.mp4'
};
```

Validation runs for real against the address the user typed; only *fetching* is
faked. The address shown and saved is always the remote one — a prototype that
rewrites the stored URL to a local path has changed the data model, not just the
transport.
