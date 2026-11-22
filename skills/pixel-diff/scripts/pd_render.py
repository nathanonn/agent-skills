"""PNG evidence at native resolution and labeled overview/detail sheets."""
from pathlib import Path
from math import ceil, floor
import numpy as np
from PIL import Image, ImageDraw, ImageFont

MAGENTA = (235, 0, 150)
CYAN = (0, 155, 200)
TILE_W, TILE_H = 768, 600
BOX_LIMIT = 40
FONT = ImageFont.load_default(size=18)
SMALL = ImageFont.load_default(size=15)


def display(pixels):
    h, w = pixels.shape[:2]
    pattern = (((np.arange(h)[:, None] // 12) + (np.arange(w)[None, :] // 12)) % 2)
    checker = np.where(pattern, 218, 242).astype(np.uint8)
    background = Image.fromarray(checker).convert('RGBA')
    background.alpha_composite(Image.fromarray(pixels))
    return background.convert('RGB')


def mask_image(mask, color=MAGENTA):
    pixels = np.zeros((*mask.shape, 3), dtype=np.uint8)
    pixels[mask] = color
    return Image.fromarray(pixels)


def highlight(base, mask):
    pixels = np.array(base)
    pixels[mask] = (pixels[mask].astype(np.float32) * 0.35 + np.array(MAGENTA) * 0.65).astype(np.uint8)
    return Image.fromarray(pixels)


def annotate(im, areas, exclusions, origin=(0, 0), scale=1):
    draw = ImageDraw.Draw(im)
    ox, oy = origin
    shown = 0
    for area in areas:
        x, y, w, h = (area[k] for k in ('x', 'y', 'width', 'height'))
        left, top = floor((x - ox) * scale), floor((y - oy) * scale)
        right, bottom = ceil((x + w - ox) * scale) - 1, ceil((y + h - oy) * scale) - 1
        if right < 0 or bottom < 0 or left >= im.width or top >= im.height:
            continue
        if shown >= BOX_LIMIT:
            break
        left, top = max(0, left), max(0, top)
        right, bottom = min(im.width - 1, max(left, right)), min(im.height - 1, max(top, bottom))
        draw.rectangle((left, top, right, bottom), outline=MAGENTA, width=2)
        label = str(area['id'])
        tw = draw.textlength(label, font=SMALL) + 6
        tx, ty = min(left, max(0, im.width - tw)), min(top, max(0, im.height - 20))
        draw.rectangle((tx, ty, tx + tw, ty + 20), fill=MAGENTA)
        draw.text((tx + 3, ty), label, fill='white', font=SMALL)
        shown += 1
    for index, (x, y, w, h) in enumerate(exclusions, 1):
        left, top = floor((x - ox) * scale), floor((y - oy) * scale)
        right, bottom = ceil((x + w - ox) * scale) - 1, ceil((y + h - oy) * scale) - 1
        if right < 0 or bottom < 0 or left >= im.width or top >= im.height:
            continue
        left, top = max(0, left), max(0, top)
        right, bottom = min(im.width - 1, max(left, right)), min(im.height - 1, max(top, bottom))
        draw.rectangle((left, top, right, bottom), outline=CYAN, width=3)
        draw.text((left + 4, min(top + 21, max(0, im.height - 20))), f'X{index}', fill=CYAN, font=SMALL)


def sheet(ref, cand, mask, areas, exclusions, title, lines, origin=(0, 0), scale=1):
    size = (max(1, round(ref.width * scale)), max(1, round(ref.height * scale)))
    left = ref.resize(size, Image.Resampling.LANCZOS)
    right = cand.resize(size, Image.Resampling.LANCZOS)
    # Any changed native pixel marks its overview bin, even at extreme scales.
    ys = np.arange(size[1]) * mask.shape[0] // size[1]
    xs = np.arange(size[0]) * mask.shape[1] // size[0]
    small_mask = np.logical_or.reduceat(np.logical_or.reduceat(mask, ys, axis=0), xs, axis=1)
    diff = mask_image(small_mask)
    overlay = highlight(right, small_mask)
    annotate(overlay, areas, exclusions, origin, scale)
    pw, ph = max(500, size[0]), max(100, size[1])
    canvas = Image.new('RGB', (pw * 2 + 48, ph * 2 + 242), '#f4f5f7')
    draw = ImageDraw.Draw(canvas)
    draw.text((16, 12), title, fill='#171923', font=FONT)
    for i, line in enumerate(lines):
        draw.text((16, 40 + i * 22), line, fill='#30343d', font=SMALL)
    panels = [('REFERENCE', left), ('CANDIDATE', right), ('FULL-IMAGE DIFF', diff), ('CANDIDATE + CHANGES', overlay)]
    for i, (name, panel) in enumerate(panels):
        x, y = 16 + (i % 2) * (pw + 16), 148 + (i // 2) * (ph + 36)
        draw.text((x, y), name, fill='#30343d', font=SMALL)
        canvas.paste(panel, (x, y + 24))
    draw.text((16, canvas.height - 32), 'Magenta: changes/region IDs. Cyan X: verdict exclusions. Coordinates use original pixels.', fill='#30343d', font=SMALL)
    return canvas


def region_catalog(directory, areas):
    paths = []
    if len(areas) <= BOX_LIMIT:
        return paths
    for start in range(0, len(areas), 50):
        subset = areas[start:start + 50]
        page = Image.new('RGB', (950, 100 + 24 * len(subset)), 'white')
        d = ImageDraw.Draw(page)
        d.text((16, 16), 'Complete region index: ID | x, y | width x height | changed pixels', font=FONT, fill='black')
        for i, r in enumerate(subset):
            d.text((16, 60 + i * 24), f"{r['id']:5} | {r['x']:5}, {r['y']:5} | {r['width']:5} x {r['height']:5} | {r['changed_pixels']}", font=SMALL, fill='black')
        path = directory / f'regions-{start // 50 + 1:03}.png'
        page.save(path)
        paths.append(path)
    return paths


def render_mode(run, mode, ref, cand, mask, areas, exclusions, metrics, verdict, settings):
    directory = run / mode
    directory.mkdir()
    diff = mask_image(mask)
    diff.save(directory / 'diff.png')
    del diff
    overlay = highlight(cand, mask)
    annotate(overlay, areas, exclusions)
    overlay.save(directory / 'overlay.png')
    del overlay
    h, w = mask.shape
    scale = min(1, TILE_W / w, TILE_H / h)
    full, inc = metrics['full'], metrics['included']
    shared = [f"Full: {full['changed_pixels']:,}/{full['total_pixels']:,} changed ({full['changed_percent']:.6f}%). Included: {inc['changed_pixels']:,}/{inc['total_pixels']:,}.",
              f"Verdict: {verdict['state']} using {verdict['mode']}. Region boxes shown: at most {BOX_LIMIT}/view; {len(areas)} in JSON.",
              'Exact = every RGBA channel, including hidden RGB.' if mode == 'exact' else f"RGB threshold: {settings['color_threshold']}/255. AA filter: {settings['filter_antialiasing']}. Every alpha change counts."]
    name = 'comparison.png' if mode == 'exact' else 'tolerant-comparison.png'
    overview = sheet(ref, cand, mask, areas, exclusions,
                     f'{mode.upper()} | {w} x {h} | overview scale {scale:.4f}', shared, scale=scale)
    overview.save(run / name)
    paths = {'overview': name, 'diff': f'{mode}/diff.png', 'overlay': f'{mode}/overlay.png',
             'tiles': [], 'region_pages': []}
    if scale < 1:
        tiles = directory / 'tiles'
        tiles.mkdir()
        for y in range(0, h, TILE_H):
            for x in range(0, w, TILE_W):
                tw, th = min(TILE_W, w - x), min(TILE_H, h - y)
                box = (x, y, x + tw, y + th)
                tile = sheet(ref.crop(box), cand.crop(box), mask[y:y + th, x:x + tw], areas, exclusions,
                             f'{mode.upper()} | tile x={x}, y={y}, width={tw}, height={th} | scale 1:1',
                             shared, origin=(x, y))
                path = tiles / f'y{y:05}-x{x:05}.png'
                tile.save(path)
                paths['tiles'].append({'path': path.relative_to(run).as_posix(), 'x': x, 'y': y, 'width': tw, 'height': th})
    paths['region_pages'] = [p.relative_to(run).as_posix() for p in region_catalog(directory, areas)]
    return paths
