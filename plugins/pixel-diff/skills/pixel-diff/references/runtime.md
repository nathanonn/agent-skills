# Runtime and setup

Use CPython 3.11-3.13 with `venv` and `pip`. The launcher pins Pillow 13.0.0 and NumPy 2.4.6. It uses binary wheels and leaves global packages unchanged.

The default environment is `.runtime/py<major><minor>-<requirements-hash>` inside the skill folder. Set `PIXEL_DIFF_ENV_ROOT` to a writable directory for a read-only skill installation. Paths containing spaces are supported.

First invocation creates the environment and runs pip under its Python. Wheel sources follow pip configuration, normally PyPI. Missing packages require network access or a local wheelhouse. A compatible installed environment needs no network.

If setup fails:

1. Check that the selected interpreter is Python 3.11-3.13 and has venv/pip. Debian may need the `python3-venv` OS package.
2. Use a writable environment root and permit the required package downloads within the current execution permissions.
3. For offline setup, provide pinned wheels with `PIP_NO_INDEX=1` and `PIP_FIND_LINKS=/path/to/wheels`.
4. To recreate a damaged environment, remove only the environment directory printed by the launcher and rerun. Remove a stale `.setup-lock` only after checking no setup process owns it.

The runtime itself is a prerequisite, not installed automatically. Comparison uses no external service. Agent visual interpretation is a separate capability.

## Input limits and color handling

Each input is limited to 16,000,000 decoded pixels, a 32,768-pixel edge, and 64 MiB of encoded data. Limits produce errors, never downsampling. A 1280x12000 pair with both modes and edge filtering took about 28 seconds and 571 MiB peak RSS on the tested Linux ARM64 machine. Allow at least 1 GiB of free memory for large runs. More complex content can take more time and disk space.

Accepted modes are 1-bit, 8-bit grayscale, grayscale/alpha, palette, RGB, and RGBA. Lower-depth palette/grayscale input expands losslessly. High-bit-depth RGB PNGs are rejected even when the decoder would otherwise reduce their samples silently. CMYK requires explicit sRGB export.

The loader accepts an explicit PNG sRGB tag, EXIF sRGB, or a canonical sRGB matrix ICC profile whose colorimetric tags match LittleCMS's generated profile. It checks transfer curves and primaries rather than trusting the name. LUT and unrecognized profiles are rejected conservatively, including some valid sRGB profiles encoded differently. The caller can export confirmed sRGB pixels with an explicit PNG sRGB tag. Do not strip a non-sRGB profile and merely relabel its pixels.

Nonidentity EXIF orientation, conflicting gamma/primaries, non-sRGB cICP, animation, corrupt files, and unsupported formats are errors.

## Platform evidence

Linux ARM64 with CPython 3.11.2, Pillow 13.0.0, and NumPy 2.4.6 is verified. Python 3.12 and 3.13 are supported targets but untested. Linux on other architectures, macOS, and Windows still need native test runs. Portable paths and Windows launcher branches are implemented, but are not evidence of native platform support.

Run the launcher once to create the environment. Then run the bundled regression cases with that environment's Python, from any directory:

```bash
"/path/to/env/bin/python" -m unittest discover -s "/path/to/pixel-diff/scripts/tests" -v
```

The environment path is printed on first setup. On Windows, use `Scripts\python.exe` inside it. The bootstrap test runs the launcher offline and expects that same environment. If you set `PIXEL_DIFF_ENV_ROOT` for setup, keep it set for the tests. Test installation, offline reuse, filenames with spaces, input codecs, and visual artifacts on each platform before claiming support there.
