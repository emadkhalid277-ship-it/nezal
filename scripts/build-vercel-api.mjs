import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

async function buildVercelApiBundles() {
  const bundles = [
    {
      entry: path.join(ROOT_DIR, 'server', 'onlineDuelEngine.ts'),
      outfile: path.join(ROOT_DIR, 'api', 'online-rooms', '_onlineDuelEngine.bundle.mjs'),
      label: 'api/online-rooms/_onlineDuelEngine.bundle.mjs',
    },
    {
      entry: path.join(ROOT_DIR, 'server', 'cloudinarySignCore.ts'),
      outfile: path.join(ROOT_DIR, 'api', 'cloudinary', '_cloudinarySignCore.bundle.mjs'),
      label: 'api/cloudinary/_cloudinarySignCore.bundle.mjs',
    },
  ];

  for (const target of bundles) {
    if (!fs.existsSync(target.entry)) {
      throw new Error(`Missing source entry file: ${target.entry}`);
    }

    await esbuild.build({
      entryPoints: [target.entry],
      outfile: target.outfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      sourcemap: false,
      minify: false,
      legalComments: 'none',
      logLevel: 'silent',
    });

    const sizeKb = (fs.statSync(target.outfile).size / 1024).toFixed(1);
    console.log(`[build-vercel-api] Built ${target.label} (${sizeKb} KB)`);
  }
}

buildVercelApiBundles().catch((err) => {
  console.error('[build-vercel-api] Failed:', err);
  process.exit(1);
});
