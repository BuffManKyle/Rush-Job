// Loadout HUD panel: the two gadget slots (key, name, charges, cooldown) plus what's running right now
// (ECM time left, power out, smoke). Reads sim state only.
import { T } from '../tuning';
import { ARMORS, GADGETS } from '../data/loadout';
import { jammed } from '../sim/gadgets';
import { powerOut } from '../sim/security';
import type { Sim } from '../sim/sim';

export class GearHud {
  private el: HTMLDivElement;
  private last = '';

  constructor(
    parent: HTMLElement,
    private sim: Sim,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'hud-gear';
    parent.appendChild(this.el);
  }

  update(): void {
    const sim = this.sim;
    const p = sim.player;
    const g = sim.gear;
    const rows: string[] = [];
    for (let i = 0; i < 2; i++) {
      const s = g.slots[i];
      if (!s) {
        rows.push(`<div class="slot empty"><kbd>${i + 1}</kbd><span class="name">empty</span></div>`);
        continue;
      }
      const def = GADGETS[s.id];
      const count = s.charges === Infinity ? '' : `<span class="count">×${s.charges}</span>`;
      const tool = def.use === 'tool';
      const ready = !tool && s.charges > 0 && (p.masked || !T.gadgets.requireMask) && g.cooldown <= 0;
      const flash = g.lastUse?.slot === i && sim.time - g.lastUse.at < 0.4 ? ' used' : '';
      const out = s.charges <= 0 ? ' out' : '';
      const hint = tool ? '<span class="hint">E</span>' : '';
      const cd = !tool && g.cooldown > 0 ? `<span class="cd" style="width:${(g.cooldown / T.gadgets.useCooldown) * 100}%"></span>` : '';
      rows.push(`<div class="slot${ready ? ' ready' : ''}${flash}${out}"><kbd>${tool ? '·' : i + 1}</kbd><span class="name">${def.name}</span>${hint}${count}${cd}</div>`);
    }
    const chips: string[] = [];
    if (jammed(sim)) {
      const left = g.ecmUntil - sim.time;
      chips.push(`<div class="chip ecm">ECM <b>${left.toFixed(0)} s</b><span class="bar" style="width:${(left / T.gadgets.ecm.duration) * 100}%"></span></div>`);
    }
    if (powerOut(sim)) chips.push('<div class="chip power">POWER OUT</div>');
    for (const c of g.placed) if (c.kind === 'c4' && !c.done) chips.push(`<div class="chip c4">C4 <b>${Math.max(0, c.until - sim.time).toFixed(1)} s</b></div>`);
    if (g.thrown.some((t) => t.kind === 'smoke' && t.state === 'active')) chips.push('<div class="chip smoke">SMOKE</div>');
    const armor = ARMORS[sim.loadout.armor].name;
    const masked = p.masked ? '' : `<div class="dim small">Gadgets come out with the mask</div>`;
    const html = `${chips.join('')}<div class="title">Loadout <span class="dim">· ${armor}</span></div>${rows.join('')}${masked}<div class="dim small"><kbd>V</kbd> shout${p.masked ? '' : ' (masked)'}</div>`;
    if (html !== this.last) {
      this.el.innerHTML = html;
      this.last = html;
    }
  }

  dispose(): void {
    this.el.remove();
  }
}
