#!/usr/bin/env node
// Hero combat behaviour: the ten things a hero does that it did not before.
//
// Each of these is asserted against a real Match with the situation set up by
// hand, because every one of them is a decision that only exists in context —
// "does a frontliner peel" is not a property of a function, it is a property
// of a knight standing near an archer who is being bitten.
//
//   node tools/test-heroai.js

import { Match } from '../src/sim/match.js';
import { newProfile, sanitizeProfile, squadHeroes } from '../src/game/profile.js';
import { generateBotSquads } from '../src/sim/bots.js';
import { pickTarget, updateHero } from '../src/sim/ai.js';
import { makeEnemyEntity } from '../src/sim/entity.js';
import { CONSUMABLES, makeConsumable } from '../src/data/consumables.js';
import { SPELLS } from '../src/data/spells.js';
import { dist } from '../src/core/vec.js';

const TICK = 1 / 30;
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

/** A raid, run far enough that everybody has landed and settled. */
function raid(seed = 4242, level = 8) {
  const profile = sanitizeProfile(newProfile(seed));
  for (const h of profile.roster) h.level = level;
  profile.squadTactics.leaderId = profile.squad[0];
  const match = new Match({
    seed,
    playerSquad: {
      id: 'player', name: 'Yours', isPlayer: true,
      heroes: squadHeroes(profile), tactics: profile.squadTactics,
    },
    botSquads: generateBotSquads(seed, 2, level),
  });
  for (let i = 0; i < 60; i++) match.update(TICK);
  return match;
}

const heroes = (m) => m.entities.filter((e) => e.kind === 'hero' && e.isPlayer && e.alive);
const melee = (m) => heroes(m).find((h) => h.stats.attack.kind !== 'projectile');
const ranged = (m) => heroes(m).find((h) => h.stats.attack.kind === 'projectile');

/**
 * Put hostile creatures where the test needs them.
 *
 * Relying on `hostilesNear` to find them does not work: a squad sixty ticks
 * into a raid is standing in its landing zone with nothing nearby, so the
 * fixture has to place its own. Returns them in the order requested.
 *
 * It used to borrow whatever the map had already streamed in and teleport it.
 * That made every check below quietly depend on which species this seed's
 * landing zone happened to be near — and when the generator started allocating
 * animals by country, seed 4242 landed near Bogtusk instead of Bonepicker and
 * four of these checks changed their minds without a line of AI code moving.
 * Name the animal instead: what a hero does about a Bonepicker is the thing
 * being asserted, and it should not depend on the map at all.
 */
const FIXTURE_SPECIES = 'bonepicker';

function plantAll(match, near, offsets, speciesId = FIXTURE_SPECIES) {
  const out = [];
  for (const off of offsets) {
    const foe = makeEnemyEntity(speciesId, {
      pos: { x: near.x + off.x, y: near.y + off.y }, tierScale: 1, rng: match.rng,
    });
    foe.homePos = { ...foe.pos };
    match.addEntity(foe);
    out.push(foe);
  }
  // The broadphase is stamped per tick and these tests do not advance the
  // clock, so without this the squad cannot see what has just been put in
  // front of it.
  match._gridTime = -1;
  return out;
}
const planted = (match, near, offset = { x: 40, y: 0 }) => plantAll(match, near, [offset])[0];

// --------------------------------------------------------------- 1. dodge --
console.log('=== 1. heroes get out of a telegraph ===');
{
  const match = raid();
  const hero = heroes(match)[0];
  const foe = planted(match, hero.pos, { x: 200, y: 0 });
  const at = { ...hero.pos };
  match.pushTelegraph({
    pos: at, radius: 180, delay: 1.4, sourceId: foe.id,
    damage: { base: 500, school: 'physical' },
  });
  const before = dist(hero.pos, at);
  for (let i = 0; i < 40; i++) updateHero(match, hero, TICK);
  const after = dist(hero.pos, at);
  check('a hero standing in one leaves it', after > before,
    `${before.toFixed(0)} -> ${after.toFixed(0)} units from the centre`);
  // Getting to the edge is not enough; the damage lands on the edge too.
  for (let i = 0; i < 45; i++) updateHero(match, hero, TICK);
  check('and gets clear of the edge, not just off the middle',
    dist(hero.pos, at) > 180, `${dist(hero.pos, at).toFixed(0)} vs radius 180`);
}
{
  // A telegraph from our own side is not a reason to move.
  const match = raid();
  const hero = heroes(match)[0];
  const at = { ...hero.pos };
  match.pushTelegraph({
    pos: at, radius: 180, delay: 1.4, sourceId: hero.id,
    damage: { base: 500, school: 'physical' },
  });
  for (let i = 0; i < 30; i++) updateHero(match, hero, TICK);
  check('but not out of the squad\'s own', dist(hero.pos, at) < 180,
    `${dist(hero.pos, at).toFixed(0)} units`);
}

// ---------------------------------------------------------------- 2. peel --
console.log('\n=== 2. frontliners peel for the backline ===');
{
  const match = raid();
  const tank = melee(match);
  const shooter = ranged(match);
  if (!tank || !shooter) {
    check('the fixture has a melee hero and a ranged one', false);
  } else {
    // Something in melee on the archer, and something else nearer the knight.
    const biter = planted(match, shooter.pos, { x: 30, y: 0 });
    const other = plantAll(match, biter.pos, [{ x: 60, y: 0 }])[0];
    if (other) { other.pos = { x: tank.pos.x + 60, y: tank.pos.y }; other.evading = false; }
    shooter.lastHitBy = biter.id;
    shooter.lastDamageAt = match.time;

    const squad = match.squads.get(tank.squadId);
    squad._boardAt = -1;
    const picked = pickTarget(match, tank, squad, match.hostilesNear(tank, 900));
    check('a melee hero takes the thing biting a ranged ally',
      picked?.id === biter.id,
      picked ? `${picked.name} (${picked.id === biter.id ? 'the biter' : 'not the biter'})` : 'nothing');
  }
}
{
  // Not for another melee hero: everyone in the front line is being hit, and
  // peeling for each other is just target thrash.
  const match = raid();
  const tank = melee(match);
  const others = heroes(match).filter((h) => h !== tank && h.stats.attack.kind !== 'projectile');
  if (!tank || !others.length) {
    console.log('SKIP  this squad has only one melee hero');
  } else {
    const biter = planted(match, others[0].pos, { x: 30, y: 0 });
    others[0].lastHitBy = biter.id;
    others[0].lastDamageAt = match.time;
    const squad = match.squads.get(tank.squadId);
    squad._boardAt = -1;
    const picked = pickTarget(match, tank, squad, match.hostilesNear(tank, 900));
    check('but not for another frontliner', picked?.id !== biter.id || dist(tank.pos, biter.pos) < 120);
  }
}

// ------------------------------------------------------------ 3. overkill --
console.log('\n=== 3. the squad stops piling onto a corpse ===');
{
  const match = raid();
  const hero = heroes(match)[0];
  const near = plantAll(match, hero.pos, [{ x: 40, y: 0 }, { x: 70, y: 0 }]);
  if (near.length < 2) {
    check('the fixture has two reachable enemies', false, `${near.length}`);
  } else {
    const [doomed, spare] = near;
    doomed.hp = 1;                       // already dead to anything committed
    const squad = match.squads.get(hero.squadId);
    // Every ally is already swinging at it.
    for (const m of squad.memberIds.map((id) => match.byId(id))) {
      if (m?.alive) m.target = doomed.id;
    }
    squad._boardAt = -1;
    const picked = pickTarget(match, hero, squad, [doomed, spare]);
    check('a target already dead in committed damage is skipped',
      picked?.id === spare.id, picked?.id === doomed.id ? 'still the corpse' : 'moved on');

    // ...unless it is the only thing left.
    squad._boardAt = -1;
    const alone = pickTarget(match, hero, squad, [doomed]);
    check('unless it is the last enemy standing', alone?.id === doomed.id);
  }
}

// ------------------------------------------------------------- 4. potions --
console.log('\n=== 4. heroes drink the right potion ===');
{
  const match = raid();
  const hero = heroes(match)[0];
  const minor = CONSUMABLES.minor_potion;
  const greater = Object.values(CONSUMABLES)
    .find((c) => c.effects?.some((f) => f.type === 'heal' && (f.base ?? 0) > (minor.effects[0].base ?? 0)));
  if (!greater) {
    check('there are two sizes of healing potion', false);
  } else {
    // Greater first in the belt, so belt order and the right answer disagree.
    hero.consumables = [makeConsumable(greater.id, 2), makeConsumable(minor.id, 2)];
    hero.itemCooldowns = {};
    hero.hp = hero.maxHp - (minor.effects[0].base ?? 60) - 5;   // a minor covers it
    hero.tactics.potionHpPct = 1;
    // Stop at the first drink. Deliberation runs five times a second, so
    // twenty ticks is four decisions — the hero takes the minor, is still
    // hurt, and reaches for the greater, which is correct behaviour and makes
    // the question being asked here unanswerable.
    let drank = null;
    for (let i = 0; i < 40 && !drank; i++) {
      updateHero(match, hero, TICK);
      for (const c of hero.consumables) if (c.count === 1) drank = c.defId;
    }
    check('a small wound takes the small potion', drank === minor.id,
      `reached for ${drank ?? 'nothing'}`);
  }
}
{
  const match = raid();
  const hero = heroes(match)[0];
  const minor = CONSUMABLES.minor_potion;
  const greater = Object.values(CONSUMABLES)
    .find((c) => c.effects?.some((f) => f.type === 'heal' && (f.base ?? 0) > (minor.effects[0].base ?? 0)));
  hero.consumables = [makeConsumable(minor.id, 2), makeConsumable(greater.id, 2)];
  hero.itemCooldowns = {};
  hero.hp = hero.maxHp * 0.15;            // a minor would not cover this
  hero.tactics.potionHpPct = 1;
  for (let i = 0; i < 20; i++) updateHero(match, hero, TICK);
  check('and a big one takes the big potion',
    hero.consumables.find((c) => c.defId === greater.id).count === 1,
    `greater ${hero.consumables.find((c) => c.defId === greater.id).count}, minor ${hero.consumables.find((c) => c.defId === minor.id).count}`);
}

// ---------------------------------------------------------------- 5. mana --
console.log('\n=== 5. casters do not empty the bar on trash ===');
{
  const match = raid();
  const caster = heroes(match).find((h) => h.maxMana > 40);
  if (!caster) {
    console.log('SKIP  no caster in the starting squad');
  } else {
    const expensive = caster.spells
      .map((id) => SPELLS[id])
      .filter(Boolean)
      .find((sp) => (sp.manaCost ?? 0) / caster.maxMana >= 0.12
        && !(sp.hint?.allyHpBelow ?? sp.hint?.selfHpBelow ?? sp.hint?.alliesHpBelow));
    if (!expensive) {
      console.log('SKIP  this caster has no expensive offensive spell');
    } else {
      const foe = planted(match, caster.pos, { x: 60, y: 0 });
      foe.rank = 'trash';
      caster.mana = caster.maxMana * 0.5;   // not free-spending territory
      caster.cooldowns = {};
      caster.globalCooldown = 0;
      const manaBefore = caster.mana;
      for (let i = 0; i < 12; i++) updateHero(match, caster, TICK);
      const spentOnTrash = manaBefore - caster.mana;

      const match2 = raid();
      const caster2 = heroes(match2).find((h) => h.id === caster.id)
        ?? heroes(match2).find((h) => h.maxMana > 40);
      const boss = planted(match2, caster2.pos, { x: 60, y: 0 });
      boss.rank = 'boss';
      caster2.mana = caster2.maxMana * 0.5;
      caster2.cooldowns = {};
      caster2.globalCooldown = 0;
      const before2 = caster2.mana;
      for (let i = 0; i < 12; i++) updateHero(match2, caster2, TICK);
      const spentOnBoss = before2 - caster2.mana;

      check('more mana goes into an elite than into trash',
        spentOnBoss > spentOnTrash,
        `${spentOnTrash.toFixed(0)} on trash vs ${spentOnBoss.toFixed(0)} on a boss`);
    }
  }
}

// -------------------------------------------------------------- 6. spread --
console.log('\n=== 6. melee heroes surround rather than queue ===');
{
  const match = raid();
  const mel = heroes(match).filter((h) => h.stats.attack.kind !== 'projectile');
  if (mel.length < 2) {
    console.log('SKIP  this squad has one melee hero');
  } else {
    const foe = planted(match, mel[0].pos, { x: 260, y: 0 });
    for (const h of mel) { h.target = foe.id; h.pos = { x: foe.pos.x - 240, y: foe.pos.y + (mel.indexOf(h) - 0.5) * 12 }; }
    const squad = match.squads.get(mel[0].squadId);
    squad._boardAt = -1;
    for (let i = 0; i < 90; i++) for (const h of mel) updateHero(match, h, TICK);
    const apart = dist(mel[0].pos, mel[1].pos);
    check('two melee heroes on one target do not stack',
      apart > mel[0].radius + mel[1].radius + 8,
      `${apart.toFixed(0)} units apart`);
  }
}

// ------------------------------------------------------------- 7. retreat --
console.log('\n=== 7. a hurt hero falls back behind somebody ===');
{
  const match = raid();
  const hurt = ranged(match) ?? heroes(match)[1];
  const tank = melee(match);
  if (!hurt || !tank || hurt === tank) {
    console.log('SKIP  need a ranged hero and a frontliner');
  } else {
    const foe = planted(match, hurt.pos, { x: 220, y: 0 });
    // The tank between them, off to one side so "behind the tank" and "away
    // from the enemy" are different places.
    tank.pos = { x: hurt.pos.x + 120, y: hurt.pos.y + 90 };
    tank.hp = tank.maxHp;
    hurt.hp = hurt.maxHp * 0.1;
    hurt.tactics.retreatHpPct = 0.5;
    const wasFrom = dist(hurt.pos, tank.pos);
    for (let i = 0; i < 60; i++) updateHero(match, hurt, TICK);
    const nowFrom = dist(hurt.pos, tank.pos);
    check('the hurt hero moves toward its frontliner', nowFrom < wasFrom,
      `${wasFrom.toFixed(0)} -> ${nowFrom.toFixed(0)} units from the tank`);
    // "Behind" means the tank is between them, not that the hero ran further
    // in a straight line — moving toward cover that sits off to one side can
    // close on the enemy slightly and still be the right move.
    check('and puts the frontliner between itself and the enemy',
      dist(tank.pos, foe.pos) < dist(hurt.pos, foe.pos),
      `tank ${dist(tank.pos, foe.pos).toFixed(0)} vs hero ${dist(hurt.pos, foe.pos).toFixed(0)} from the enemy`);
  }
}

// -------------------------------------------------------------- 8. windup --
console.log('\n=== 8. a windup is a moment to act on ===');
{
  const match = raid();
  const stunner = heroes(match).find((h) => h.spells.some((id) =>
    SPELLS[id]?.effects?.some((f) => f.type === 'debuff' && f.status === 'stun')));
  if (!stunner) {
    console.log('SKIP  nobody in the starting squad has a stun');
  } else {
    const stunId = stunner.spells.find((id) =>
      SPELLS[id].effects.some((f) => f.type === 'debuff' && f.status === 'stun'));
    const foe = planted(match, stunner.pos, { x: 50, y: 0 });
    foe.hp = foe.maxHp;
    stunner.mana = stunner.maxMana;
    stunner.cooldowns = {};
    stunner.globalCooldown = 0;
    match.pushTelegraph({
      pos: { x: foe.pos.x + 400, y: foe.pos.y }, radius: 60, delay: 1.2,
      sourceId: foe.id, damage: { base: 10, school: 'physical' },
    });
    for (let i = 0; i < 10; i++) updateHero(match, stunner, TICK);
    check('an interrupt is cast at something winding up',
      (stunner.cooldowns[stunId] ?? 0) > 0,
      `${stunId} ${(stunner.cooldowns[stunId] ?? 0) > 0 ? 'cast' : 'held'}`);
  }
}

// ---------------------------------------------------------- 9. hysteresis --
console.log('\n=== 9. targets are not swapped on a whim ===');
{
  const match = raid();
  const hero = heroes(match)[0];
  const near = plantAll(match, hero.pos, [{ x: 100, y: 0 }, { x: 96, y: 0 }]);
  if (near.length < 2) {
    check('the fixture has two enemies', false);
  } else {
    const [a, b] = near;
    hero.tactics.priority = 'closest';
    hero.tactics.focusFire = false;
    const squad = match.squads.get(hero.squadId);
    squad.focusTargetId = null;
    squad._boardAt = -1;
    hero.target = a.id;
    hero._targetSince = match.time;
    const picked = pickTarget(match, hero, squad, [a, b]);
    check('a marginally better target does not steal the slot',
      picked?.id === a.id, picked?.id === b.id ? 'switched' : 'held');

    // A clearly better one does.
    b.pos = { x: hero.pos.x + 20, y: hero.pos.y };
    hero._targetSince = match.time - 5;
    squad._boardAt = -1;
    const picked2 = pickTarget(match, hero, squad, [a, b]);
    check('a clearly better one does', picked2?.id === b.id);
  }
}

// ---------------------------------------------------------------- 10. kite --
console.log('\n=== 10. kiters retreat from the crowd, not the target ===');
{
  const match = raid();
  const hero = ranged(match) ?? heroes(match)[0];
  hero.tactics.stance = 'evasive';
  hero.hp = hero.maxHp;
  // One in front, one behind: backing straight away from the front one runs
  // into the other, which is the whole point of the change. Planted rather
  // than borrowed off the map for the same reason as everything above — this
  // is a claim about kiting, not about what lives near this landing zone.
  const foes = plantAll(match, hero.pos, [{ x: 40, y: 0 }, { x: -90, y: 0 }]);
  for (const f of foes) { f.evading = false; }
  hero.target = foes[0].id;
  const before = Math.min(...foes.map((f) => dist(hero.pos, f.pos)));
  for (let i = 0; i < 45; i++) updateHero(match, hero, TICK);
  const after = Math.min(...foes.map((f) => dist(hero.pos, f.pos)));
  check('a kiter opens the gap on the nearest threat, whichever it is',
    after > before, `${before.toFixed(0)} -> ${after.toFixed(0)} units`);
}

// ------------------------------------------------------- 11. death saves --
console.log('\n=== 11. a revive does not take the sim with it ===');
{
  // Phoenix Ash clears every status on the hero it brings back. If the thing
  // that killed them was a damage-over-time, that clearing happens inside the
  // loop walking those statuses, and the next pass reads a slot that is no
  // longer there. It crashed the whole match rather than any one entity, and
  // it stayed hidden for as long as squads rarely lived long enough to be
  // carrying a revive when a dot finished them.
  const match = raid();
  const hero = heroes(match)[0];
  // The dot needs a hostile source: damage from your own side does not land,
  // so a status sourced at the hero themselves ticks harmlessly forever and
  // the check passes without ever reaching the code it is about.
  const biter = planted(match, hero, { x: 300, y: 0 });
  hero.consumables = [makeConsumable('phoenix_ash', 1)];
  hero.hp = 1;
  // Two of them, so the list has something left to walk after the first tick
  // kills its owner.
  for (let i = 0; i < 2; i++) {
    hero.statuses.push({
      status: 'bleed', type: 'debuff', remaining: 9, tick: 0.1, tickTimer: 0,
      damage: { base: 500, school: 'physical' }, sourceId: biter.id,
    });
  }
  let threw = null;
  try {
    for (let i = 0; i < 10 && match.phase === 'running'; i++) match.update(TICK);
  } catch (err) { threw = err; }
  check('a dot that kills a hero holding Phoenix Ash does not throw',
    threw === null, threw ? threw.message : 'survived the tick');
  check('and the ash was spent bringing them back',
    hero.consumables[0].count === 0 && hero.statuses.length === 0,
    `${hero.consumables[0].count} left, ${hero.statuses.length} statuses`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll hero AI checks passed');
process.exit(failures ? 1 : 0);
