/*
 * AS Hosting analytics beacon.
 *
 * Loaded by hosted sites only. It never reads or writes cookies or storage,
 * never fingerprints the device, and only reports three things back:
 *   - how long the page was visible and how far it was scrolled (engagement)
 *   - the viewport size and browser language (once, with engagement)
 *   - which external host an outbound link pointed at (host only, no URL)
 *
 * Pageviews are counted by the server, so blocking this script still gives the
 * site owner accurate view counts.
 */
(function () {
	'use strict';

	var element = document.currentScript;
	if (!element) return;

	var site = element.getAttribute('data-site');
	var path = element.getAttribute('data-path') || '/';
	if (!site) return;

	var endpoint = '/api/analytics';
	var maxScroll = 0;
	var visibleMs = 0;
	var lastTick = Date.now();
	var sent = false;

	function send(payload) {
		payload.site = site;
		payload.path = path;

		try {
			var body = JSON.stringify(payload);
			if (navigator.sendBeacon) {
				navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
			} else if (window.fetch) {
				fetch(endpoint, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: body,
					keepalive: true,
					credentials: 'omit'
				});
			}
		} catch (err) {
			/* analytics must never break the page */
		}
	}

	function tick() {
		var now = Date.now();
		if (!document.hidden) visibleMs += now - lastTick;
		lastTick = now;
	}

	function readScroll() {
		var root = document.documentElement;
		var body = document.body;
		var scrollHeight = Math.max(
			root ? root.scrollHeight : 0,
			body ? body.scrollHeight : 0
		);
		var viewport = window.innerHeight || (root ? root.clientHeight : 0);
		var scrollable = scrollHeight - viewport;

		var percent = scrollable > 0 ? Math.round((window.pageYOffset / scrollable) * 100) : 100;
		if (percent > maxScroll) maxScroll = Math.max(0, Math.min(100, percent));
	}

	function flush() {
		if (sent) return;
		sent = true;
		tick();

		send({
			type: 'engagement',
			duration: Math.round(visibleMs / 1000),
			scroll: maxScroll,
			screenWidth: window.innerWidth,
			screenHeight: window.innerHeight,
			language: navigator.language || navigator.userLanguage || null
		});
	}

	document.addEventListener('visibilitychange', function () {
		tick();
		if (document.hidden) flush();
	});

	window.addEventListener('pagehide', flush);
	window.addEventListener('scroll', readScroll, { passive: true });
	window.addEventListener('resize', readScroll, { passive: true });
	readScroll();

	document.addEventListener(
		'click',
		function (event) {
			var node = event.target;
			var link = null;

			while (node && node !== document) {
				if (node.tagName === 'A' && node.getAttribute) {
					link = node;
					break;
				}
				node = node.parentNode;
			}

			if (!link) return;

			var href = link.getAttribute('href');
			if (!href || href.charAt(0) === '#') return;
			if (/^(mailto:|tel:|javascript:)/i.test(href)) return;

			var url;
			try {
				url = new URL(link.href, window.location.href);
			} catch (err) {
				return;
			}

			if (!/^https?:$/.test(url.protocol)) return;
			if (url.hostname === window.location.hostname) return;

			send({ type: 'outbound', targetHost: url.hostname.slice(0, 255) });
		},
		true
	);
})();
