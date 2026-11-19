// Pre-job loadout screen ("the locker"): your character in front of a wall, wearing what you pick.
// Slots sit next to where each item goes (mask on the face, weapon in the hand, gadgets on the belt,
// armor on the chest); click one to choose from what fits there. Cash shows top right.
// Everything is unlocked while testing (UNLOCK_ALL); the shop and job board come later.
// The wall is a stand-in until the menu scene is designed.
import * as THREE from 'three';
import { ARMORS, GADGETS, MASKS, UNLOCK_ALL, WEAPONS, cleanLoadout, type GadgetId, type Loadout } from '../data/loadout';
import { loadProgress } from '../wallet';
import { play, type CharInstance, type Kit } from './kit';
import { BELT, CHEST, dress, undress, type Outfit } from './outfit';

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

type SlotId = 'mask' | 'weapon' | 'gadget0' | 'gadget1' | 'armor';

interface Option {
  id: string;
  name: string;
  tag: string; // price / unlock line
  blurb: string;
  disabled?: string;
  note?: string; // e.g. "in slot 2"
}

const money = (n: number) => `$${n.toLocaleString()}`;

/** Show the locker; resolves with the chosen loadout when the player starts the job. */
export function pickLoadout(title: string, kit: Kit | null): Promise<Loadout> {
  return new Promise((resolve) => {
    let cur = savedLoadout();
    const progress = loadProgress();
    const root = document.createElement('div');
    root.className = 'locker';
    document.body.appendChild(root);

    // ---------- 3D: wall, floor, character ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    root.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1424);
    scene.fog = new THREE.Fog(0x0d1424, 6, 12);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);

    for (let x = -7; x <= 7; x++) {
      const w = kit?.clone('wall_full_ext');
      if (w) {
        w.position.set(x, 0, -1.6);
        scene.add(w);
      }
      for (let z = -1; z <= 4; z++) {
        const f = kit?.clone('floor_concrete');
        if (f) {
          f.position.set(x, 0, z);
          scene.add(f);
        }
      }
    }
    if (!kit?.has('wall_full_ext')) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 3), new THREE.MeshStandardMaterial({ color: 0x6b3e2a, roughness: 0.95 }));
      wall.position.set(0, 1.5, -1.1);
      scene.add(wall);
    }
    if (!kit?.has('floor_concrete')) {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a4d58 }));
      floor.receiveShadow = true;
      scene.add(floor);
    }
    scene.traverse((o) => ((o as THREE.Mesh).receiveShadow = true));

    scene.add(new THREE.HemisphereLight(0x9ab8d0, 0x141b33, 0.55));
    const key = new THREE.SpotLight(0xffd6a8, 45, 12, 0.36, 0.6, 1.5);
    key.position.set(-1.8, 3.6, 3);
    key.target.position.set(0, 1, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0004;
    scene.add(key, key.target);
    // teal rim from behind, aimed at the character only, so the dark suit separates from the wall
    const rim = new THREE.SpotLight(0x2fd0c0, 18, 6, 0.32, 0.6, 1.5);
    rim.position.set(1.6, 2.8, -1.2);
    rim.target.position.set(0, 1.2, 0);
    scene.add(rim, rim.target);
    const fill = new THREE.PointLight(0x8fa8ff, 3, 6, 1.5);
    fill.position.set(2, 1.4, 2.2);
    scene.add(fill);

    const pivot = new THREE.Group();
    scene.add(pivot);
    let ch: CharInstance | null = kit?.character('player') ?? null;
    if (ch) {
      pivot.add(ch.root);
      for (const m of ch.meshes) {
        m.castShadow = true;
        if ((m.material as THREE.Material).name.startsWith('RJ_Mask')) m.visible = true;
      }
      play(ch, 'idle', 0);
    } else {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.1, 6, 16), new THREE.MeshStandardMaterial({ color: 0x2b2d36 }));
      body.position.y = 0.85;
      pivot.add(body);
    }
    let outfit: Outfit | null = null;
    const redress = (l: Loadout) => {
      if (!ch) return;
      undress(outfit);
      outfit = dress(ch, kit, l);
    };
    redress(cur);
    (window as unknown as { rjLocker: unknown }).rjLocker = { get ch() { return ch; }, cam, scene, THREE }; // console debugging

    // ---------- DOM: header, slots, leader lines, popover, footer ----------
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="locker-head">
         <div><div class="job">${title}</div><h1>Kit up</h1></div>
         <div class="cash"><div class="amt">${money(progress.cash)}</div><div class="dim">${progress.jobs} job${progress.jobs === 1 ? '' : 's'} banked${UNLOCK_ALL ? ' · shop closed: everything unlocked for testing' : ''}</div></div>
       </div>
       <svg class="locker-lines"></svg>
       <div class="locker-slots"></div>
       <div class="locker-pop hidden"></div>
       <div class="locker-foot">
         <div class="dim">Drag to turn · Zip ties ×4 always come along · <kbd>V</kbd> shouts civilians down</div>
         <button class="go">Start the job <kbd>Enter</kbd></button>
       </div>`,
    );
    const slotsEl = root.querySelector('.locker-slots') as HTMLDivElement;
    const lines = root.querySelector('.locker-lines') as SVGSVGElement;
    const pop = root.querySelector('.locker-pop') as HTMLDivElement;

    const SLOTS: { id: SlotId; label: string; side: 'l' | 'r'; row: number }[] = [
      { id: 'mask', label: 'Mask', side: 'l', row: 0 },
      { id: 'weapon', label: 'Weapon', side: 'l', row: 1 },
      { id: 'gadget0', label: 'Gadget · key 1', side: 'l', row: 2 },
      { id: 'armor', label: 'Armor', side: 'r', row: 0.6 },
      { id: 'gadget1', label: 'Gadget · key 2', side: 'r', row: 2 },
    ];

    const valueOf = (s: SlotId, l: Loadout): { name: string; sub: string } => {
      if (s === 'mask') return { name: MASKS[l.mask].name, sub: MASKS[l.mask].blurb };
      if (s === 'weapon') return { name: WEAPONS[l.weapon].name, sub: 'Silenced: 6 m of noise. 36 rounds.' };
      if (s === 'armor') return { name: ARMORS[l.armor].name, sub: ARMORS[l.armor].blurb };
      const g = l.gadgets[s === 'gadget0' ? 0 : 1];
      return g ? { name: `${GADGETS[g].name}${GADGETS[g].charges > 0 ? ` ×${GADGETS[g].charges}` : ''}`, sub: GADGETS[g].answers } : { name: 'Empty', sub: 'Pick a gadget for this slot' };
    };

    const unlockTag = (price: number) => (price ? `${money(price)}${UNLOCK_ALL ? ' · unlocked' : ''}` : 'Starter');

    const optionsFor = (s: SlotId): Option[] => {
      if (s === 'mask')
        return Object.values(MASKS).map((m) => ({
          id: m.id,
          name: m.name,
          blurb: m.blurb,
          tag: !m.unlock ? 'Starter' : progress.ratings.includes(m.unlock) ? `Earned: ${m.unlock}` : `Earn a ${m.unlock} rating${UNLOCK_ALL ? ' · unlocked' : ''}`,
        }));
      if (s === 'weapon') return Object.values(WEAPONS).map((w) => ({ id: w.id, name: w.name, blurb: w.unavailable ? '' : 'Your sidearm.', tag: unlockTag(w.unlock), disabled: w.unavailable }));
      if (s === 'armor') return Object.values(ARMORS).map((a) => ({ id: a.id, name: a.name, blurb: a.blurb, tag: unlockTag(a.unlock) }));
      const i = s === 'gadget0' ? 0 : 1;
      const other = cur.gadgets[1 - i];
      return [
        { id: '', name: 'Empty', blurb: 'Leave this slot free.', tag: '' },
        ...Object.values(GADGETS).map((g) => ({
          id: g.id,
          name: `${g.name}${g.charges > 0 ? ` ×${g.charges}` : ''}`,
          blurb: `${g.answers}. ${g.how}`,
          tag: unlockTag(g.unlock),
          disabled: g.unavailable,
          note: g.id === other ? `in slot ${2 - i}: swaps` : undefined,
        })),
      ];
    };

    const apply = (s: SlotId, id: string, l: Loadout): Loadout => {
      const n: Loadout = { ...l, gadgets: [...l.gadgets] as Loadout['gadgets'] };
      if (s === 'mask') n.mask = id as Loadout['mask'];
      else if (s === 'weapon') n.weapon = id as Loadout['weapon'];
      else if (s === 'armor') n.armor = id as Loadout['armor'];
      else {
        const i = s === 'gadget0' ? 0 : 1;
        const g = (id || null) as GadgetId | null;
        if (g && n.gadgets[1 - i] === g) n.gadgets[1 - i] = n.gadgets[i]; // swap
        n.gadgets[i] = g;
      }
      return n;
    };

    let open: SlotId | null = null;
    const renderSlots = () => {
      slotsEl.innerHTML = SLOTS.map((s) => {
        const v = valueOf(s.id, cur);
        return `<button class="slot ${s.side} ${open === s.id ? 'open' : ''}" data-s="${s.id}" style="--row:${s.row}">
          <div class="lbl">${s.label}</div><div class="val">${v.name}</div><div class="sub">${v.sub}</div></button>`;
      }).join('');
      slotsEl.querySelectorAll<HTMLButtonElement>('.slot').forEach((b) => b.addEventListener('click', () => toggle(b.dataset.s as SlotId)));
    };

    const toggle = (s: SlotId) => {
      if (open === s) return closePop();
      open = s;
      const opts = optionsFor(s);
      const value = s === 'mask' ? cur.mask : s === 'weapon' ? cur.weapon : s === 'armor' ? cur.armor : cur.gadgets[s === 'gadget0' ? 0 : 1] ?? '';
      pop.innerHTML = opts
        .map(
          (o) => `<button class="opt ${o.id === value ? 'on' : ''}" data-id="${o.id}" ${o.disabled ? 'disabled' : ''}>
            <div class="n"><span>${o.name}</span><span class="tag">${o.disabled ?? o.tag}</span></div>
            ${o.blurb && !o.disabled ? `<div class="b">${o.blurb}</div>` : ''}${o.note ? `<div class="note">${o.note}</div>` : ''}</button>`,
        )
        .join('');
      const side = SLOTS.find((q) => q.id === s)!.side;
      pop.className = `locker-pop ${side}`;
      // open over the slot column (under the card, or above it near the bottom), never over the character
      const card = slotsEl.querySelector<HTMLElement>(`[data-s="${s}"]`)!.getBoundingClientRect();
      pop.style.left = side === 'l' ? `${card.left}px` : '';
      pop.style.right = side === 'r' ? `${window.innerWidth - card.right}px` : '';
      const h = pop.offsetHeight;
      const below = card.bottom + 6;
      pop.style.top = `${below + h < window.innerHeight - 80 ? below : Math.max(70, card.top - 6 - h)}px`;
      pop.querySelectorAll<HTMLButtonElement>('.opt').forEach((b) => {
        // hover previews it on the character; click equips it
        b.addEventListener('mouseenter', () => redress(apply(s, b.dataset.id!, cur)));
        b.addEventListener('click', () => {
          cur = apply(s, b.dataset.id!, cur);
          redress(cur);
          closePop();
        });
      });
      pop.addEventListener('mouseleave', () => redress(cur), { once: true });
      renderSlots();
    };
    const closePop = () => {
      open = null;
      pop.className = 'locker-pop hidden';
      redress(cur);
      renderSlots();
    };
    renderSlots();

    // leader lines from each slot card to where the item sits on the body
    const anchorWorld = (s: SlotId): THREE.Vector3 => {
      const v = new THREE.Vector3();
      if (!ch) return v.set(0, s === 'mask' ? 1.6 : 1, 0);
      if (s === 'mask') return (ch.root.getObjectByName('Head') ?? ch.root).getWorldPosition(v).add(new THREE.Vector3(0, 0.05, 0.1));
      if (s === 'weapon') return (ch.bones.hand_R ?? ch.root).getWorldPosition(v);
      if (s === 'armor') return ch.root.localToWorld(v.copy(CHEST));
      return ch.root.localToWorld(v.copy(BELT[s === 'gadget0' ? 0 : 1]));
    };
    const drawLines = () => {
      const r = renderer.domElement.getBoundingClientRect();
      lines.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
      let svg = '';
      for (const s of SLOTS) {
        const card = slotsEl.querySelector<HTMLElement>(`[data-s="${s.id}"]`);
        if (!card) continue;
        const c = card.getBoundingClientRect();
        const p = anchorWorld(s.id).project(cam);
        const ax = ((p.x + 1) / 2) * r.width;
        const ay = ((1 - p.y) / 2) * r.height;
        const cx = s.side === 'l' ? c.right : c.left;
        const cy = c.top + c.height / 2;
        const mx = cx + (ax - cx) * 0.35;
        svg += `<polyline points="${cx},${cy} ${mx},${cy} ${ax},${ay}" class="${open === s.id ? 'on' : ''}"/><circle cx="${ax}" cy="${ay}" r="4" class="${open === s.id ? 'on' : ''}"/>`;
      }
      lines.innerHTML = svg;
    };

    // ---------- loop, input, teardown ----------
    let yaw = 0.35;
    let dragging = false;
    let lastX = 0;
    let idle = 0;
    const canvas = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      yaw += (e.clientX - lastX) * 0.01;
      lastX = e.clientX;
      idle = 0;
    };
    const onUp = () => (dragging = false);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('click', () => open && closePop());

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h);
      cam.aspect = w / h;
      // keep the whole body in frame on narrow screens; on wide ones push the character a bit right of the slots
      const dist = cam.aspect >= 1.5 ? 4.4 : 4.4 * Math.pow(1.5 / cam.aspect, 0.9);
      cam.position.set(0, 1.25, dist);
      cam.lookAt(0, 0.95, 0);
      cam.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      idle += dt;
      if (!dragging && idle > 4) yaw += Math.sin(now / 2400) * dt * 0.08; // a slow sway when left alone
      pivot.rotation.y = yaw;
      ch?.mixer.update(dt);
      renderer.render(scene, cam);
      drawLines();
    };
    raf = requestAnimationFrame(loop);

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') go();
      else if (e.code === 'Escape' && open) closePop();
    };
    const go = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', resize);
      renderer.dispose();
      root.remove();
      ch = null;
      const l = cleanLoadout(cur);
      save(l);
      resolve(l);
    };
    root.querySelector('.go')!.addEventListener('click', go);
    window.addEventListener('keydown', onKey);
  });
}
