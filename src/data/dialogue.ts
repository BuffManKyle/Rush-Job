// Dialogue is data. IDs follow voice-script.md (`speaker.situation.NN`).
// PLACEHOLDER TEXT: the copywriter session is rewriting every line; only the IDs are stable.
export const LINES: Record<string, string> = {
  'guard.idle.01': '[placeholder] Another quiet shift.',
  'guard.idle.02': '[placeholder] Who leaves a shop this shiny unguarded? Oh. Me.',
  'guard.idle.03': '[placeholder] Twenty minutes till break.',
  'guard.huh.01': '[placeholder] Huh?',
  'guard.huh.02': '[placeholder] Something moved...',
  'guard.huh.03': '[placeholder] Hello?',
  'guard.noise.01': '[placeholder] What was that?',
  'guard.noise.02': '[placeholder] Is that... a raccoon?',
  'guard.search.01': '[placeholder] Gonna take a look.',
  'guard.search.02': '[placeholder] Anyone back here?',
  'guard.search.03': '[placeholder] I know I heard something.',
  'guard.giveup.01': '[placeholder] Must be nothing.',
  'guard.giveup.02': '[placeholder] Too much coffee.',
  'guard.giveup.03': '[placeholder] Back to it, then.',
  'guard.spotted.01': '[placeholder] Hey! Stop right there!',
  'guard.spotted.02': '[placeholder] Got one! Masked guy!',
  'guard.radio.01': '[placeholder] Dispatch, we have a situation.',
  'guard.escort.01': '[placeholder] Sir, this is staff only.',
  'guard.escort.02': '[placeholder] Let me walk you back out front.',
  'guard.trespass.01': '[placeholder] You again? That\'s it, I\'m calling it in.',
  'guard.alarm.01': '[placeholder] Lock it down!',
  'civ.scream.01': '[placeholder] AAAH! Robbery!',
  'civ.scream.02': '[placeholder] Security! Security!',
  'civ.scream.03': '[placeholder] Oh no oh no oh no.',
  'civ.staffonly.01': "[placeholder] Excuse me, you can't be back here.",
  'civ.staffonly.02': "[placeholder] I'm getting the guard.",
  'desk.camera.01': '[placeholder] I see someone on camera...',
  'desk.alarm.01': '[placeholder] Tripping the alarm.',
  'accountant.mask.01': '[placeholder] Mask on. No going back now.',
  'accountant.alarm.01': '[placeholder] That would be the alarm. Itemizing the damage.',
  'accountant.escort.01': '[placeholder] Escorted out. That one\'s free. The next one isn\'t.',
  'accountant.locked.01': '[placeholder] Locked. You did bring a lockpick, I hope.',
};

export function line(id: string): string {
  return LINES[id] ?? `[missing line ${id}]`;
}
