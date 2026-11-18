// Pre-job loadout picker: 1 weapon + 2 gadgets + armor. Everything is unlocked while testing
// (UNLOCK_ALL); the cash shop and job board come later. Remembers your last pick in this browser.
import { ARMORS, GADGETS, UNLOCK_ALL, WEAPONS, cleanLoadout, type GadgetId, type Loadout } from '../data/loadout';

const KEY = 'rj.loadout';

export function savedLoadout(): Loadout {
  try {
    const raw = localStorage.getItem(KEY);
    return cleanLoadout(raw ? JSON.parse(raw) : null);
  } catch {
    return cleanLoadout(null);
  }
}

function save(l: Loadout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    /* private window: fine, it just won't be remembered */
  }
}

const money = (n: number) => (n ? `$${(n / 1000).toFixed(0)}k` : 'start');

/** Show the picker; resolves with the chosen loadout when the player starts the job. */
export function pickLoadout(title: string): Promise<Loadout> {
  return new Promise((resolve) => {
    const cur = savedLoadout();
    const root = document.createElement('div');
    root.className = 'picker';
    document.body.appendChild(root);

    const render = () => {
      const price = (n: number) => `<span class="price">${money(n)}${UNLOCK_ALL && n ? ' · unlocked for testing' : ''}</span>`;
      const weapons = Object.values(WEAPONS)
        .map((w) => `<button class="card ${cur.weapon === w.id ? 'on' : ''}" data-w="${w.id}" ${w.unavailable ? 'disabled' : ''}><div class="n">${w.name}</div><div class="h">${w.unavailable ?? ''}</div>${price(w.unlock)}</button>`)
        .join('');
      const gadgets = Object.values(GADGETS)
        .map((g) => {
          const slot = cur.gadgets.indexOf(g.id);
          const charges = g.charges > 0 ? ` ×${g.charges}` : '';
          return `<button class="card ${slot >= 0 ? 'on' : ''}" data-g="${g.id}" ${g.unavailable ? 'disabled' : ''}><div class="n"><span>${g.name}${charges}</span>${slot >= 0 ? `<span class="slotno">slot ${slot + 1}</span>` : ''}</div><div class="a">${g.answers}</div><div class="h">${g.unavailable ?? g.how}</div>${price(g.unlock)}</button>`;
        })
        .join('');
      const armors = Object.values(ARMORS)
        .map((a) => `<button class="card ${cur.armor === a.id ? 'on' : ''}" data-a="${a.id}"><div class="n">${a.name}</div><div class="h">${a.blurb}</div>${price(a.unlock)}</button>`)
        .join('');
      root.innerHTML = `
        <div class="panel">
          <h1>Kit up</h1>
          <div class="dim">${title} · pick 1 weapon, 2 gadgets and armor. Gadgets come out with the mask.</div>
          <h2>Gadgets (2 slots: keys 1 and 2)</h2><div class="grid">${gadgets}</div>
          <h2>Weapon</h2><div class="grid">${weapons}</div>
          <h2>Armor</h2><div class="grid">${armors}</div>
          <div class="foot">
            <div class="dim">Zip ties (×4) always come along. <kbd>V</kbd> shouts civilians down (masked).</div>
            <button class="go">Start the job (Enter)</button>
          </div>
        </div>`;
      root.querySelectorAll<HTMLButtonElement>('[data-w]').forEach((b) => b.addEventListener('click', () => ((cur.weapon = b.dataset.w as Loadout['weapon']), render())));
      root.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) => b.addEventListener('click', () => ((cur.armor = b.dataset.a as Loadout['armor']), render())));
      root.querySelectorAll<HTMLButtonElement>('[data-g]').forEach((b) =>
        b.addEventListener('click', () => {
          const id = b.dataset.g as GadgetId;
          const i = cur.gadgets.indexOf(id);
          if (i >= 0) cur.gadgets[i] = null;
          else if (!cur.gadgets[0]) cur.gadgets[0] = id;
          else if (!cur.gadgets[1]) cur.gadgets[1] = id;
          else cur.gadgets = [cur.gadgets[1], id]; // full: drop the older pick
          render();
        }),
      );
      root.querySelector('.go')!.addEventListener('click', go);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') go();
    };
    const go = () => {
      window.removeEventListener('keydown', onKey);
      root.remove();
      const l = cleanLoadout(cur);
      save(l);
      resolve(l);
    };
    window.addEventListener('keydown', onKey);
    render();
  });
}
