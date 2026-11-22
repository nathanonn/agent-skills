# Comparison rules

## Exact

Decode to RGBA using Pillow. Lossless expansion of RGB, grayscale, or palette input is allowed. Compare the four channel values at each original coordinate. Any unequal channel marks one changed pixel. Different compressed file bytes can decode identically.

Hidden RGB at alpha zero still counts. This is why identical-looking transparent images can have a nonzero mask. No compositing precedes measurement.

## Tolerant

For a pixel with unchanged alpha, calculate the largest absolute R, G, or B channel difference. Count the pixel when this exceeds `--color-threshold`. Units are integer 8-bit levels, 0 through 255. Equality is ignored. A threshold of 0 retains exact color differences.

The default threshold is 2, chosen to suppress one- and two-level perturbations while retaining a three-level change in the boundary fixtures. This is a narrow preset, not a perceptual equivalence score. It does not promise to remove JPEG artifacts or font-rendering variation. Every alpha change counts even at threshold 255.

`--filter-antialiasing` adds the `stable-two-color-mixture-v1` heuristic. For a pixel to be filtered:

- Both center pixels are opaque.
- Their eight-neighbor windows share at least three unchanged opaque samples at each of two RGB endpoints.
- Endpoint contrast spans at least 32 levels in one channel.
- Both centers are strictly interior mixtures of those endpoints. Deviation from the RGB interpolation line is at most 2 levels per channel.

The heuristic leaves image borders and ambiguous edges unchanged. It can suppress deliberate recoloring of an antialiased edge; inspect the retained exact result and cyan `filtered-out.png`. It is an opt-in approximation, not Pixelmatch's algorithm.

No region is removed because it is small. Color tolerance and edge filtering classify pixels independently of region grouping.

## Exclusions and limits

Rectangles use zero-based `x,y,width,height`, with exclusive right and bottom edges. The same coordinates apply to both images. Overlaps form a union. Invalid, out-of-bounds, and all-excluded configurations are errors.

Full metrics use `width * height` as the denominator. Included metrics use the remaining area after exclusions. Percent is `100 * changed / denominator`. Verdicts use included metrics and inclusive maxima. Integer cross-multiplication from the decimal limit's exact ratio avoids display or arithmetic rounding. No supplied limits means `not_evaluated`.

## Regions and presentation

Partition the grid into 32x32 cells anchored at the image origin. Join occupied cells using eight-neighbor connectivity. Each component becomes a region, with a tight box around its changed pixels and the exact component count. Sort by top, left, height, and width; number from 1 independently in each mode.

Adjacent occupied cells can group visually separate marks. Box area is not changed area. The mask and total remain independent of grouping.

Overviews show any change within each scaled bin, preserving even a one-pixel mark. They can make sparse changes look larger. Native masks are authoritative. Overlays blend 65% magenta with 35% candidate color at changed coordinates; cyan outlines mark exclusions. Original transparency is displayed on a checkerboard. At most 40 region boxes appear per view. Larger lists get numbered PNG index pages; every region remains in JSON.
