/** The pace of a demo: one beat per event. */
export const BEAT = 520;

/** Delays a CSS animation to its beat in a demo. */
export function beat(index: number, step = BEAT) {
  return { animationDelay: `${index * step}ms` };
}
