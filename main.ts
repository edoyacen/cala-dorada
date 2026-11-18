/**
 * main.ts — the entry program for Cala Dorada (gta6-01), Node 22, standard
 * library only. It hands the game in: it copies game/ and screenshots/ beside
 * this file into the output directory (`/output` under the grader,
 * MAKEFUN_OUTPUT_DIR elsewhere) and writes the dossier the judge reads with the
 * vendored make.fun library.
 *
 *   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
 *
 * game/ is plain static files: game/index.html and its ES modules, loaded from
 * the file system with no build step and no network request. The screenshots
 * are the four frames the game's own shot mode staged in a browser.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The caps the scorer refuses an entry over (see the kit's gate). */
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

/** Copy a directory tree file by file, so the modes are ours and nothing is left behind. */
function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from)) {
    const source = join(from, entry);
    const target = join(to, entry);
    if (statSync(source).isDirectory()) copyTree(source, target);
    else copyFileSync(source, target);
  }
}

/** Every file under a directory, as paths relative to it. */
function listFiles(dir) {
  const files = [];
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(relative(dir, full).split('\\').join('/'));
    }
  };
  walk(dir);
  return files.sort();
}

if (!existsSync(join(root, 'game', 'index.html'))) {
  throw new Error('game/index.html is missing: the entry needs the game it hands in');
}

mkdirSync(out, { recursive: true });
copyTree(join(root, 'game'), join(out, 'game'));
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(root, 'screenshots'))) {
  copyTree(join(root, 'screenshots'), join(out, 'screenshots'));
}

const dossier = buildDossier(out, CAPS);
writeFileSync(join(out, 'dossier.json'), dossier);

const gameFiles = listFiles(join(out, 'game'));
const shots = listFiles(join(out, 'screenshots'));
console.log(
  `cala dorada: ${gameFiles.length} game files, ${shots.length} screenshots, dossier ${dossier.byteLength} bytes -> ${out}`,
);
