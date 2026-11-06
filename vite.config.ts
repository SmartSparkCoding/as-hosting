import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	build: {
		// Reporting gzip sizes keeps every emitted chunk in memory a second time,
		// which is enough to get the build OOM-killed on a 2 GB host. The sizes
		// are informational only, so skip the extra pass.
		reportCompressedSize: false
	},
	server: {
		port: parseInt(process.env.PORT || '5173')
	}
});
