// A working best-game-01 entry (Node 22, standard library only): the game is this directory's
// game/ folder, plain static files a desktop browser loads offline (game/index.html and its ES
// modules, no library and no network request), and the program hands it in. It copies game/ and
// screenshots/ from beside this file to /output and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library. A starting point, not a winner: Block Dodger, a
// plain 2D canvas game where a paddle dodges falling blocks and catches coins, with a title screen,
// score, lives and levels, game over and restart, flat colours and no sound. Build your own game
// (any genre, any library you vendor under game/, or none), put your 3 or 4 PNG or JPEG screenshots
// in screenshots/ (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Checked by hand before anything is copied: the hand-in is only worth
// making when the game's page is in place and the screenshots form a
// complete set. Failing here, with the cause named, beats a dossier the
// scorer refuses for a reason buried in the library's own error.
const refuse = (why: string): never => {
  throw new Error(`main.ts: cannot hand in: ${why}`);
};

if (!existsSync(join(here, 'game', 'index.html'))) {
  refuse('game/index.html is missing (the game is the static files under game/, its page at the root)');
}

const shotsDir = join(here, 'screenshots');
if (!existsSync(shotsDir)) {
  refuse('screenshots/ is missing (put 3 or 4 PNG or JPEG renders of the game in it)');
}
const shotNames = readdirSync(shotsDir)
  .filter((name) => /\.(?:png|jpe?g)$/i.test(name))
  .sort();
if (shotNames.length < 3 || shotNames.length > 4) {
  refuse(`screenshots/ holds ${shotNames.length} PNG/JPEG files (${shotNames.join(', ') || 'none'}); it must hold 3 or 4`);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// A receipt for the copies above: every file that landed in the output,
// with its size in bytes, so the run's log shows exactly what was handed
// over before the dossier is written from that same tree.
const listCopied = (dir: string, prefix: string): { path: string; bytes: number }[] => {
  const found: { path: string; bytes: number }[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      found.push(...listCopied(full, `${prefix}${name}/`));
    } else {
      found.push({ path: `${prefix}${name}`, bytes: statSync(full).size });
    }
  }
  return found;
};
const copied = [
  ...listCopied(join(out, 'game'), 'game/'),
  ...listCopied(join(out, 'screenshots'), 'screenshots/'),
];
let copiedBytes = 0;
for (const file of copied) {
  copiedBytes += file.bytes;
  console.log(`  copied ${file.path} (${file.bytes} bytes)`);
}
console.log(`copied ${copied.length} files, ${copiedBytes} bytes in all`);

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
