import struct
import sys
import tempfile
from pathlib import Path
import unittest
import zlib
import numpy as np
from PIL import Image, ImageCms, PngImagePlugin

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pd_inputs import InputError, load_image


class Inputs(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def save(self, im, name='image.png', **kwargs):
        path = self.root / name
        im.save(path, **kwargs)
        return path

    def test_rgb_grayscale_palette_expand_without_color_changes(self):
        for mode, value, expected in [('RGB', (12, 23, 34), [12, 23, 34, 255]), ('L', 63, [63, 63, 63, 255]), ('1', 1, [255, 255, 255, 255]), ('LA', (60, 20), [60, 60, 60, 20])]:
            with self.subTest(mode=mode):
                data, meta = load_image(self.save(Image.new(mode, (4, 4), value)))
                self.assertEqual(data[0, 0].tolist(), expected)
                self.assertEqual(meta['color_space'], 'assumed_srgb_untagged')
        im = Image.new('P', (4, 4), 0)
        im.putpalette([12, 23, 34] + [0] * 765)
        data, _ = load_image(self.save(im, transparency=0))
        self.assertEqual(data[0, 0].tolist(), [12, 23, 34, 0])

    def test_hidden_rgb_preserved_in_png(self):
        data, _ = load_image(self.save(Image.new('RGBA', (4, 4), (42, 21, 12, 0))))
        self.assertEqual(data[0, 0].tolist(), [42, 21, 12, 0])

    def test_supported_codecs(self):
        for suffix in ('png', 'jpg', 'webp'):
            with self.subTest(suffix=suffix):
                data, _ = load_image(self.save(Image.new('RGB', (16, 16), 'red'), f'test.{suffix}'))
                self.assertEqual(data.shape, (16, 16, 4))

    def test_color_and_orientation_tags(self):
        im = Image.new('RGB', (4, 4), 'red')
        info = PngImagePlugin.PngInfo()
        info.add(b'sRGB', b'\x00')
        _, meta = load_image(self.save(im, pnginfo=info))
        self.assertEqual(meta['color_space'], 'declared_srgb')
        profile = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
        _, meta = load_image(self.save(im, icc_profile=profile))
        self.assertEqual(meta['color_space'], 'recognized_srgb_icc')
        exif = Image.Exif()
        exif[274] = 6
        with self.assertRaisesRegex(InputError, 'orientation'):
            load_image(self.save(im, exif=exif))

    def test_reject_color_conversion(self):
        im = Image.new('RGB', (4, 4), 'red')
        info = PngImagePlugin.PngInfo()
        info.add(b'gAMA', struct.pack('>I', 100000))
        with self.assertRaisesRegex(InputError, 'gamma'):
            load_image(self.save(im, pnginfo=info))
        with self.assertRaisesRegex(InputError, 'ICC'):
            load_image(self.save(im, icc_profile=b'invalid'))
        with self.assertRaisesRegex(InputError, 'CMYK'):
            load_image(self.save(Image.new('CMYK', (4, 4)), 'cmyk.jpg'))

    def test_high_bit_depth_rgb_and_gray_rejected(self):
        with self.assertRaises(InputError):
            load_image(self.save(Image.fromarray(np.zeros((4, 4), dtype=np.uint16))))
        def chunk(tag, data):
            return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))
        path = self.root / 'rgb16.png'
        path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 16, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b'\x00' + b'\x12\x34' * 3)) + chunk(b'IEND', b''))
        with self.assertRaisesRegex(InputError, 'High-bit-depth'):
            load_image(path)

    def test_cicp_cannot_silently_relabel_hdr(self):
        im = Image.new('RGB', (4, 4), 'red')
        for values, valid in [((1, 13, 0, 1), True), ((9, 16, 0, 1), False)]:
            info = PngImagePlugin.PngInfo()
            info.add(b'cICP', bytes(values))
            path = self.save(im, pnginfo=info)
            if valid:
                _, meta = load_image(path)
                self.assertEqual(meta['color_space'], 'declared_srgb')
            else:
                with self.assertRaisesRegex(InputError, 'cICP'):
                    load_image(path)

    def test_unsupported_corrupt_and_animated(self):
        im = Image.new('RGB', (4, 4), 'red')
        with self.assertRaisesRegex(InputError, 'Unsupported format'):
            load_image(self.save(im, 'image.bmp'))
        path = self.root / 'bad.png'
        path.write_bytes(b'not an image')
        with self.assertRaises(InputError):
            load_image(path)
        for suffix in ('png', 'webp'):
            path = self.save(im, f'animated.{suffix}', save_all=True, append_images=[Image.new('RGB', (4, 4), 'blue')], duration=100, loop=0)
            with self.subTest(suffix=suffix), self.assertRaisesRegex(InputError, 'Animated'):
                load_image(path)


if __name__ == '__main__':
    unittest.main()
