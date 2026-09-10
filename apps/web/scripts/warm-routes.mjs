// Compile every route before anyone clicks one.
//
// Next compiles routes on demand in development, so the first visit to a page
// blocks until it is built — seconds normally, tens of seconds on a machine
// that is short of memory. Nothing moves on screen while that happens, which
// reads as a dead link rather than a slow one.
//
// This walks the app directory, finds every page and asks for it once. Run it
// alongside `next dev`; it is a no-op in production, where routes are already
// built.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.WARM_BASE ?? 'http://localhost:3000';
const APP_DIR = new URL('../app', import.meta.url).pathname;

// Route groups "(x)" and private folders "_x" are not URL segments; dynamic
// segments "[id]" cannot be warmed without a real id, so they are skipped.
function routes(dir = APP_DIR, prefix = '') {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'page.tsx') found.push(prefix || '/');
    else if (statSync(full).isDirectory() && !entry.startsWith('_') && !entry.startsWith('[')) {
      found.push(...routes(full, entry.startsWith('(') ? prefix : `${prefix}/${entry}`));
    }
  }
  return found;
}

const waitForServer = async () => {
  for (let i = 0; i < 120; i++) {
    try { await fetch(BASE, { redirect: 'manual' }); return true; } catch { }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
};

if (!(await waitForServer())) {
  console.error(`warm: ${BASE} never came up`);
  process.exit(0); // never fail the dev session over this
}

// One at a time: compiling several routes at once on a constrained machine is
// slower than doing them in order, and starves the page the person is on.
for (const route of routes().sort()) {
  const t0 = Date.now();
  try {
    await fetch(BASE + route, { redirect: 'manual' });
    console.log(`warm: ${route} ${Date.now() - t0}ms`);
  } catch (e) {
    console.log(`warm: ${route} failed (${e.message})`);
  }
}
console.log('warm: all routes compiled');
