import { cp, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Keep Bootstrap outside Vite's compiled CSS bundle. Bootstrap 3 ships a useful
 * bootstrap.css.map that points back to its original Less modules, but Vite's
 * production CSS pipeline does not preserve that external map. Copying the
 * precompiled files unchanged lets us see those sourcemaps in the browser.
 *
 * Production (`npm run build`):
 *   node_modules/bootstrap/dist/css/bootstrap.css      -> dist/bootstrap/css/
 *   node_modules/bootstrap/dist/css/bootstrap.css.map  -> dist/bootstrap/css/
 *   node_modules/bootstrap/dist/fonts/                 -> dist/bootstrap/fonts/
 *
 * Keeping this layout also preserves Bootstrap's `../fonts/...` URLs. Maven
 * packages `dist` below the web application's `/js` path, and index.vm links
 * `/js/bootstrap/css/bootstrap.css`.
 *
 * Development needs no copy: index.vm links Bootstrap directly through the
 * Vite server at `/node_modules/bootstrap/dist/css/bootstrap.css`. See
 * src/main/webapp/WEB-INF/templates/index.vm for both URLs.
 */
const frontendRoot = fileURLToPath(new URL('../', import.meta.url));
const sourceRoot = join(frontendRoot, 'node_modules/bootstrap/dist');
const outputRoot = join(frontendRoot, 'dist/bootstrap');
const css = await readFile(join(sourceRoot, 'css/bootstrap.css'), 'utf8');
const sourceMap = JSON.parse(await readFile(join(sourceRoot, 'css/bootstrap.css.map'), 'utf8'));

// Fail loudly if a Bootstrap update stops providing the source-map behavior this copy exists to retain.
if (!css.includes('sourceMappingURL=bootstrap.css.map') || !sourceMap.sources.includes('less/grid.less') || !sourceMap.sources.includes('less/mixins/grid.less')) {
	throw new Error('Bootstrap no longer ships the expected Less source map');
}

await mkdir(dirname(join(outputRoot, 'css/bootstrap.css')), { recursive: true });
await Promise.all([
	cp(join(sourceRoot, 'css/bootstrap.css'), join(outputRoot, 'css/bootstrap.css')),
	cp(join(sourceRoot, 'css/bootstrap.css.map'), join(outputRoot, 'css/bootstrap.css.map')),
	cp(join(sourceRoot, 'fonts'), join(outputRoot, 'fonts'), { recursive: true }),
]);
