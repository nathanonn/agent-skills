import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import numpy as np
from PIL import Image

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
import pd_cli
from pd_render import sheet


class Workflow(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='pixel diff test ')
        self.root = Path(self.temp.name)
        self.a = self.root / 'reference.png'
        self.b = self.root / 'candidate.png'
        self.base = Image.new('RGBA', (64, 48), (240, 240, 240, 255))
        self.base.save(self.a)
        self.base.save(self.b)

    def tearDown(self):
        self.temp.cleanup()

    def invoke(self, *options):
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            code = pd_cli.main([str(self.a), str(self.b), '--output', str(self.root / 'runs'), *options])
        result = json.loads(stdout.getvalue())
        directory = Path(result['run'])
        return code, directory, json.loads((directory / 'report.json').read_text())

    def test_identical_pixels_different_bytes(self):
        self.base.save(self.b, compress_level=0)
        self.assertNotEqual(self.a.read_bytes(), self.b.read_bytes())
        code, directory, report = self.invoke('--max-changed-pixels', '0')
        self.assertEqual((code, report['status'], report['verdict']['state']), (0, 'complete', 'pass'))
        self.assertEqual(report['measurements']['exact']['full']['changed_pixels'], 0)
        self.assertEqual(report['regions']['exact'], [])
        self.assertTrue((directory / 'comparison.png').is_file())

    def test_masks_copies_and_failure_artifacts(self):
        image = self.base.copy()
        image.putpixel((8, 10), (0, 0, 0, 255))
        image.save(self.b)
        code, directory, report = self.invoke('--max-changed-pixels', '0', '--exclude', '20,20,5,5')
        self.assertEqual(code, 1)
        self.assertEqual(report['status'], 'complete')
        self.assertEqual(report['verdict']['state'], 'fail')
        diff = np.asarray(Image.open(directory / report['artifacts']['exact']['diff']))
        self.assertEqual(np.argwhere(diff.any(axis=2)).tolist(), [[10, 8]])
        for role, source in [('reference', self.a), ('candidate', self.b)]:
            copied = directory / report['inputs'][role]['copy']
            self.assertEqual(copied.read_bytes(), source.read_bytes())
            self.assertEqual(hashlib.sha256(copied.read_bytes()).hexdigest(), report['inputs'][role]['sha256'])

    def test_tolerant_verdict_requires_selection(self):
        image = self.base.copy()
        image.putpixel((8, 10), (241, 240, 240, 255))
        image.save(self.b)
        code, _, report = self.invoke('--tolerant', '--max-changed-pixels', '0')
        self.assertEqual(code, 1)
        self.assertEqual(report['measurements']['tolerant']['full']['changed_pixels'], 0)
        code, directory, report = self.invoke('--tolerant', '--verdict-mode', 'tolerant', '--max-changed-pixels', '0')
        self.assertEqual(code, 0)
        self.assertEqual(report['filtered_pixels'], 1)
        self.assertTrue((directory / 'tolerant-comparison.png').exists())
        self.assertTrue((directory / 'filtered-out.png').exists())

    def test_exclusions_do_not_erase_raw_evidence(self):
        image = self.base.copy()
        image.putpixel((8, 10), (0, 0, 0, 255))
        image.save(self.b)
        code, directory, report = self.invoke('--exclude', '8,10,1,1', '--max-changed-pixels', '0')
        self.assertEqual(code, 0)
        self.assertEqual(report['measurements']['exact']['full']['changed_pixels'], 1)
        self.assertEqual(report['measurements']['exact']['included']['changed_pixels'], 0)
        self.assertEqual(report['exclusion_pixels'], 1)
        self.assertTrue(np.asarray(Image.open(directory / 'exact/diff.png'))[10, 8].any())

    def test_dimensions_error_has_both_sizes_without_score(self):
        Image.new('RGB', (20, 10)).save(self.b)
        code, _, report = self.invoke()
        self.assertEqual((code, report['status']), (2, 'error'))
        self.assertNotIn('measurements', report)
        self.assertNotIn('verdict', report)
        self.assertEqual(report['inputs']['reference']['width'], 64)
        self.assertEqual(report['inputs']['candidate']['width'], 20)
        self.assertIn('64x48', report['error']['message'])
        self.assertIn('20x10', report['error']['message'])

    def test_invalid_cli_settings(self):
        for options in (['--color-threshold', '2'], ['--filter-antialiasing'], ['--verdict-mode', 'tolerant'], ['--max-changed-percent', 'nan'], ['--max-changed-percent', '101'], ['--max-changed-pixels', '-1'], ['--exclude', '1,1,0,2'], ['--tolerant', '--color-threshold', '256']):
            with self.subTest(options=options), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as raised:
                self.invoke(*options)
            self.assertEqual(raised.exception.code, 2)

    def test_repeated_runs_and_movable_paths(self):
        _, first, report = self.invoke()
        _, second, _ = self.invoke()
        self.assertNotEqual(first, second)
        relocated = self.root / 'moved'
        shutil.move(str(first), relocated)
        for role in report['inputs'].values():
            self.assertTrue((relocated / role['copy']).exists())
        for key in ('overview', 'diff', 'overlay'):
            self.assertTrue((relocated / report['artifacts']['exact'][key]).exists())
        self.assertTrue((second / 'report.json').exists())

    def test_interrupted_report_is_incomplete(self):
        with patch.object(pd_cli, 'render_mode', side_effect=KeyboardInterrupt):
            code, _, report = self.invoke('--max-changed-pixels', '0')
        self.assertEqual((code, report['status']), (130, 'incomplete'))
        self.assertNotIn('verdict', report)

    def test_tiles_and_complete_region_catalog(self):
        a = Image.new('RGB', (800, 1200), 'white')
        a.save(self.a)
        b = a.copy()
        for y in range(0, 1200, 128):
            for x in range(0, 800, 128):
                b.putpixel((x, y), (0, 0, 0))
        b.save(self.b)
        code, directory, report = self.invoke()
        self.assertEqual(code, 0)
        self.assertEqual(report['measurements']['exact']['full']['changed_pixels'], 70)
        self.assertEqual(len(report['regions']['exact']), 70)
        paths = report['artifacts']['exact']
        self.assertEqual(len(paths['tiles']), 4)
        self.assertEqual(sum(t['width'] * t['height'] for t in paths['tiles']), 800 * 1200)
        self.assertEqual(len(paths['region_pages']), 2)
        for path in [t['path'] for t in paths['tiles']] + paths['region_pages']:
            with Image.open(directory / path) as im:
                im.verify()

    def test_scaled_corner_pixel_remains_visible(self):
        im = Image.new('RGB', (1280, 1200), 'white')
        mask = np.zeros((1200, 1280), dtype=bool)
        mask[-1, -1] = True
        areas = [{'id': 1, 'x': 1279, 'y': 1199, 'width': 1, 'height': 1}]
        result = sheet(im, im, mask, areas, [[1279, 1199, 1, 1]], 'Corner regression', [], scale=0.05)
        # Diff panel is placed at (16, 308), because its small view gets a 100px panel.
        self.assertEqual(result.getpixel((16 + 63, 308 + 59)), (235, 0, 150))

    def test_bootstrap_reuses_environment_offline(self):
        result = subprocess.run([sys.executable, str(SCRIPTS / 'pixel_diff.py'), str(self.a), str(self.b), '--output', str(self.root / 'offline')],
                                env={**os.environ, 'PIP_NO_INDEX': '1', 'PIP_FIND_LINKS': str(self.root / 'no-wheels')},
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertNotIn('Setting up', result.stderr)


if __name__ == '__main__':
    unittest.main()
