/**
 * Dependency-free CLI metadata.
 *
 * This module is the one part of the skill that may be loaded before the
 * runtime bootstrap has run, so it must never require anything outside
 * `node:fs` and `node:path` — no jsdom, no `@wordpress/*`. It is the single
 * source of truth for usage text, versions, and argument parsing, shared by
 * `scripts/validate-block-markup.cjs` (pre-bootstrap) and `validator.cjs`
 * (post-bootstrap), so the two paths can never drift.
 *
 * It is copied next to `validator.cjs` by the build, so `__dirname` means the
 * same thing in `src/` and in the shipped `lib/`.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const WORDPRESS_VERSION = '7.0.2';
const FALLBACK_SKILL_VERSION = '1.0.0';

const USAGE = `validate-block-markup - check WordPress block markup for portability

Usage:
  validate-block-markup [options] [<file|directory|->...]

Arguments:
  <file>       A file containing WordPress block markup.
  <directory>  A directory; every *.html file directly inside it is validated.
  -            Read markup from stdin (the default when no path is given).

Options:
  -h, --help     Print this help text and exit.
  -v, --version  Print the skill and pinned WordPress versions and exit.
  --             Treat every following argument as a path.

Output:
  A JSON array of reports on stdout, one entry per input source.
  Diagnostics and progress messages always go to stderr.

Exit codes:
  0  Every input source is valid.
  1  At least one error-level finding was reported.
  2  Usage or input error.`;

const USAGE_HINT =
	'Usage: validate-block-markup [options] [<file|directory|->...] (try --help)';

function skillVersion() {
	try {
		const manifest = JSON.parse(
			fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
		);
		return manifest.version || FALLBACK_SKILL_VERSION;
	} catch {
		return FALLBACK_SKILL_VERSION;
	}
}

function parseArguments(arguments_) {
	const paths = [];
	let help = false;
	let version = false;
	let onlyPaths = false;

	for (const argument of arguments_) {
		if (onlyPaths || argument === '-' || !argument.startsWith('-')) {
			paths.push(argument);
			continue;
		}
		if (argument === '--') {
			onlyPaths = true;
			continue;
		}
		if (argument === '-h' || argument === '--help') {
			help = true;
			continue;
		}
		if (argument === '-v' || argument === '--version') {
			version = true;
			continue;
		}
		const error = new Error(`unknown option: ${argument}`);
		error.usageError = true;
		throw error;
	}

	return { help, paths, version };
}

function versionLines() {
	return `validate-block-markup ${skillVersion()}\nWordPress block snapshot ${WORDPRESS_VERSION}\n`;
}

module.exports = {
	FALLBACK_SKILL_VERSION,
	USAGE,
	USAGE_HINT,
	WORDPRESS_VERSION,
	parseArguments,
	skillVersion,
	versionLines,
};
