"""Worker CLI; invoke through pixel_diff.py for pinned dependency setup."""
import argparse
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
import platform
import signal
import sys
import time
import uuid

import numpy as np
import PIL
from PIL import features
from pd_compare import DEFAULT_COLOR_THRESHOLD, REGION_CELL, inclusion, masks, measurements, regions, verdict
from pd_inputs import InputError, MAX_DIMENSION, MAX_FILE_BYTES, MAX_PIXELS, copy_input, load_image
from pd_render import BOX_LIMIT, TILE_H, TILE_W, display, mask_image, render_mode

VERSION = '1.0.0'


def percentage(value):
    try:
        number = Decimal(value)
        if not number.is_finite() or not 0 <= number <= 100:
            raise ValueError()
        return str(number)
    except (InvalidOperation, ValueError):
        raise argparse.ArgumentTypeError('Percentage must be finite and between 0 and 100.')


def rectangle(value):
    try:
        parts = [int(v) for v in value.split(',')]
        if len(parts) != 4 or min(parts[:2]) < 0 or min(parts[2:]) <= 0:
            raise ValueError()
        return parts
    except ValueError:
        raise argparse.ArgumentTypeError('Use x,y,width,height with nonnegative origin and positive integer size.')


def parse(argv=None):
    parser = argparse.ArgumentParser(description='Compare two local images without resizing, alignment, rotation, or color conversion.')
    parser.add_argument('reference', type=Path)
    parser.add_argument('candidate', type=Path)
    parser.add_argument('--output', type=Path, required=True, help='Root for a new self-contained run directory.')
    parser.add_argument('--tolerant', action='store_true', help='Also classify RGB changes using a channel threshold.')
    parser.add_argument('--color-threshold', type=int, help='Maximum ignored RGB channel delta, 0..255. Default 2 when tolerant mode runs.')
    parser.add_argument('--filter-antialiasing', action='store_true', help='Opt in to conservative stable-edge filtering; requires --tolerant.')
    parser.add_argument('--verdict-mode', choices=['exact', 'tolerant'], default='exact')
    parser.add_argument('--max-changed-pixels', type=int)
    parser.add_argument('--max-changed-percent', type=percentage)
    parser.add_argument('--exclude', type=rectangle, action='append', default=[], metavar='X,Y,W,H')
    parser.add_argument('--version', action='version', version=VERSION)
    args = parser.parse_args(argv)
    if not args.tolerant and (args.color_threshold is not None or args.filter_antialiasing or args.verdict_mode == 'tolerant'):
        parser.error('Color threshold, AA filtering, and a tolerant verdict require --tolerant.')
    if args.color_threshold is not None and not 0 <= args.color_threshold <= 255:
        parser.error('--color-threshold must be an integer from 0 through 255.')
    if args.max_changed_pixels is not None and args.max_changed_pixels < 0:
        parser.error('--max-changed-pixels must be a nonnegative integer.')
    if args.color_threshold is None:
        args.color_threshold = DEFAULT_COLOR_THRESHOLD
    return args


def write_json(path, data):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    temporary.replace(path)


def settings_for(args):
    return {'exact_metric': 'any_decoded_rgba_channel_inequality', 'tolerant': args.tolerant,
            'color_metric': 'max_absolute_rgb_channel_delta' if args.tolerant else None,
            'color_threshold': args.color_threshold if args.tolerant else None,
            'color_threshold_units': '8-bit channel levels, inclusive ignored maximum',
            'filter_antialiasing': args.filter_antialiasing,
            'antialiasing_classifier': 'stable-two-color-mixture-v1' if args.filter_antialiasing else None,
            'alpha_policy': 'every_alpha_change_counts', 'exclusions': args.exclude,
            'region_grouping': {'cell_size': REGION_CELL, 'connectivity': 8, 'boxes': 'tight_changed_pixels'},
            'presentation': {'tile_width': TILE_W, 'tile_height': TILE_H, 'max_boxes_per_view': BOX_LIMIT,
                             'overview_mask': 'any_changed_pixel_in_bin', 'overlay_candidate_weight': 0.35},
            'verdict_mode': args.verdict_mode, 'max_changed_pixels': args.max_changed_pixels,
            'max_changed_percent': args.max_changed_percent,
            'limits': {'pixels': MAX_PIXELS, 'edge': MAX_DIMENSION, 'encoded_file_bytes': MAX_FILE_BYTES}}


def tool_metadata():
    scripts = Path(__file__).parent
    digest = hashlib.sha256()
    for p in sorted([*scripts.glob('*.py'), scripts / 'requirements.txt']):
        digest.update(p.name.encode())
        digest.update(p.read_bytes())
    return {'name': 'pixel-diff', 'version': VERSION, 'source_sha256': digest.hexdigest(),
            'python': platform.python_version(), 'platform': platform.platform(),
            'pillow': PIL.__version__, 'numpy': np.__version__,
            'codecs': {name: features.version(name) for name in ('jpg', 'zlib', 'webp', 'littlecms2')}}


def run(args):
    started = time.monotonic()
    root = args.output.expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    directory = root / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ-') + uuid.uuid4().hex[:8])
    directory.mkdir()
    report = {'schema_version': 1, 'status': 'incomplete', 'tool': tool_metadata(),
              'created_at': datetime.now(timezone.utc).isoformat(), 'inputs': {},
              'settings': settings_for(args), 'notes': [], 'artifacts': {}}
    write_json(directory / 'report.json', report)
    write_json(directory / 'settings.json', report['settings'])
    try:
        inputs = directory / 'inputs'
        inputs.mkdir()
        arrays = []
        for role in ('reference', 'candidate'):
            target, meta = copy_input(getattr(args, role), inputs, role)
            report['inputs'][role] = meta
            pixels, encoding = load_image(target)
            meta.update(encoding)
            arrays.append(pixels)
            if encoding['color_space'] == 'assumed_srgb_untagged':
                report['notes'].append(f'{role}: untagged input assumed sRGB.')
        a, b = arrays
        if a.shape != b.shape:
            raise InputError(f'Dimensions differ: reference {a.shape[1]}x{a.shape[0]}, candidate {b.shape[1]}x{b.shape[0]}. Capture or prepare an equal-size pair explicitly; no pixel score computed.')
        included = inclusion(a.shape[:2], args.exclude)
        raw = masks(a, b, args.tolerant, args.color_threshold, args.filter_antialiasing)
        result = {mode: measurements(mask, included) for mode, mask in raw.items()}
        judgment = verdict(result, args.verdict_mode, args.max_changed_pixels, args.max_changed_percent)
        report['exclusion_pixels'] = int(included.size - included.sum())
        report['measurements'] = result
        report['verdict'] = judgment
        report['regions'] = {mode: regions(mask) for mode, mask in raw.items()}
        report['notes'].append('Exact compares decoded RGBA, including hidden RGB; originals may look identical despite changes.')
        report['notes'].append('A pass means only that the configured pixel limits were met.')
        ref, cand = display(a), display(b)
        del arrays, a, b, included
        for mode, mask in raw.items():
            report['artifacts'][mode] = render_mode(directory, mode, ref, cand, mask, report['regions'][mode],
                                                     args.exclude, result[mode], judgment, report['settings'])
        if args.tolerant:
            filtered = raw['exact'] & ~raw['tolerant']
            mask_image(filtered, (0, 155, 200)).save(directory / 'filtered-out.png')
            report['artifacts']['filtered_out'] = 'filtered-out.png'
            report['filtered_pixels'] = int(filtered.sum())
        report['status'] = 'complete'
        report['elapsed_seconds'] = round(time.monotonic() - started, 3)
        write_json(directory / 'report.json', report)
        print(json.dumps({'run': str(directory), 'status': 'complete', 'measurements': result, 'verdict': judgment}))
        return 1 if judgment['state'] == 'fail' else 0
    except BaseException as exc:
        report['status'] = 'incomplete' if isinstance(exc, (KeyboardInterrupt, SystemExit)) else 'error'
        report['error'] = {'type': type(exc).__name__, 'message': str(exc) or 'Interrupted'}
        # Failed generation must not expose a stale, seemingly final verdict.
        report.pop('verdict', None)
        write_json(directory / 'report.json', report)
        print(json.dumps({'run': str(directory), 'status': report['status'], 'error': report['error']}))
        return 130 if report['status'] == 'incomplete' else 2


def main(argv=None):
    def interrupted(signum, frame):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, interrupted)
    try:
        return run(parse(argv))
    except (OSError, ValueError) as exc:
        print(f'pixel-diff error: {exc}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
