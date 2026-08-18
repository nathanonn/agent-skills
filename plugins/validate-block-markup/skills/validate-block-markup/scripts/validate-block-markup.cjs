#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');
const { spawnSync } = require('node:child_process');

const skillDirectory = path.resolve(__dirname, '..');
const cliMetaPath = path.join(skillDirectory, 'lib', 'cli-meta.cjs');
const requiredPackages = new Map([
	['@wordpress/block-library', '9.40.2'],
	['@wordpress/block-serialization-default-parser', '5.40.1'],
	['@wordpress/blocks', '15.13.1'],
	['jsdom', '26.1.0'],
]);

function installedVersion(packageName) {
	try {
		return JSON.parse(
			fs.readFileSync(
				path.join(
					skillDirectory,
					'node_modules',
					...packageName.split('/'),
					'package.json'
				),
				'utf8'
			)
		).version;
	} catch {
		return null;
	}
}

function dependenciesAreReady() {
	return [...requiredPackages].every(
		([packageName, version]) => installedVersion(packageName) === version
	);
}

/**
 * Keeps the installed runtime out of a consumer's version control.
 *
 * The skill ships a .gitignore, but it is a dotfile: packaging tools, archive
 * extractions, and hand copies all drop those silently. Without it, one
 * validation run stages ~545 MB of node_modules into whatever repository the
 * skill happens to sit inside. Rewriting the file costs a single stat call and
 * removes the dependency on how the skill arrived.
 *
 * Failure is never fatal — a read-only directory fails the install itself with
 * a clearer message — so the warning is emitted only when an install follows.
 */
function ensureGitignore(reportFailure) {
	const gitignorePath = path.join(skillDirectory, '.gitignore');
	if (fs.existsSync(gitignorePath)) {
		return;
	}

	try {
		fs.writeFileSync(gitignorePath, 'node_modules/\n');
	} catch (error) {
		if (reportFailure) {
			process.stderr.write(
				`validate-block-markup: could not write ${gitignorePath}: ${error.message}\n` +
					'validate-block-markup: exclude node_modules/ from version control manually.\n'
			);
		}
	}
}

function installDependencies() {
	const ready = dependenciesAreReady();
	ensureGitignore(!ready);

	if (ready) {
		return;
	}

	for (const requiredFile of ['package.json', 'package-lock.json']) {
		if (!fs.existsSync(path.join(skillDirectory, requiredFile))) {
			throw new Error(
				`${requiredFile} is missing from the standalone skill directory.`
			);
		}
	}

	try {
		fs.accessSync(skillDirectory, fs.constants.W_OK);
	} catch {
		throw new Error(
			`The skill directory is not writable: ${skillDirectory}`
		);
	}

	process.stderr.write(
		'validate-block-markup: installing pinned runtime dependencies for first use...\n'
	);
	const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
	const result = spawnSync(
		npmCommand,
		[
			'ci',
			'--omit=dev',
			'--ignore-scripts',
			'--no-audit',
			'--no-fund',
		],
		{
			cwd: skillDirectory,
			stdio: ['inherit', 2, 2],
		}
	);

	if (result.error) {
		throw new Error(`Unable to run npm: ${result.error.message}`);
	}
	if (result.status !== 0) {
		throw new Error(`npm ci exited with status ${result.status}.`);
	}
	if (!dependenciesAreReady()) {
		throw new Error('npm ci completed, but pinned runtime dependencies are unavailable.');
	}
}

/**
 * Loads the dependency-free CLI metadata that ships next to the validator.
 * Returns null (with a readable reason on stderr) instead of throwing a stack
 * trace when lib/cli-meta.cjs is absent or unloadable.
 */
function loadCliMeta() {
	if (!fs.existsSync(cliMetaPath)) {
		process.stderr.write(
			`validate-block-markup: ${cliMetaPath} is missing; this skill installation is incomplete.\n`
		);
		return null;
	}
	try {
		return require('../lib/cli-meta.cjs');
	} catch (error) {
		process.stderr.write(
			`validate-block-markup: unable to load ${cliMetaPath}: ${error.message}\n`
		);
		return null;
	}
}

/**
 * Handles the argument forms that need no runtime at all: --help, --version,
 * and unknown options. Returns an exit status when the run is complete, or
 * null when the caller must continue into the dependency bootstrap.
 *
 * This runs BEFORE installDependencies() so that inspecting the command never
 * triggers a 545 MB npm install. `--` is honored exactly as parseArguments
 * defines it, so `-- --help` stays a path and falls through to validation.
 */
function handleDependencyFreeArguments(cliMeta, arguments_) {
	let parsed;
	try {
		parsed = cliMeta.parseArguments(arguments_);
	} catch (error) {
		process.stderr.write(
			`validate-block-markup: ${error.message}\n${cliMeta.USAGE_HINT}\n`
		);
		return 2;
	}

	if (parsed.help) {
		process.stdout.write(`${cliMeta.USAGE}\n`);
		return 0;
	}

	if (parsed.version) {
		process.stdout.write(cliMeta.versionLines());
		return 0;
	}

	return null;
}

let handled = false;

if (require.main === module) {
	const cliMeta = loadCliMeta();
	if (cliMeta === null) {
		process.exitCode = 2;
		handled = true;
	} else {
		const status = handleDependencyFreeArguments(
			cliMeta,
			process.argv.slice(2)
		);
		if (status !== null) {
			process.exitCode = status;
			handled = true;
		}
	}
}

if (!handled) {
	try {
		installDependencies();
	} catch (error) {
		process.stderr.write(`validate-block-markup: ${error.message}\n`);
		if (require.main === module) {
			process.exitCode = 2;
		} else {
			throw error;
		}
	}

	if (dependenciesAreReady()) {
		const validator = require(
			path.join(skillDirectory, 'lib', 'validator.cjs')
		);
		module.exports = validator;
		if (require.main === module) {
			process.exitCode = validator.runCli();
		}
	}
}
