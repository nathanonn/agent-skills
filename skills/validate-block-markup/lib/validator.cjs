const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');
const { JSDOM, VirtualConsole } = require('jsdom');
// Sits next to this file in both `src/` and the shipped `lib/`, so the same
// relative path resolves in either location. Dependency-free on purpose: the
// executable loads it before the runtime bootstrap.
const {
	USAGE,
	USAGE_HINT,
	WORDPRESS_VERSION,
	parseArguments,
	versionLines,
} = require('./cli-meta.cjs');

const NOT_CHECKED = [
	'server-side rendering and destination-site plugin filters',
	'WordPress capabilities, KSES filtering, and sanitization',
	'remote URL availability and destination-site attachment existence',
	'destination theme CSS, theme.json, templates, patterns, and block supports',
	'visual layout, responsive behavior, accessibility, and semantic quality',
];

const NONPORTABLE_BLOCKS = new Map([
	['core/archives', 'renders from site archive data'],
	['core/avatar', 'depends on a user or post-author context'],
	['core/block', 'references a synced pattern entity'],
	['core/breadcrumbs', 'renders from the destination-site page hierarchy'],
	['core/calendar', 'renders from site content and settings'],
	['core/categories', 'renders from site taxonomy data'],
	['core/comments', 'depends on a post and its comments'],
	['core/comments-pagination', 'depends on comment-query context'],
	['core/comments-pagination-next', 'depends on comment-query context'],
	['core/comments-pagination-numbers', 'depends on comment-query context'],
	['core/comments-pagination-previous', 'depends on comment-query context'],
	['core/comments-title', 'depends on post comment data'],
	['core/footnotes', 'renders footnote data stored in post meta'],
	['core/home-link', 'depends on the destination site URL'],
	['core/html', 'requires destination-site capability and KSES checks'],
	['core/icon', 'depends on an icon registered on the destination site'],
	['core/latest-comments', 'renders from site comment data'],
	['core/latest-posts', 'renders from site post data'],
	['core/loginout', 'depends on authentication and the site URL'],
	['core/navigation', 'can reference navigation entities and site URLs'],
	['core/navigation-link', 'can reference destination-site entities'],
	[
		'core/navigation-overlay-close',
		'only functions inside a navigation overlay',
	],
	['core/navigation-submenu', 'can reference destination-site entities'],
	['core/page-list', 'renders from the site page hierarchy'],
	['core/page-list-item', 'depends on a destination-site page'],
	['core/pattern', 'depends on a registered destination-site pattern'],
	['core/post-comments-form', 'depends on post context'],
	['core/post-template', 'depends on query and post context'],
	['core/query', 'renders from a site query'],
	['core/query-no-results', 'depends on query context'],
	['core/query-pagination', 'depends on query context'],
	['core/query-pagination-next', 'depends on query context'],
	['core/query-pagination-numbers', 'depends on query context'],
	['core/query-pagination-previous', 'depends on query context'],
	['core/query-title', 'depends on archive or query context'],
	['core/query-total', 'depends on query context'],
	['core/read-more', 'depends on post context'],
	['core/rss', 'depends on a live external feed'],
	['core/search', 'depends on a WordPress site endpoint'],
	['core/shortcode', 'depends on destination-site shortcode registration'],
	['core/site-logo', 'depends on a site setting or attachment'],
	['core/site-tagline', 'depends on a site setting'],
	['core/site-title', 'depends on a site setting'],
	['core/tag-cloud', 'renders from site taxonomy data'],
	['core/template-part', 'depends on a template-part entity and theme'],
	['core/term-count', 'depends on taxonomy-term context'],
	['core/term-description', 'depends on taxonomy-query context'],
	['core/term-name', 'depends on taxonomy-term context'],
	['core/term-template', 'depends on term-query context'],
	['core/terms-query', 'renders from site taxonomy data'],
]);

const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => {
	if (!error.message.startsWith('Could not parse CSS stylesheet')) {
		process.stderr.write(`DOM setup warning: ${error.message}\n`);
	}
});

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
	url: 'https://validator.invalid/',
	virtualConsole,
});

for (const key of [
	'window',
	'document',
	'navigator',
	'Node',
	'Element',
	'HTMLElement',
	'HTMLAnchorElement',
	'DOMParser',
	'MutationObserver',
	'File',
	'Blob',
]) {
	globalThis[key] = dom.window[key];
}

globalThis.self = dom.window;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.ResizeObserver = class {
	observe() {}
	unobserve() {}
	disconnect() {}
};
dom.window.matchMedia = () => ({
	matches: false,
	addEventListener() {},
	removeEventListener() {},
});

const {
	createBlock,
	getBlockAttributes,
	getBlockType,
	getBlockTypes,
	parse,
	serialize,
	validateBlock,
} = require('@wordpress/blocks');
const { registerCoreBlocks } = require('@wordpress/block-library');
const {
	parse: parseSerializedBlocks,
} = require('@wordpress/block-serialization-default-parser');

registerCoreBlocks();

function flattenWithPaths(blocks, parentPath = []) {
	return blocks.flatMap((block, index) => {
		const blockPath = [...parentPath, index];
		return [
			{ block, path: blockPath },
			...flattenWithPaths(block.innerBlocks ?? [], blockPath),
		];
	});
}

function normalizeSerialization(value) {
	return value.trim().replaceAll('\\/', '/').replaceAll('\r\n', '\n');
}

function meaningfulRawBlocks(rawBlocks) {
	return rawBlocks.filter(
		(rawBlock) =>
			rawBlock.blockName !== null ||
			rawBlock.innerHTML.trim() !== ''
	);
}

function hydrateRawBlock(rawBlock) {
	const name = rawBlock.blockName ?? 'core/freeform';
	const blockType = getBlockType(name);
	const innerBlocks = (rawBlock.innerBlocks ?? []).map(hydrateRawBlock);

	if (!blockType) {
		return {
			name,
			attributes: rawBlock.attrs ?? {},
			innerBlocks,
			originalContent: rawBlock.innerHTML.trim(),
		};
	}

	const block = createBlock(
		name,
		getBlockAttributes(
			blockType,
			rawBlock.innerHTML.trim(),
			rawBlock.attrs ?? {}
		),
		innerBlocks
	);
	block.originalContent = rawBlock.innerHTML.trim();
	return block;
}

function summarizeValidationIssue(issue) {
	const [format, ...values] = issue.args ?? [];
	const scalarValues = values.filter(
		(value) =>
			typeof value === 'string' ||
			typeof value === 'number' ||
			typeof value === 'boolean'
	);
	return [format, ...scalarValues].filter(Boolean).join(' | ');
}

function withoutValidationLogs(callback) {
	const methods = ['error', 'groupCollapsed', 'groupEnd', 'info', 'warn'];
	const originals = Object.fromEntries(
		methods.map((method) => [method, console[method]])
	);
	for (const method of methods) {
		console[method] = () => {};
	}
	try {
		return callback();
	} finally {
		for (const method of methods) {
			console[method] = originals[method];
		}
	}
}

function findMalformedAttributeJson(markup) {
	const findings = [];
	const openingDelimiter =
		/<!--\s+wp:([a-z0-9-]+(?:\/[a-z0-9-]+)?)([\s\S]*?)-->/gi;

	for (const match of markup.matchAll(openingDelimiter)) {
		let attributeText = match[2].trim();
		if (attributeText.endsWith('/')) {
			attributeText = attributeText.slice(0, -1).trimEnd();
		}
		if (!attributeText.startsWith('{')) {
			continue;
		}
		try {
			JSON.parse(attributeText);
		} catch (error) {
			const offset = match.index + match[0].indexOf(attributeText);
			const line = markup.slice(0, offset).split('\n').length;
			findings.push({
				level: 'error',
				code: 'malformed-attribute-json',
				block: match[1].includes('/') ? match[1] : `core/${match[1]}`,
				line,
				message: `Opening block attributes are not valid JSON: ${error.message}`,
			});
		}
	}

	return findings;
}

function isNonportableBlock(name) {
	if (NONPORTABLE_BLOCKS.has(name)) {
		return NONPORTABLE_BLOCKS.get(name);
	}
	if (name.startsWith('core/post-')) {
		return 'depends on post context';
	}
	if (name.startsWith('core/comment-')) {
		return 'depends on comment and post context';
	}
	return null;
}

function walkValues(value, visit, key = null) {
	visit(value, key);
	if (Array.isArray(value)) {
		for (const item of value) {
			walkValues(item, visit, key);
		}
	} else if (value && typeof value === 'object') {
		for (const [childKey, childValue] of Object.entries(value)) {
			walkValues(childValue, visit, childKey);
		}
	}
}

function attributePolicyFindings(block, blockPath) {
	const findings = [];
	const entityKeys =
		/^(?:id|ids|ref|mediaId|mediaIds|attachmentId|attachmentIds|author|authorId|postId|termId|navigationId)$/i;
	const themeKeys =
		/^(?:backgroundColor|textColor|gradient|fontSize|fontFamily|style)$/;
	let hasEntityId = false;
	let hasThemeStyle = false;

	walkValues(block.attributes ?? {}, (value, key) => {
		if (
			key &&
			entityKeys.test(key) &&
			((typeof value === 'number' && value > 0) ||
				(Array.isArray(value) && value.length > 0) ||
				(typeof value === 'string' && /^\d+$/.test(value)))
		) {
			hasEntityId = true;
		}
		if (
			key &&
			themeKeys.test(key) &&
			value !== undefined &&
			value !== null &&
			value !== ''
		) {
			hasThemeStyle = true;
		}
		if (
			typeof value === 'string' &&
			/(?:var:)?preset\|(?:color|font-size|font-family|gradient|spacing)\|/i.test(value)
		) {
			hasThemeStyle = true;
		}
	});

	if (hasEntityId) {
		findings.push({
			level: 'error',
			code: 'site-entity-id',
			block: block.name,
			path: blockPath,
			message: `${block.name} contains a destination-site database or media ID.`,
		});
	}
	if (hasThemeStyle) {
		findings.push({
			level: 'warning',
			code: 'theme-dependent-style',
			block: block.name,
			path: blockPath,
			message: `${block.name} uses style or preset attributes whose appearance depends on the destination theme.`,
		});
	}
	if (
		typeof block.attributes?.className === 'string' &&
		block.attributes.className.trim()
	) {
		findings.push({
			level: 'warning',
			code: 'custom-class',
			block: block.name,
			path: blockPath,
			message: `${block.name} uses a custom CSS class that may not exist on the destination site.`,
		});
	}

	return findings;
}

function markupLinkFindings(markup) {
	const findings = [];
	const fragment = JSDOM.fragment(markup);
	const anchors = new Set(
		[...fragment.querySelectorAll('[id]')]
			.map((element) => element.id)
			.filter(Boolean)
	);

	for (const element of fragment.querySelectorAll('[href], [src]')) {
		for (const attribute of ['href', 'src']) {
			if (!element.hasAttribute(attribute)) {
				continue;
			}
			const value = element.getAttribute(attribute).trim();
			if (/^\/(?!\/)/.test(value)) {
				findings.push({
					level: 'error',
					code: 'root-relative-url',
					block: null,
					message: `${attribute}="${value}" depends on the destination site's URL structure.`,
				});
			}
			if (
				attribute === 'href' &&
				value.startsWith('#') &&
				value.length > 1 &&
				!anchors.has(value.slice(1))
			) {
				findings.push({
					level: 'error',
					code: 'missing-fragment-target',
					block: null,
					message: `The fragment link ${value} has no matching id in the supplied markup.`,
				});
			}
		}
	}

	return findings;
}

function validateBlockMarkup(markup, source = '<string>') {
	if (typeof markup !== 'string') {
		throw new TypeError('markup must be a string');
	}

	const findings = findMalformedAttributeJson(markup);
	const rawBlocks = meaningfulRawBlocks(parseSerializedBlocks(markup));
	const validationBlocks = rawBlocks.map(hydrateRawBlock);

	if (validationBlocks.length === 0) {
		findings.push({
			level: 'error',
			code: 'no-blocks',
			block: null,
			message:
				'The supplied markup contains no blocks; there is nothing to validate.',
		});
	}

	const parsedBlocks = withoutValidationLogs(() =>
		parse(markup, { __unstableSkipMigrationLogs: true })
	);

	for (const { block, path: blockPath } of flattenWithPaths(validationBlocks)) {
		const blockType = getBlockType(block.name);

		if (!blockType) {
			const freeform = block.name === 'core/freeform';
			findings.push({
				level: 'error',
				code: freeform ? 'freeform-html' : 'unregistered-block',
				block: block.name,
				path: blockPath,
				message: freeform
					? 'Content fell through as freeform/classic HTML.'
					: `${block.name} is not registered by the WordPress ${WORDPRESS_VERSION} core block library.`,
			});
			continue;
		}

		if (block.name === 'core/missing') {
			const originalName = block.attributes?.originalName;
			findings.push({
				level: 'error',
				code: 'missing-block',
				block: block.name,
				path: blockPath,
				message: originalName
					? `The editor could not recognize ${originalName} and stored it as a core/missing placeholder.`
					: 'The markup contains a core/missing placeholder for a block the editor could not recognize.',
			});
			continue;
		}

		const [isValid, issues] = withoutValidationLogs(() =>
			validateBlock(block, blockType)
		);
		if (!isValid) {
			findings.push({
				level: 'error',
				code: 'invalid-saved-content',
				block: block.name,
				path: blockPath,
				message: `${block.name} saved markup does not match its registered save implementation.`,
				issues: issues.map(summarizeValidationIssue),
			});
		}

		const reason = isNonportableBlock(block.name);
		if (reason) {
			findings.push({
				level: 'error',
				code: 'nonportable-core-block',
				block: block.name,
				path: blockPath,
				message: `${block.name} is a core block but is not standalone: ${reason}.`,
			});
		}

		findings.push(...attributePolicyFindings(block, blockPath));
	}

	findings.push(...markupLinkFindings(markup));

	const canonicalMarkup = serialize(parsedBlocks);
	const normalizedInput = normalizeSerialization(markup);
	const normalizedCanonical = normalizeSerialization(canonicalMarkup);
	if (normalizedCanonical !== normalizedInput) {
		findings.push({
			level: 'warning',
			code: 'noncanonical-serialization',
			block: null,
			message: 'WordPress parse then serialize canonicalized the supplied markup.',
		});
	}

	const idempotentMarkup = serialize(
		withoutValidationLogs(() =>
			parse(canonicalMarkup, { __unstableSkipMigrationLogs: true })
		)
	);
	if (
		normalizeSerialization(idempotentMarkup) !== normalizedCanonical
	) {
		findings.push({
			level: 'error',
			code: 'non-idempotent-serialization',
			block: null,
			message: 'A second WordPress parse then serialize pass changed the canonical markup.',
		});
	}

	return {
		source,
		wordpressVersion: WORDPRESS_VERSION,
		blockCount: flattenWithPaths(validationBlocks).length,
		registeredCoreBlockTypes: getBlockTypes().filter(({ name }) =>
			name.startsWith('core/')
		).length,
		valid: findings.every(({ level }) => level !== 'error'),
		findings,
		...(normalizedCanonical !== normalizedInput
			? { canonicalMarkup }
			: {}),
		notChecked: NOT_CHECKED,
	};
}

function readInputs(arguments_) {
	const argumentsToRead = arguments_.length ? arguments_ : ['-'];
	const inputs = [];

	for (const argument of argumentsToRead) {
		if (argument === '-') {
			inputs.push(['<stdin>', fs.readFileSync(0, 'utf8')]);
			continue;
		}

		const resolved = path.resolve(argument);
		const stat = fs.statSync(resolved);
		if (stat.isDirectory()) {
			for (const name of fs
				.readdirSync(resolved)
				.filter((entry) => entry.endsWith('.html'))
				.sort()) {
				inputs.push([
					path.join(argument, name),
					fs.readFileSync(path.join(resolved, name), 'utf8'),
				]);
			}
		} else {
			inputs.push([argument, fs.readFileSync(resolved, 'utf8')]);
		}
	}

	return inputs;
}

function runCli(arguments_ = process.argv.slice(2)) {
	let parsed;
	try {
		parsed = parseArguments(arguments_);
	} catch (error) {
		process.stderr.write(
			`validate-block-markup: ${error.message}\n${USAGE_HINT}\n`
		);
		return 2;
	}

	if (parsed.help) {
		process.stdout.write(`${USAGE}\n`);
		return 0;
	}

	if (parsed.version) {
		process.stdout.write(versionLines());
		return 0;
	}

	if (parsed.paths.length === 0 && process.stdin.isTTY) {
		process.stderr.write(
			`validate-block-markup: no input given and stdin is a terminal.\n${USAGE_HINT}\n`
		);
		return 2;
	}

	try {
		const inputs = readInputs(parsed.paths);
		if (inputs.length === 0) {
			process.stderr.write(
				'validate-block-markup: no input sources were found; directories are searched for *.html files only.\n'
			);
			return 2;
		}
		const results = inputs.map(([source, markup]) =>
			validateBlockMarkup(markup, source)
		);
		process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
		return results.every(({ valid }) => valid) ? 0 : 1;
	} catch (error) {
		process.stderr.write(`validate-block-markup: ${error.message}\n`);
		return 2;
	}
}

module.exports = { parseArguments, readInputs, runCli, validateBlockMarkup };
