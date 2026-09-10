// Deal-stage colour, defined once.
//
// Two rewrites got us here. It began as an eight-entry map keyed on stage NAME,
// duplicated in the board and the deal page — so the two drifted, and an admin
// adding a stage got grey. That became a position-derived ramp through three
// hue families (slate -> amber -> green), which fixed the drift but created a
// worse problem once the traffic lights landed: a green "Cleared" chip sitting
// next to a red schedule lamp is a contradiction, and a row that contradicts
// itself teaches people to stop reading the colour at all.
//
// So the two jobs are now split by colour dimension, which is the conventional
// way round:
//
//   PROGRESS  is ordered, so it gets a sequential ramp in ONE hue — slate,
//             light at the start of the pipeline, deep at the end.
//   STATUS    is categorical, so it gets red / amber / green, and those three
//             hues appear nowhere else on the row (see _lib/dealSignals).
//
// Every text/background pair below clears 7:1.

export type StageTone = { dot: string; bg: string; text: string };

const RAMP: StageTone[] = [
  { bg: '#F2F5F8', text: '#3A4150', dot: '#98A0AC' },
  { bg: '#E7EDF3', text: '#33495F', dot: '#7C94AC' },
  { bg: '#DAE3EC', text: '#2A3E52', dot: '#5E7C99' },
  { bg: '#C9D6E2', text: '#22344A', dot: '#446684' },
  { bg: '#B4C6D6', text: '#17293C', dot: '#2C4E6E' },
];

export const FALLBACK_STAGE_TONE: StageTone = {
  dot: '#98A0AC', bg: '#EDF1F6', text: '#3A4150',
};

/** Tone for the stage at index `i` of `total`, ordered by the lookup's sortOrder. */
export function stageTone(i: number, total: number): StageTone {
  if (i < 0 || total <= 0) return FALLBACK_STAGE_TONE;
  if (total === 1) return RAMP[0];
  // Spread however many stages exist across the five steps, so the ramp still
  // reads end-to-end whether there are four stages or fourteen.
  const step = Math.round((i / (total - 1)) * (RAMP.length - 1));
  return RAMP[Math.min(Math.max(step, 0), RAMP.length - 1)];
}

/** Convenience for callers holding a status id and the ordered lookup. */
export function stageToneById(id: string | undefined, statuses: { id: string }[] | undefined): StageTone {
  if (!id || !statuses?.length) return FALLBACK_STAGE_TONE;
  return stageTone(statuses.findIndex((s) => s.id === id), statuses.length);
}
