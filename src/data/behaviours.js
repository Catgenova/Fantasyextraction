// How a creature fights.
//
// "Each species attacks differently" has to be something the AI can read, not
// a paragraph of flavour, so every species names one behaviour from this table
// and the monster brain interprets it. Keeping the vocabulary small and shared
// is what makes forty species distinguishable without forty special cases:
// a Sicklejaw and a Slickfin are both `harry`, and they feel different because
// their speed, reach and pack size differ, not because they run different code.
//
// `mods` are applied to the creature on spawn — they are how a behaviour pays
// for itself. `hint` fields are read by the monster AI when it decides what to
// do this think; unimplemented ones are inert until the AI batch lands, which
// is deliberate: the data says what a species *is*, and the sim catches up.

export const BEHAVIOURS = {
  swarm: {
    id: 'swarm', name: 'Swarm',
    desc: 'Converges directly and ignores its own spacing. Dangerous only in numbers.',
    hint: { spacing: 0.3, commit: 1, keepRange: 0 },
  },
  harry: {
    id: 'harry', name: 'Harry',
    desc: 'Darts in, strikes, and falls back out of reach before the answer lands.',
    hint: { retreatAfterHit: 1.6, commit: 0.4, keepRange: 0 },
  },
  flank: {
    id: 'flank', name: 'Flank',
    desc: 'Circles for the side or the back rather than meeting a shield head on.',
    hint: { approachAngle: 2.2, commit: 0.7, keepRange: 0 },
  },
  pounce: {
    id: 'pounce', name: 'Pounce',
    desc: 'Coils, then crosses the gap in one leap.',
    hint: { gapClose: 260, windup: 0.8, commit: 0.9 },
  },
  spitter: {
    id: 'spitter', name: 'Spitter',
    desc: 'Holds its distance and throws something corrosive.',
    hint: { keepRange: 210, commit: 0.3 },
  },
  ambusher: {
    id: 'ambusher', name: 'Ambush',
    desc: 'Does not move until you are close enough, then opens with everything.',
    hint: { holdUntil: 190, openingMult: 2.4, commit: 1 },
  },
  burrower: {
    id: 'burrower', name: 'Burrow',
    desc: 'Goes under when hurt and comes up somewhere less convenient.',
    hint: { submergeBelow: 0.5, resurfaceAt: 200, commit: 0.8 },
  },
  screamer: {
    id: 'screamer', name: 'Screamer',
    desc: 'Fights badly and calls the rest of the nest while doing it.',
    hint: { callRadius: 900, callCooldown: 18, commit: 0.4 },
  },
  bulwark: {
    id: 'bulwark', name: 'Bulwark',
    desc: 'Slow, plated, and content to stand in the way of everything behind it.',
    hint: { holdFront: 1, commit: 1, keepRange: 0 },
  },
  tailwhip: {
    id: 'tailwhip', name: 'Tail sweep',
    desc: 'Turns and sweeps an arc that catches everyone stood together.',
    hint: { sweepArc: 150, sweepCooldown: 7, commit: 0.9 },
  },
  leech: {
    id: 'leech', name: 'Leech',
    desc: 'Latches on and does not let go until one of you stops moving.',
    hint: { latch: 1, drainPct: 0.35, commit: 1 },
  },
  bomber: {
    id: 'bomber', name: 'Dive',
    desc: 'Circles above out of reach, then drops on whoever is most alone.',
    hint: { orbitRange: 320, divePeriod: 9, commit: 0.6 },
  },
  stalker: {
    id: 'stalker', name: 'Stalker',
    desc: 'Hangs at the edge of sight and takes whoever falls behind.',
    hint: { preferIsolated: 1, keepRange: 340, commit: 0.5 },
  },
  venomous: {
    id: 'venomous', name: 'Venomous',
    desc: 'Its bite matters more an hour later than it does now.',
    hint: { dotOnHit: 1, commit: 0.8 },
  },
  frenzy: {
    id: 'frenzy', name: 'Frenzy',
    desc: 'Faster and angrier the closer it gets to dying.',
    hint: { rageBelow: 0.6, rageSpeed: 0.5, commit: 1 },
  },
  retaliate: {
    id: 'retaliate', name: 'Retaliate',
    desc: 'Barely attacks. Everything that hits it regrets the contact.',
    hint: { thorns: 0.3, commit: 0.5, keepRange: 0 },
  },
  grapple: {
    id: 'grapple', name: 'Grapple',
    desc: 'Takes hold of one hero and stops them being anywhere else.',
    hint: { holdSeconds: 2.5, holdCooldown: 14, commit: 1 },
  },
  deathcloud: {
    id: 'deathcloud', name: 'Death cloud',
    desc: 'Killing it is the dangerous part.',
    hint: { onDeathRadius: 190, onDeathDamage: 0.9 },
  },
  charger: {
    id: 'charger', name: 'Charge',
    desc: 'Lines you up, telegraphs, and runs straight through.',
    hint: { chargeRange: 520, windup: 1.2, commit: 1 },
  },
  breath: {
    id: 'breath', name: 'Breath',
    desc: 'A cone of whatever it is full of, on a rhythm you can learn.',
    hint: { coneLength: 420, coneArc: 55, breathCooldown: 11 },
  },
  slam: {
    id: 'slam', name: 'Slam',
    desc: 'Puts its weight through the ground and everything standing on it.',
    hint: { slamRadius: 230, slamCooldown: 9 },
  },
  sunder: {
    id: 'sunder', name: 'Sunder',
    desc: 'Hits armour rather than around it. Plate is a liability.',
    hint: { armorPen: 200, commit: 1 },
  },
  roar: {
    id: 'roar', name: 'Roar',
    desc: 'Stops a squad where it stands and works itself up while they recover.',
    hint: { roarRadius: 420, roarCooldown: 22, stagger: 1.4 },
  },
  divebomb: {
    id: 'divebomb', name: 'Dive bomb',
    desc: 'Leaves the ground entirely, then arrives all at once.',
    hint: { airborneFor: 4, diveDamageMult: 2.2, diveCooldown: 16 },
  },
  constrict: {
    id: 'constrict', name: 'Constrict',
    desc: 'Coils around whoever is nearest and squeezes until they are let go of.',
    hint: { holdSeconds: 4, crushPerSecond: 0.06, holdCooldown: 20 },
  },
};

export const BEHAVIOUR_IDS = Object.keys(BEHAVIOURS);
