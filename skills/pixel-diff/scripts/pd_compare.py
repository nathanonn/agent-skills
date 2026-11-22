"""Deterministic channel masks, conservative edge filtering, and display regions."""
from collections import deque
from decimal import Decimal
import numpy as np

REGION_CELL = 32
DEFAULT_COLOR_THRESHOLD = 2


def edge_noise(a, b):
    """Conservative AA heuristic: a shared, stable two-color neighborhood.

    Both centers must be opaque interior mixtures of two RGB endpoints, each
    supported by >=3 unchanged neighbors, with >=32 levels of contrast.
    This deliberately leaves ambiguous edges unfiltered.
    """
    h, w = a.shape[:2]
    output = np.zeros((h, w), dtype=bool)
    if min(h, w) < 3:
        return output
    for y in range(1, h - 1, 256):
        end = min(y + 256, h - 1)
        center_a = a[y:end, 1:-1, :3].astype(np.float32)
        center_b = b[y:end, 1:-1, :3].astype(np.float32)
        shape = center_a.shape
        low = np.full(shape, 255, np.uint8)
        high = np.zeros(shape, np.uint8)
        neighbors = []
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == dy == 0:
                    continue
                na = a[y + dy:end + dy, 1 + dx:w - 1 + dx]
                nb = b[y + dy:end + dy, 1 + dx:w - 1 + dx]
                stable = np.all(na == nb, axis=2) & (na[:, :, 3] == 255)
                rgb = na[:, :, :3]
                low = np.minimum(low, np.where(stable[:, :, None], rgb, 255))
                high = np.maximum(high, np.where(stable[:, :, None], rgb, 0))
                neighbors.append((rgb, stable))
        n_low = np.zeros(shape[:2], np.uint8)
        n_high = n_low.copy()
        for rgb, stable in neighbors:
            n_low += stable & np.all(rgb == low, axis=2)
            n_high += stable & np.all(rgb == high, axis=2)
        span = high.astype(np.float32) - low
        dominant = span.argmax(axis=2)[:, :, None]
        contrast = np.take_along_axis(span, dominant, axis=2)[:, :, 0]

        def mixture(center):
            delta = center - low
            t = np.take_along_axis(delta, dominant, axis=2)[:, :, 0] / np.maximum(contrast, 1)
            residual = np.max(np.abs(delta - t[:, :, None] * span), axis=2)
            return (t > 0) & (t < 1) & (residual <= 2)

        output[y:end, 1:-1] = ((n_low >= 3) & (n_high >= 3) & (contrast >= 32)
            & mixture(center_a) & mixture(center_b)
            & (a[y:end, 1:-1, 3] == 255) & (b[y:end, 1:-1, 3] == 255))
    return output


def masks(a, b, tolerant=False, color_threshold=DEFAULT_COLOR_THRESHOLD, filter_aa=False):
    exact = np.any(a != b, axis=2)
    result = {'exact': exact}
    if tolerant:
        color_change = np.zeros(exact.shape, dtype=bool)
        # One channel temporary at a time avoids a full int16 RGBA allocation.
        for channel in range(3):
            delta = np.abs(a[:, :, channel].astype(np.int16) - b[:, :, channel])
            color_change |= delta > color_threshold
        alpha_change = a[:, :, 3] != b[:, :, 3]
        if filter_aa:
            color_change &= ~edge_noise(a, b)
        result['tolerant'] = alpha_change | color_change
    return result


def inclusion(shape, rectangles):
    h, w = shape
    included = np.ones(shape, dtype=bool)
    for x, y, rw, rh in rectangles:
        if min(x, y) < 0 or min(rw, rh) <= 0 or x + rw > w or y + rh > h:
            raise ValueError(f'Exclusion {[x, y, rw, rh]} is invalid or outside {w}x{h}.')
        included[y:y + rh, x:x + rw] = False
    if not included.any():
        raise ValueError('Exclusions leave no pixels to evaluate.')
    return included


def measurements(mask, included):
    def metric(count, denominator):
        return {'changed_pixels': count, 'total_pixels': denominator,
                'changed_percent': 100 * count / denominator}
    return {'full': metric(int(mask.sum()), mask.size),
            'included': metric(int(np.count_nonzero(mask & included)), int(included.sum()))}


def verdict(results, mode, max_pixels, max_percent):
    count = results[mode]['included']['changed_pixels']
    total = results[mode]['included']['total_pixels']
    checks = {}
    if max_pixels is not None:
        checks['max_changed_pixels'] = count <= max_pixels
    if max_percent is not None:
        # Integer cross-multiplication avoids Decimal context rounding at long boundaries.
        numerator, denominator = Decimal(max_percent).as_integer_ratio()
        checks['max_changed_percent'] = count * 100 * denominator <= numerator * total
    state = 'not_evaluated' if not checks else ('pass' if all(checks.values()) else 'fail')
    return {'state': state, 'mode': mode, 'max_changed_pixels': max_pixels,
            'max_changed_percent': str(max_percent) if max_percent is not None else None,
            'checks': checks, 'denominator': total}


def regions(mask):
    """8-connected occupied 32px cells. Tight boxes/counts use actual pixels."""
    h, w = mask.shape
    cells = {}
    for cy, y in enumerate(range(0, h, REGION_CELL)):
        for cx, x in enumerate(range(0, w, REGION_CELL)):
            ys, xs = np.nonzero(mask[y:y + REGION_CELL, x:x + REGION_CELL])
            if len(xs):
                cells[(cy, cx)] = (x + int(xs.min()), y + int(ys.min()),
                                   x + int(xs.max()) + 1, y + int(ys.max()) + 1, len(xs))
    result = []
    for first in sorted(cells):
        if first not in cells:
            continue
        queue = deque([first])
        x0, y0, x1, y1, count = cells.pop(first)
        while queue:
            cy, cx = queue.popleft()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    key = (cy + dy, cx + dx)
                    if key in cells:
                        left, top, right, bottom, n = cells.pop(key)
                        x0, y0, x1, y1 = min(x0, left), min(y0, top), max(x1, right), max(y1, bottom)
                        count += n
                        queue.append(key)
        result.append({'x': x0, 'y': y0, 'width': x1 - x0, 'height': y1 - y0,
                       'changed_pixels': count, 'box_pixels': (x1 - x0) * (y1 - y0)})
    result.sort(key=lambda r: (r['y'], r['x'], r['height'], r['width']))
    return [dict(id=i + 1, **r) for i, r in enumerate(result)]
