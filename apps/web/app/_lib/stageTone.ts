// Deal-stage colour, defined once.
//
// It was previously an eight-entry map keyed on stage NAME, duplicated in the
// board and the deal page — so the two drifted, and an admin adding a stage
// got grey. Colour is now derived from the stage's position in the pipeline,
// which fixes both and makes the colour mean something: the stages are a
// sequence, so hue encodes the PHASE of the journey and lightness the step
// within it.
//
//   paperwork (slate)  ->  in motion (amber)  ->  cleared (green)
//
// Three hue families instead of eight arbitrary ones. Every text/background
// pair below clears 4.5:1.

export type StageTone = { dot: string; bg: string; text: string };

const PHASES: StageTone[][] = [
  // paperwork — pre-transit, administrative
  [
    { dot: '#819CBB', bg: '#F2F3F5', text: '#324B67' },
    { dot: '#6082A9', bg: '#EAEDF0', text: '#2A3E56' },
    { dot: '#4F6E92', bg: '#E3E7EB', text: '#233448' },
  ],
  // in motion — on the road, worth watching
  [
    { dot: '#E4A758', bg: '#F8F4EF', text: '#8C550D' },
    { dot: '#DD902C', bg: '#F4EEE6', text: '#75470B' },
    { dot: '#C17B1F', bg: '#F0E8DD', text: '#673E0A' },
  ],
  // cleared — through customs, heading for done
  [
    { dot: '#69D3A5', bg: '#F0F7F4', text: '#1C7D53' },
    { dot: '#41C88E', bg: '#E8F3EE', text: '#176845' },
    { dot: '#32AE78', bg: '#DFEEE8', text: '#14573A' },
  ],
];

export const FALLBACK_STAGE_TONE: StageTone = {
  dot: '#98A0AC', bg: '#EDF1F6', text: '#3A4150',
};

const phaseOf = (i: number, total: number) =>
  i < total * 0.375 ? 0 : i < total * 0.625 ? 1 : 2;

/** Tone for the stage at index `i` of `total`, ordered by the lookup's sortOrder. */
export function stageTone(i: number, total: number): StageTone {
  if (i < 0 || total <= 0) return FALLBACK_STAGE_TONE;
  const phase = phaseOf(i, total);
  const members: number[] = [];
  for (let k = 0; k < total; k++) if (phaseOf(k, total) === phase) members.push(k);
  const step = Math.min(Math.max(members.indexOf(i), 0), 2);
  return PHASES[phase][step];
}

/** Convenience for callers holding a status id and the ordered lookup. */
export function stageToneById(id: string | undefined, statuses: { id: string }[] | undefined): StageTone {
  if (!id || !statuses?.length) return FALLBACK_STAGE_TONE;
  return stageTone(statuses.findIndex((s) => s.id === id), statuses.length);
}
