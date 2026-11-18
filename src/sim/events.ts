// Events the sim emits each tick. Renderer, HUD and audio listen; they never write back.
export type SimEvent =
  | { type: 'noise'; x: number; y: number; r: number; source: string }
  | { type: 'bark'; who: string; line: string } // line = dialogue id, e.g. guard.search.03
  | { type: 'suspicion'; who: string; level: 'look' | 'investigate' | 'report' }
  | { type: 'reporting'; who: string; time: number }
  | { type: 'alarm'; cause: string }
  | { type: 'escorted'; who: string }
  | { type: 'maskedUp' }
  | { type: 'jobEnded'; how: 'escaped' | 'cuffed' }
  | { type: 'interactStart'; id: string; def: string }
  | { type: 'interactDone'; id: string; def: string }
  | { type: 'interactCancel'; id: string; def: string; why: string }
  | { type: 'door'; id: string; open: boolean }
  | { type: 'message'; text: string; tone?: 'info' | 'warn' | 'danger' };

export type Listener = (e: SimEvent) => void;

export class EventBus {
  private listeners: Listener[] = [];
  private queue: SimEvent[] = [];
  on(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((l) => l !== fn));
  }
  emit(e: SimEvent): void {
    this.queue.push(e);
  }
  /** Called by the loop after each sim tick. */
  flush(): void {
    const q = this.queue;
    this.queue = [];
    for (const e of q) for (const l of this.listeners) l(e);
  }
}
