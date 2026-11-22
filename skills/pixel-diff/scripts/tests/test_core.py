import sys
from pathlib import Path
import unittest
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pd_compare import inclusion, masks, measurements, regions, verdict


class PixelRules(unittest.TestCase):
    def pair(self, h=8, w=8):
        a = np.zeros((h, w, 4), dtype=np.uint8)
        a[:, :, 3] = 255
        return a, a.copy()

    def test_one_coordinate_counts_once(self):
        a, b = self.pair()
        b[3, 4] = [255, 24, 39, 0]
        result = masks(a, b)
        self.assertEqual(list(result), ['exact'])
        self.assertEqual(np.argwhere(result['exact']).tolist(), [[3, 4]])

    def test_alpha_and_hidden_rgb(self):
        a, b = self.pair()
        a[2, 2, 3] = b[2, 2, 3] = 0
        b[2, 2, 0] = 1
        b[3, 3, 3] = 254
        result = masks(a, b, True, 255, True)
        self.assertEqual(result['exact'].sum(), 2)
        self.assertEqual(np.argwhere(result['tolerant']).tolist(), [[3, 3]])

    def test_default_tolerance_boundary(self):
        a, b = self.pair()
        for i, delta in enumerate([1, 2, 3, 10]):
            b[2, i, 0] = delta
        result = masks(a, b, True)
        self.assertEqual(result['exact'].sum(), 4)
        self.assertEqual(np.argwhere(result['tolerant']).tolist(), [[2, 2], [2, 3]])
        self.assertTrue(np.array_equal(masks(a, b, True, 0)['tolerant'], result['exact']))

    def test_antialias_switch_and_alpha_invariant(self):
        a, b = self.pair(9, 9)
        a[:, 5:, :3] = b[:, 5:, :3] = 255
        a[:, 4, :3] = 120
        b[:, 4, :3] = 140
        plain = masks(a, b, True, 2, False)
        filtered = masks(a, b, True, 2, True)
        self.assertEqual(plain['tolerant'].sum(), 9)
        self.assertEqual(filtered['tolerant'].sum(), 2)  # Image borders lack a full neighborhood.
        self.assertEqual(filtered['exact'].sum(), 9)
        b[4, 4, 3] = 254
        self.assertTrue(masks(a, b, True, 255, True)['tolerant'][4, 4])

    def test_antialias_does_not_remove_isolated_mark_or_shift(self):
        a, b = self.pair()
        b[4, 4, :3] = 80
        self.assertEqual(masks(a, b, True, 2, True)['tolerant'].sum(), 1)
        a[:, 4:, :3] = 255
        b[:, :, :3] = 0
        b[:, 5:, :3] = 255
        self.assertEqual(masks(a, b, True, 2, True)['tolerant'].sum(), 8)

    def test_union_exclusions_and_denominator(self):
        included = inclusion((4, 4), [[0, 0, 2, 2], [1, 1, 2, 2]])
        self.assertEqual(included.sum(), 9)
        mask = np.zeros((4, 4), bool)
        mask[0, 0] = mask[3, 3] = True
        result = measurements(mask, included)
        self.assertEqual(result['full']['changed_pixels'], 2)
        self.assertEqual(result['included']['changed_pixels'], 1)
        self.assertEqual(result['included']['total_pixels'], 9)

    def test_invalid_exclusions(self):
        for rect in ([0, 0, 4, 4], [-1, 0, 1, 1], [3, 3, 2, 2], [0, 0, 0, 1]):
            with self.subTest(rect=rect), self.assertRaises(ValueError):
                inclusion((4, 4), [rect])

    def test_verdict_boundaries_and_both_limits(self):
        results = {'exact': {'included': {'changed_pixels': 2, 'total_pixels': 16}}}
        self.assertEqual(verdict(results, 'exact', None, None)['state'], 'not_evaluated')
        self.assertEqual(verdict(results, 'exact', 2, '12.5')['state'], 'pass')
        self.assertEqual(verdict(results, 'exact', 1, '100')['state'], 'fail')
        self.assertEqual(verdict(results, 'exact', 99, '12.49999999999999999')['state'], 'fail')
        self.assertEqual(verdict(results, 'exact', 99, '12.499999999999999999999999999999999999')['state'], 'fail')

    def test_many_regions_keep_every_pixel(self):
        mask = np.zeros((512, 512), bool)
        mask[::64, ::64] = True
        areas = regions(mask)
        self.assertEqual(len(areas), 64)
        self.assertEqual(sum(a['changed_pixels'] for a in areas), 64)
        self.assertEqual(areas[0], {'id': 1, 'x': 0, 'y': 0, 'width': 1, 'height': 1, 'changed_pixels': 1, 'box_pixels': 1})
        self.assertEqual((areas[-1]['x'], areas[-1]['y']), (448, 448))

    def test_grouping_keeps_tight_bounds_and_count(self):
        mask = np.zeros((100, 100), bool)
        mask[5, 7] = mask[40, 40] = True  # Adjacent occupied cells.
        area = regions(mask)[0]
        self.assertEqual((area['width'], area['height'], area['changed_pixels']), (34, 36, 2))


if __name__ == '__main__':
    unittest.main()
