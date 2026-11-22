"""Strict image loading. No orientation, color, geometry, or depth conversion."""
import hashlib
from pathlib import Path
import struct
import warnings

import numpy as np
from PIL import Image, ImageCms

MAX_PIXELS = 16_000_000
MAX_DIMENSION = 32_768
MAX_FILE_BYTES = 64 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


class InputError(ValueError):
    pass


def png_metadata(path):
    """Read color tags that Pillow may otherwise ignore, including HDR cICP."""
    result = {}
    with open(path, 'rb') as stream:
        stream.seek(8)
        while header := stream.read(8):
            if len(header) != 8:
                raise InputError('Truncated PNG chunk header.')
            length, tag = struct.unpack('>I4s', header)
            if length > MAX_FILE_BYTES:
                raise InputError('PNG chunk exceeds the input size limit.')
            if tag in (b'cICP', b'mDCV', b'cLLI'):
                if tag != b'cICP':
                    raise InputError('HDR PNG metadata requires explicit sRGB export.')
                data = stream.read(length)
                if data != bytes((1, 13, 0, 1)) or 'cicp' in result:
                    raise InputError('PNG cICP is not a single full-range sRGB declaration. Export as sRGB.')
                result['cicp'] = list(data)
            else:
                stream.seek(length, 1)
            stream.seek(4, 1)
            if tag == b'IEND':
                break
    return result


def icc_tags(raw):
    """Compare colorimetric tags, ignoring names, timestamps and profile IDs."""
    if len(raw) < 132 or raw[36:40] != b'acsp' or raw[16:20] != b'RGB ' or raw[20:24] != b'XYZ ':
        raise InputError('Invalid or non-RGB ICC profile. Export as 8-bit sRGB.')
    count = struct.unpack_from('>I', raw, 128)[0]
    if count > 1000 or len(raw) < 132 + 12 * count:
        raise InputError('Invalid ICC tag table.')
    tags = {}
    for i in range(count):
        tag, offset, size = struct.unpack_from('>4sII', raw, 132 + 12 * i)
        if offset + size > len(raw) or tag in tags:
            raise InputError('Invalid ICC tag data.')
        tags[tag] = raw[offset:offset + size]
    return tags


def color_metadata(im):
    info = im.info
    exif = im.getexif()
    orientation = exif.get(274, 1)
    if orientation != 1:
        raise InputError(f'EXIF orientation is {orientation}. Apply rotation/mirroring before comparison.')
    color_space = exif.get(40961)
    if 34665 in exif:
        color_space = exif.get_ifd(34665).get(40961, color_space)
    if color_space not in (None, 1, 65535):
        raise InputError('EXIF identifies a non-sRGB color space. Export as sRGB.')
    icc = info.get('icc_profile')
    if 'icc_profile' in info and not icc:
        raise InputError('Malformed ICC profile. Export as 8-bit sRGB.')
    if icc:
        tags = icc_tags(icc)
        canonical = icc_tags(ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes())
        required = (b'rXYZ', b'gXYZ', b'bXYZ', b'rTRC', b'gTRC', b'bTRC', b'wtpt', b'chad')
        # LUT profiles can override matrix/TRC behavior, so reject them explicitly.
        if any(k.startswith((b'A2B', b'B2A', b'D2B', b'B2D')) for k in tags):
            raise InputError('LUT ICC profile requires explicit sRGB export before comparison.')
        if any(tags.get(k) != canonical.get(k) for k in required):
            raise InputError('ICC profile is not a recognized canonical sRGB matrix profile. Export with an explicit PNG sRGB tag or untagged sRGB pixels.')
        status = 'recognized_srgb_icc'
    elif 'srgb' in info or 'cicp' in info or color_space == 1:
        status = 'declared_srgb'
    elif color_space == 65535:
        raise InputError('EXIF color space is uncalibrated. Export explicitly as sRGB.')
    else:
        status = 'assumed_srgb_untagged'
    if 'gamma' in info and abs(info['gamma'] - 0.45455) > 0.00002:
        raise InputError('PNG gamma is not standard sRGB. Export as sRGB before comparison.')
    standard = (0.3127, 0.3290, 0.6400, 0.3300, 0.3000, 0.6000, 0.1500, 0.0600)
    if 'chromaticity' in info and any(abs(a - b) > 0.00002 for a, b in zip(info['chromaticity'], standard)):
        raise InputError('PNG primaries are not sRGB. Export as sRGB before comparison.')
    if 'cicp' in info and tuple(info['cicp']) != (1, 13, 0, 1):
        raise InputError('PNG cICP is not full-range sRGB. Export as sRGB.')
    return {'color_space': status, 'orientation': orientation,
            'icc_sha256': hashlib.sha256(icc).hexdigest() if icc else None,
            'png_srgb_intent': info.get('srgb'), 'gamma': info.get('gamma'),
            'chromaticity': info.get('chromaticity'), 'cicp': info.get('cicp'), 'exif_color_space': color_space}


def copy_input(source, directory, role):
    source = Path(source).expanduser().resolve()
    if not source.is_file():
        raise InputError(f'{source}: image file does not exist or is not a regular file.')
    if source.stat().st_size > MAX_FILE_BYTES:
        raise InputError(f'{source}: exceeds the 64 MiB encoded-file limit.')
    target = directory / f'{role}{source.suffix.lower()}'
    digest = hashlib.sha256()
    size = 0
    with source.open('rb') as src, target.open('xb') as dst:
        while block := src.read(1024 * 1024):
            size += len(block)
            if size > MAX_FILE_BYTES:
                raise InputError(f'{source}: exceeds the 64 MiB encoded-file limit.')
            digest.update(block)
            dst.write(block)
    return target, {'source_path': str(source), 'copy': target.relative_to(directory.parent).as_posix(),
                    'sha256': digest.hexdigest(), 'bytes': size}


def load_image(path):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(path) as im:
                w, h = im.size
                if w * h > MAX_PIXELS or max(w, h) > MAX_DIMENSION:
                    raise InputError(f'{w}x{h} exceeds 16,000,000 pixels or a 32,768-pixel edge. Supply a smaller independently captured pair; comparison does not resize.')
                if im.format not in ('PNG', 'JPEG', 'WEBP'):
                    raise InputError(f'Unsupported format {im.format}. Supply PNG, JPEG, or still WebP.')
                if getattr(im, 'n_frames', 1) != 1:
                    raise InputError('Animated/multiframe input. Render one chosen frame first.')
                if im.mode not in ('1', 'L', 'LA', 'P', 'RGB', 'RGBA'):
                    raise InputError(f'Unsupported mode {im.mode}. Export as 8-bit sRGB.')
                if im.format == 'PNG':
                    im.info.update(png_metadata(path))
                    with open(path, 'rb') as f:
                        header = f.read(26)
                    if header[24] > 8:
                        raise InputError('High-bit-depth PNG. Export as 8-bit sRGB before comparison.')
                if im.format == 'JPEG' and getattr(im, 'bits', 8) != 8:
                    raise InputError('JPEG must have 8-bit samples.')
                meta = {'width': w, 'height': h, 'format': im.format, 'original_mode': im.mode,
                        'has_alpha': 'A' in im.mode or 'transparency' in im.info, **color_metadata(im)}
                im.load()
                pixels = np.array(im.convert('RGBA'), dtype=np.uint8)
            # Reopen for PNG integrity checks after full decoding, including chunk CRCs.
            with Image.open(path) as check:
                check.verify()
        return pixels, meta
    except (OSError, ValueError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise InputError(f'{path}: {exc}') from exc
