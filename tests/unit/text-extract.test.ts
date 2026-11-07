import { describe, expect, it } from 'vitest';
import {
	decodeEntities,
	escapeHtml,
	extractTitle,
	htmlToText,
	isIndexableFile,
	pagePathFromFile,
	renderSnippet,
	truncateText
} from '$lib/server/hosting/text-extract';

describe('isIndexableFile', () => {
	it('accepts html and htm in any case', () => {
		expect(isIndexableFile('index.html')).toBe(true);
		expect(isIndexableFile('About.HTM')).toBe(true);
	});

	it('rejects dotfiles, stylesheets and images', () => {
		expect(isIndexableFile('.htaccess')).toBe(false);
		expect(isIndexableFile('.index.html.swp')).toBe(false);
		expect(isIndexableFile('style.css')).toBe(false);
		expect(isIndexableFile('photo.png')).toBe(false);
	});
});

describe('pagePathFromFile', () => {
	it('maps the root document to /', () => {
		expect(pagePathFromFile('index.html')).toBe('/');
		expect(pagePathFromFile('./index.htm')).toBe('/');
	});

	it('maps a nested index to its directory', () => {
		expect(pagePathFromFile('about/index.html')).toBe('/about/');
		expect(pagePathFromFile('projects/robot/index.html')).toBe('/projects/robot/');
	});

	it('keeps a named page as its own path', () => {
		expect(pagePathFromFile('about.html')).toBe('/about.html');
		expect(pagePathFromFile('projects/robot.html')).toBe('/projects/robot.html');
	});
});

describe('htmlToText', () => {
	it('drops script, style and comments', () => {
		const text = htmlToText(
			'<html><head><style>body{color:red}</style><script>alert("hi")</script></head><body>Hello</body></html>'
		);
		expect(text).toBe('Hello');
		expect(text).not.toContain('alert');
		expect(text).not.toContain('color');
	});

	it('keeps visible words and decodes entities', () => {
		expect(htmlToText('<p>Salt &amp; pepper</p><p>5 &lt; 6</p>')).toBe('Salt & pepper 5 < 6');
	});

	it('does not leave a space before punctuation', () => {
		expect(htmlToText('<p>Hello <strong>world</strong>.</p>')).toBe('Hello world.');
	});

	it('collapses runs of whitespace and newlines', () => {
		expect(htmlToText('<div>one</div>\n\n   <div>two</div>')).toBe('one two');
	});
});

describe('extractTitle', () => {
	it('prefers the title tag', () => {
		expect(extractTitle('<title>My page</title><h1>Other</h1>', 'fallback')).toBe('My page');
	});

	it('falls back to the h1', () => {
		expect(extractTitle('<h1>Robotics club</h1>', 'fallback')).toBe('Robotics club');
	});

	it('falls back to the given name when there is nothing to read', () => {
		expect(extractTitle('<body><p>no headings</p></body>', 'my-site')).toBe('my-site');
		expect(extractTitle('<title>  </title>', 'my-site')).toBe('my-site');
	});

	it('caps a long title', () => {
		const title = extractTitle(`<title>${'a'.repeat(400)}</title>`, 'fallback');
		expect(title.length).toBe(300);
		expect(title.endsWith('...')).toBe(true);
	});
});

describe('truncateText', () => {
	it('leaves short text alone', () => {
		expect(truncateText('short', 20)).toBe('short');
	});

	it('cuts on a word boundary and marks the cut', () => {
		const result = truncateText('the quick brown fox jumps over the lazy dog', 20);
		expect(result.endsWith('...')).toBe(true);
		expect(result.startsWith('the quick brown fox')).toBe(true);
		expect(result.length).toBeLessThanOrEqual(23);
	});
});

describe('escapeHtml and decodeEntities', () => {
	it('escapes the characters that could break out of markup', () => {
		expect(escapeHtml('<img src=x onerror="go()">')).toBe(
			'&lt;img src=x onerror=&quot;go()&quot;&gt;'
		);
	});

	it('decodes numeric, hex and named entities', () => {
		expect(decodeEntities('a&#65;b&#x42;c&amp;d&hellip;')).toBe('aAbBc&d…');
	});

	it('leaves an unknown entity alone', () => {
		expect(decodeEntities('100&nonsense;')).toBe('100&nonsense;');
	});
});

describe('renderSnippet', () => {
	it('turns highlight markers into mark tags', () => {
		expect(renderSnippet('the [[H]]robot[[/H]] arm')).toBe('the <mark>robot</mark> arm');
	});

	it('escapes page text before adding markers', () => {
		expect(renderSnippet('<script>bad()</script> [[H]]robot[[/H]]')).toBe(
			'&lt;script&gt;bad()&lt;/script&gt; <mark>robot</mark>'
		);
	});

	it('accepts custom markers', () => {
		expect(renderSnippet('a ]hit[ b', ']', '[')).toBe('a <mark>hit</mark> b');
	});
});
