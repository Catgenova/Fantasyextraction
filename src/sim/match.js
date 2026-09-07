// The raid instance. Owns the world, drives every entity, schedules world
// events, runs the collapse, and decides when the run is over.

import { makeRng, randInt, pick, randomInCircle } from '../core/rng.js';
import { dist, dist2, norm, clamp } from '../core/vec.js';
import { generateMap, WORLD_SIZE, CENTER, tierAt, extractIsOpen, resolveCollisions } from './map.js';
import { makeHeroEntity, makeEnemyEntity, resetIds, lootableFrom, hpFrac, recomputeStats } from './entity.js';
import { updateHero, updateMonster, squadObjective, tryDeathSave } from './ai.js';
import { tickStatuses, updateProjectiles, dealDamage } from './combat.js';
import { ENEMIES, WORLD_EVENTS, MATCH_SECONDS } from '../data/enemies.js';
import { rollLoot } from '../data/loot.js';
import { RARITIES } from '../data/gear.js';
import { treeMods, addMods, emptyMods } from './stats.js';
import { READY_FOR_BOSS_TIER } from '../data/tactics.js';

export const TICK = 1 / 30;           // fixed sim step
const CAMP_ACTIVATE = 1700;
const CAMP_DEACTIVATE = 2800;
const CAMP_RESPAWN = 100;
const COLLAPSE_START = 1500;
const COLLAPSE_END = MATCH_SECONDS;
const COLLAPSE_MAX_R = WORLD_SIZE * 0.75;
// The final safe circle still contains every extraction point — the collapse
// squeezes you toward the exits, it does not delete them.
const COLLAPSE_MIN_R = WORLD_SIZE * 0.32;
const ENTITY_CELL = 400;
const ENTITY_BUDGET = 240;   // camps stop streaming in past this

export class Match {
  /**
   * @param {{seed:number, playerSquad:object, botSquads:Array}} config
   *   `playerSquad` and each bot squad: {id, name, heroes:[...], tactics}
   */
  constructor(config) {
    resetIds();
    this.config = config;
    this.seed = config.seed ?? (Date.now() >>> 0);
    this.rng = makeRng(this.seed);
    this.map = generateMap(this.seed);

    this.time = 0;
    this.phase = 'running';     // running | ended
    this.result = null;
    this.speed = 1;

    this.entities = [];
    this.entityIndex = new Map();
    this.squads = new Map();
    this.projectiles = [];
    this.projectileSeq = 0;
    this.lootPiles = [];
    this.telegraphs = [];
    this.floats = [];
    this.blasts = [];
    this.swings = [];
    this.feed = [];
    this.activeEvents = [];
    this.firedEvents = new Set();
    this.collapseActive = false;
    this.collapseRadius = COLLAPSE_MAX_R;
    this.spawnRateMult = 1;
    this.enemyDamageMult = 1;

    this._grid = new Map();
    this._gridTime = -1;

    this.stats = { kills: 0, bossKills: 0, heroKills: 0, looted: 0 };
    // Which bosses the *player's* squad put down, by definition id. Rival
    // squads kill bosses too, and their trophies are not yours.
    this.bossesKilled = [];

    this.#setupSquads();
    this.#setupCamps();
  }

  // -------------------------------------------------------------- setup ----

  #setupSquads() {
    const all = [this.config.playerSquad, ...(this.config.botSquads ?? [])];
    const spawnOrder = this.#assignSpawns(all.length);

    all.forEach((squadCfg, i) => {
      const spawn = spawnOrder[i % spawnOrder.length];
      const squad = {
        id: squadCfg.id,
        name: squadCfg.name,
        team: squadCfg.id,
        isPlayer: !!squadCfg.isPlayer,
        tactics: { ...squadCfg.tactics },
        memberIds: [],
        leaderId: null,
        focusTargetId: null,
        order: { mode: 'travel', pos: { x: spawn.x, y: spawn.y }, label: 'Landing' },
        manualOrder: null,
        roamGoal: null,
        heading: norm({ x: CENTER.x - spawn.x, y: CENTER.y - spawn.y }),
        spawn,
        extractedCount: 0,
        resolved: false,
        outcome: null,
      };

      squadCfg.heroes.forEach((hero, hi) => {
        const off = randomInCircle(this.rng, 70);
        const e = makeHeroEntity(hero, {
          team: squad.team,
          squadId: squad.id,
          isPlayer: squad.isPlayer,
          pos: { x: spawn.x + off.x, y: spawn.y + off.y },
        });
        // A live reference, not a copy: the loot floor and the consumable
        // toggle are standing orders the player can change mid-raid, and the
        // squad has to start obeying the new one on the next pickup.
        e.squadTactics = squad.tactics;
        this.addEntity(e);
        squad.memberIds.push(e.id);
      });

      // The leader is named by hero, not by slot, so reordering the squad
      // cannot silently hand the role to somebody else.
      const named = squad.memberIds
        .map((id) => this.byId(id))
        .find((m) => m.heroId === squadCfg.tactics.leaderId);
      squad.leaderId = named?.id ?? squad.memberIds[0];
      squad.regrouping = false;
      this.squads.set(squad.id, squad);
      this.#applyAuras(squad);
    });

    this.playerSquad = this.squads.get(this.config.playerSquad.id);
  }

  /**
   * Hand out landing zones so no two squads start next door to each other.
   * With 12 spawns and up to 6 squads that means striding around the ring.
   */
  #assignSpawns(squadCount) {
    const spawns = this.map.spawns;
    const stride = Math.max(1, Math.floor(spawns.length / Math.max(1, squadCount)));
    const start = randInt(this.rng, 0, spawns.length - 1);
    const picked = [];
    const used = new Set();
    for (let i = 0; i < squadCount; i++) {
      let idx = (start + i * stride) % spawns.length;
      let guard = 0;
      while (used.has(idx) && guard++ < spawns.length) idx = (idx + 1) % spawns.length;
      used.add(idx);
      picked.push(spawns[idx]);
    }
    return picked;
  }

  /** Skill-tree auras are squad-wide and static, so fold them in once. */
  #applyAuras(squad) {
    const members = squad.memberIds.map((id) => this.byId(id));
    const aura = emptyMods();
    for (const m of members) {
      const { aura: a } = treeMods(m.classId, this.config.allocFor?.(m) ?? this.#allocOf(m));
      addMods(aura, a);
    }
    for (const m of members) {
      m.auraMods = { ...aura };
      recomputeStats(m);
      m.hp = m.maxHp;
      m.mana = m.maxMana;
    }
  }

  #allocOf(entity) {
    const squadCfg = [this.config.playerSquad, ...(this.config.botSquads ?? [])]
      .find((s) => s.id === entity.squadId);
    return squadCfg?.heroes.find((h) => h.id === entity.heroId)?.alloc ?? {};
  }

  #setupCamps() {
    for (const poi of this.map.pois) {
      if (poi.kind === 'camp') {
        poi.active = false;
        poi.respawnAt = 0;
        poi.spawnedIds = [];
      } else if (poi.kind === 'boss') {
        poi.spawned = false;
      }
    }
  }

  // ------------------------------------------------------------ entities ----

  addEntity(e) {
    this.entities.push(e);
    this.entityIndex.set(e.id, e);
    return e;
  }

  byId(id) { return id ? this.entityIndex.get(id) ?? null : null; }

  clampToMap(e) { resolveCollisions(this.map, e.pos, e.radius); }

  /** Rebuilt once per tick; every spatial query below reads it. */
  #rebuildGrid() {
    if (this._gridTime === this.time) return;
    this._gridTime = this.time;
    this._grid.clear();
    for (const e of this.entities) {
      if (!e.alive || e.extracted) continue;
      const key = `${Math.floor(e.pos.x / ENTITY_CELL)},${Math.floor(e.pos.y / ENTITY_CELL)}`;
      let bucket = this._grid.get(key);
      if (!bucket) { bucket = []; this._grid.set(key, bucket); }
      bucket.push(e);
    }
  }

  neighbours(pos, radius) {
    this.#rebuildGrid();
    const span = Math.ceil(radius / ENTITY_CELL);
    const gx = Math.floor(pos.x / ENTITY_CELL);
    const gy = Math.floor(pos.y / ENTITY_CELL);
    const r2 = radius * radius;
    const out = [];
    for (let dy = -span; dy <= span; dy++) {
      for (let dx = -span; dx <= span; dx++) {
        const bucket = this._grid.get(`${gx + dx},${gy + dy}`);
        if (!bucket) continue;
        for (const e of bucket) if (dist2(pos, e.pos) <= r2) out.push(e);
      }
    }
    return out;
  }

  hostilesNear(e, radius) {
    return this.neighbours(e.pos, radius).filter((o) => o.alive && !o.extracted && o.team !== e.team);
  }

  alliesOf(e, excludeSelf = false) {
    const squad = this.squads.get(e.squadId);
    if (!squad) return [];
    return squad.memberIds
      .map((id) => this.byId(id))
      .filter((m) => m && m.alive && !m.extracted && (!excludeSelf || m.id !== e.id));
  }

  lowestAlly(e) {
    const pool = [e, ...this.alliesOf(e, true)].filter((a) => a.alive);
    if (!pool.length) return null;
    return pool.reduce((a, b) => (hpFrac(a) <= hpFrac(b) ? a : b));
  }

  // ------------------------------------------------------------ feedback ----

  pushFloat(pos, text, color = '#fff', big = false) {
    this.floats.push({ x: pos.x, y: pos.y - 10, text, color, life: big ? 1.5 : 1.0, big });
    if (this.floats.length > 260) this.floats.splice(0, this.floats.length - 260);
  }

  pushCast(e, spell) {
    this.pushFloat({ x: e.pos.x, y: e.pos.y - 22 }, spell.name, '#cbb9ff');
    if (e.isPlayer) this.log(`${e.name} casts ${spell.name}`, 'cast');
  }

  pushSwing(e, target) {
    this.swings.push({ from: { ...e.pos }, to: { ...target.pos }, life: 0.12, color: e.kind === 'hero' ? '#ffe6a8' : '#ff9d8a' });
  }

  pushBlast(pos, radius, color) {
    this.blasts.push({ x: pos.x, y: pos.y, radius, color, life: 0.35 });
  }

  pushTelegraph(t) {
    this.telegraphs.push({ ...t, remaining: t.delay, total: t.delay });
  }

  log(text, kind = 'info') {
    this.feed.push({ t: this.time, text, kind });
    if (this.feed.length > 80) this.feed.shift();
  }

  rarityColor(item) {
    return RARITIES[item.rarity]?.color ?? '#cfd6e2';
  }

  // ---------------------------------------------------------------- tick ----

  /** Advance the sim. `dt` is real seconds; internally stepped at TICK. */
  update(dt) {
    if (this.phase === 'ended') return;
    this._accum = (this._accum ?? 0) + dt * this.speed;
    let steps = 0;
    while (this._accum >= TICK && steps < 8) {
      this._accum -= TICK;
      this.#step(TICK);
      steps++;
      if (this.phase === 'ended') break;
    }
    this.#decay(dt);
  }

  #step(dt) {
    this.time += dt;

    this.#updateWorldEvents();
    this.#updateCollapse(dt);

    // Camp streaming and squad-level planning are coarse decisions; running
    // them every tick is pure waste on a map this size.
    this._campTimer = (this._campTimer ?? 0) - dt;
    if (this._campTimer <= 0) { this._campTimer = 0.5; this.#updateCamps(); }

    for (const e of this.entities) {
      if (!e.alive || e.extracted) continue;
      tickStatuses(this, e, dt);
    }

    this._planTimer = (this._planTimer ?? 0) - dt;
    const replan = this._planTimer <= 0;
    if (replan) this._planTimer = 0.25;

    for (const squad of this.squads.values()) {
      if (squad.resolved) continue;
      if (replan || !squad.order) squad.order = squadObjective(this, squad);
      const leader = this.byId(squad.leaderId);
      if (!leader?.alive) {
        const alt = squad.memberIds.map((id) => this.byId(id)).find((m) => m?.alive && !m.extracted);
        squad.leaderId = alt?.id ?? squad.leaderId;
      }
      const anchor = this.byId(squad.leaderId);
      if (anchor?.alive) squad.heading = norm({ x: squad.order.pos.x - anchor.pos.x, y: squad.order.pos.y - anchor.pos.y });
    }

    for (const e of this.entities) {
      if (!e.alive || e.extracted) continue;
      if (e.kind === 'hero') updateHero(this, e, dt);
      else updateMonster(this, e, dt);
    }

    // Retire emptied loot piles so the pickup scan stays cheap over 30 minutes.
    this._pileTimer = (this._pileTimer ?? 0) - dt;
    if (this._pileTimer <= 0) {
      this._pileTimer = 2;
      for (let i = this.lootPiles.length - 1; i >= 0; i--) {
        const pile = this.lootPiles[i];
        if (pile.dead || !pile.items.length) this.lootPiles.splice(i, 1);
      }
    }

    updateProjectiles(this, dt);
    this.#updateTelegraphs(dt);
    this.#updateExtraction(dt);
    this.#cullEntities();
    this.#checkEnd();
  }

  #decay(dt) {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      f.y -= 22 * dt;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      this.blasts[i].life -= dt;
      if (this.blasts[i].life <= 0) this.blasts.splice(i, 1);
    }
    for (let i = this.swings.length - 1; i >= 0; i--) {
      this.swings[i].life -= dt;
      if (this.swings[i].life <= 0) this.swings.splice(i, 1);
    }
  }

  #updateTelegraphs(dt) {
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i];
      t.remaining -= dt;
      if (t.remaining > 0) continue;
      const source = this.byId(t.sourceId);
      this.pushBlast(t.pos, t.radius, '#ff7a5c');
      if (source?.alive) {
        for (const victim of this.neighbours(t.pos, t.radius)) {
          if (victim.team === source.team || !victim.alive) continue;
          dealDamage(this, source, victim, { ...t.damage, base: t.damage.base * this.enemyDamageMult });
        }
      }
      this.telegraphs.splice(i, 1);
    }
  }

  // --------------------------------------------------------------- camps ----

  #updateCamps() {
    const squadCentres = [...this.squads.values()]
      .filter((s) => !s.resolved)
      .map((s) => this.squadCentroid(s))
      .filter(Boolean);
    if (!squadCentres.length) return;

    for (const poi of this.map.pois) {
      const nearest = Math.min(...squadCentres.map((c) => dist(c, poi)));

      if (poi.kind === 'camp') {
        if (!poi.active && nearest < CAMP_ACTIVATE && this.time >= poi.respawnAt
            && this.entities.length < ENTITY_BUDGET) {
          this.#populateCamp(poi);
        } else if (poi.active && nearest > CAMP_DEACTIVATE) {
          // Despawn untouched camps so the sim stays cheap on a huge map.
          const survivors = poi.spawnedIds.map((id) => this.byId(id)).filter((e) => e?.alive);
          if (survivors.every((e) => this.time - e.lastDamageAt > 12)) {
            for (const e of survivors) this.#removeEntity(e);
            poi.active = false;
            poi.spawnedIds = [];
            poi.respawnAt = this.time;
          }
        } else if (poi.active) {
          const alive = poi.spawnedIds.some((id) => this.byId(id)?.alive);
          if (!alive) { poi.active = false; poi.spawnedIds = []; poi.respawnAt = this.time + CAMP_RESPAWN; }
        }
      } else if (poi.kind === 'boss' && !poi.spawned && nearest < 1500) {
        const boss = makeEnemyEntity(poi.bossId, {
          pos: { x: poi.x, y: poi.y }, isBoss: true, tierScale: 1, ownerPoi: poi.id, rng: this.rng,
        });
        this.addEntity(boss);
        poi.spawned = true;
        poi.bossEntityId = boss.id;
        this.log(`${boss.name} stirs.`, 'boss');
      }
    }
  }

  #populateCamp(poi) {
    const pools = {
      0: ['rat_swarm', 'bandit', 'bandit', 'bandit_archer'],
      1: ['ghoul', 'ghoul', 'cultist', 'ogre'],
      2: ['wraith', 'wraith', 'revenant', 'ghoul'],
    };
    const pool = pools[poi.tier] ?? pools[0];
    const count = randInt(this.rng, 3, 6) + (poi.tier === 2 ? 2 : 0);
    const tierScale = (1 + poi.tier * 0.3) * (1 + this.time / MATCH_SECONDS * 0.35);

    poi.active = true;
    poi.spawnedIds = [];
    for (let i = 0; i < count; i++) {
      const off = randomInCircle(this.rng, poi.radius * 0.8);
      const defId = pick(this.rng, pool);
      // Elites are rare in a camp; one at most.
      if (ENEMIES[defId].rank === 'elite' && poi.spawnedIds.some((id) => this.byId(id)?.rank === 'elite')) continue;
      const e = makeEnemyEntity(defId, {
        pos: { x: poi.x + off.x, y: poi.y + off.y }, tierScale, ownerPoi: poi.id, rng: this.rng,
      });
      resolveCollisions(this.map, e.pos, e.radius);
      e.homePos = { ...e.pos };
      this.addEntity(e);
      poi.spawnedIds.push(e.id);
    }
  }

  summonAdds(source, defId, count, opts = {}) {
    // A boss on a long fight must not bury the map in adds.
    source.addIds = (source.addIds ?? []).filter((id) => this.byId(id)?.alive);
    const room = opts.maxAlive ? Math.max(0, opts.maxAlive - source.addIds.length) : count;
    count = Math.min(count, room);
    for (let i = 0; i < count; i++) {
      const off = randomInCircle(this.rng, 130);
      const e = makeEnemyEntity(defId, {
        pos: { x: source.pos.x + off.x, y: source.pos.y + off.y },
        tierScale: 1.2, ownerPoi: source.ownerPoi, rng: this.rng,
      });
      e.homePos = { ...source.pos };
      if (opts.lifespan) e.despawnAt = this.time + opts.lifespan;
      this.addEntity(e);
      source.addIds.push(e.id);
    }
  }

  #removeEntity(e) {
    e.alive = false;
    e.removed = true;
    this.entityIndex.delete(e.id);
    const idx = this.entities.indexOf(e);
    if (idx >= 0) this.entities.splice(idx, 1);
  }

  #cullEntities() {
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      // Summoned adds expire so a long boss fight cannot snowball forever.
      if (e.alive && e.despawnAt && this.time > e.despawnAt && this.time - e.lastDamageAt > 8) {
        this.#removeEntity(e);
        continue;
      }
      // Corpses linger briefly for readability, then leave the array.
      if (e.alive || e.kind === 'hero') continue;
      e.corpseTimer = (e.corpseTimer ?? 6) - TICK;
      if (e.corpseTimer <= 0) {
        this.entityIndex.delete(e.id);
        this.entities.splice(i, 1);
      }
    }
  }

  // -------------------------------------------------------------- deaths ----

  killEntity(target, killer) {
    if (!target.alive) return;
    if (target.kind === 'hero' && tryDeathSave(this, target)) return;

    target.alive = false;
    target.hp = 0;
    target.vel = { x: 0, y: 0 };
    target.deathTime = this.time;
    target.killerId = killer?.id ?? null;

    if (target.kind === 'hero') {
      this.stats.heroKills++;
      const drops = lootableFrom(target);
      // Keep a record for the after-action report: the entity itself is
      // stripped here, so buildResult would otherwise have nothing to show.
      target.lostOnDeath = drops.slice();
      target.inventory = [];
      target.equipped = {};
      target.consumables = [];
      this.dropLoot(target.pos, drops, { fromHero: true });
      this.log(`${target.name} was killed by ${killer?.name ?? 'the raid'}.`, target.isPlayer ? 'bad' : 'info');
      if (killer?.kind === 'hero') killer.stats_run.kills++;
    } else {
      this.stats.kills++;
      const killerSquad = killer ? this.squads.get(killer.squadId) : null;
      if (target.kind === 'boss') {
        this.stats.bossKills++;
        this.log(`${target.name} has fallen!`, 'boss');
        if (killerSquad && killerSquad === this.playerSquad && !this.bossesKilled.includes(target.defId)) {
          this.bossesKilled.push(target.defId);
        }
      }
      if (killerSquad) this.#awardXp(killerSquad, target.xp);
      if (killer?.kind === 'hero') killer.stats_run.kills++;

      const ilvl = 1 + Math.round((tierAt(target.pos) * 3) + this.time / 200);
      const drops = rollLoot(this.rng, target.lootTable ?? 'trash_low', { ilvl, luck: target.rank === 'boss' ? 0.25 : 0 });
      if (drops.length) this.dropLoot(target.pos, drops, {});
    }
  }

  #awardXp(squad, xp) {
    for (const id of squad.memberIds) {
      const m = this.byId(id);
      if (m?.alive && !m.extracted) m.xpEarned = (m.xpEarned ?? 0) + xp;
    }
  }

  dropLoot(pos, items, meta = {}) {
    if (!items.length) return null;
    const pile = {
      id: `loot_${this.lootPiles.length}`,
      pos: { x: pos.x, y: pos.y },
      items,
      dead: false,
      fromHero: !!meta.fromHero,
      best: items.reduce((a, b) => (rarityRank(b) > rarityRank(a) ? b : a)),
      createdAt: this.time,
    };
    this.lootPiles.push(pile);
    return pile;
  }

  // ---------------------------------------------------------- extraction ----

  #updateExtraction(dt) {
    for (const squad of this.squads.values()) {
      if (squad.resolved) continue;
      const target = squad.order?.extract ?? null;

      for (const id of squad.memberIds) {
        const m = this.byId(id);
        if (!m?.alive || m.extracted) continue;

        const ex = this.map.extracts.find((x) => dist(m.pos, x) <= x.radius && extractIsOpen(x, this.time));
        if (!ex) { m.extractProgress = 0; m.extractingAt = null; continue; }

        // Taking damage pauses the channel; it does not wipe it. Resetting to
        // zero meant anything that could land a hit once every eight seconds
        // kept a hero at the door indefinitely, and being chased to the exit
        // is the normal way to arrive at one.
        m.extractingAt = ex.id;
        if (this.time - m.lastDamageAt < 1.2) continue;
        m.extractProgress = (m.extractProgress ?? 0) + dt;
        if (m.extractProgress >= ex.channelSeconds) {
          m.extracted = true;
          m.extractedAt = this.time;
          squad.extractedCount++;
          this.log(`${m.name} extracted at ${ex.name}.`, m.isPlayer ? 'good' : 'info');
        }
      }
    }
  }

  // ------------------------------------------------------------- collapse ---

  #updateCollapse(dt) {
    if (this.time < COLLAPSE_START) return;
    if (!this.collapseActive) {
      this.collapseActive = true;
      this.log('The Collapse has begun. Extract now.', 'bad');
    }
    const t = clamp((this.time - COLLAPSE_START) / (COLLAPSE_END - COLLAPSE_START), 0, 1);
    this.collapseRadius = COLLAPSE_MAX_R + (COLLAPSE_MIN_R - COLLAPSE_MAX_R) * t;

    this._collapseTick = (this._collapseTick ?? 0) + dt;
    if (this._collapseTick < 0.5) return;
    this._collapseTick = 0;
    for (const e of this.entities) {
      if (!e.alive || e.extracted) continue;
      if (dist(e.pos, CENTER) <= this.collapseRadius) continue;
      const dmg = Math.max(6, Math.round(e.maxHp * 0.03));
      e.hp -= dmg;
      e.lastDamageAt = this.time;
      this.pushFloat(e.pos, `${dmg}`, '#ff5c5c');
      if (e.hp <= 0) this.killEntity(e, null);
    }
  }

  // --------------------------------------------------------- world events ---

  #updateWorldEvents() {
    for (const def of WORLD_EVENTS) {
      if (this.firedEvents.has(def.id) || this.time < def.at) continue;
      this.firedEvents.add(def.id);
      this.#fireEvent(def);
    }

    // Expire finished events.
    for (let i = this.activeEvents.length - 1; i >= 0; i--) {
      const ev = this.activeEvents[i];
      if (ev.endsAt && this.time > ev.endsAt) {
        if (ev.modifiers) { this.spawnRateMult = 1; this.enemyDamageMult = 1; }
        this.activeEvents.splice(i, 1);
      }
    }

    // Capture events tick down while a squad holds the circle uncontested.
    for (const ev of this.activeEvents) {
      if (ev.kind !== 'capture' || ev.claimed) continue;
      const holders = new Map();
      for (const e of this.neighbours(ev.pos, 240)) {
        if (e.kind !== 'hero' || !e.alive) continue;
        holders.set(e.squadId, (holders.get(e.squadId) ?? 0) + 1);
      }
      const guardsAlive = ev.guardIds?.some((id) => this.byId(id)?.alive);
      if (holders.size !== 1 || guardsAlive) { ev.progress = Math.max(0, (ev.progress ?? 0) - TICK); continue; }
      const [squadId] = [...holders.keys()];
      ev.progress = (ev.progress ?? 0) + TICK;
      ev.holder = squadId;
      if (ev.progress >= ev.captureSeconds) {
        ev.claimed = true;
        const drops = rollLoot(this.rng, ev.lootTable, { ilvl: 8 + Math.round(this.time / 150), luck: 0.2 });
        this.dropLoot(ev.pos, drops, {});
        this.log(`${this.squads.get(squadId)?.name ?? 'A squad'} claimed the ${ev.name}.`, 'event');
      }
    }
  }

  #fireEvent(def) {
    const ev = {
      ...def,
      startedAt: this.time,
      endsAt: def.window >= 999 ? null : this.time + def.window,
      progress: 0,
      guardIds: [],
    };

    if (def.kind === 'collapse') { this.log(def.name + ': ' + def.blurb, 'bad'); return; }

    if (def.kind === 'surge') {
      this.spawnRateMult = def.modifiers.spawnRateMult;
      this.enemyDamageMult = def.modifiers.enemyDamageMult;
      this.activeEvents.push(ev);
      this.log(`${def.name}: ${def.blurb}`, 'event');
      return;
    }

    if (def.kind === 'boss') {
      const poi = this.map.pois.find((p) => p.kind === 'boss_event');
      const boss = makeEnemyEntity(def.boss, { pos: { x: poi.x, y: poi.y }, isBoss: true, ownerPoi: poi.id, rng: this.rng });
      this.addEntity(boss);
      ev.pos = { x: poi.x, y: poi.y };
      ev.bossId = boss.id;
      this.activeEvents.push(ev);
      this.log(`${def.name}: ${def.blurb}`, 'boss');
      return;
    }

    // Cache and capture events land on a pre-picked anchor site.
    const site = pick(this.rng, this.map.eventSites);
    ev.pos = { x: site.x, y: site.y };
    for (const g of def.guardTable ?? []) {
      for (let i = 0; i < g.count; i++) {
        const off = randomInCircle(this.rng, 200);
        const e = makeEnemyEntity(g.enemy, {
          pos: { x: ev.pos.x + off.x, y: ev.pos.y + off.y }, tierScale: 1.3, rng: this.rng,
        });
        e.homePos = { ...e.pos };
        this.addEntity(e);
        ev.guardIds.push(e.id);
      }
    }
    if (def.kind === 'cache') {
      const drops = rollLoot(this.rng, def.lootTable, { ilvl: 6 + Math.round(this.time / 180) });
      const pile = this.dropLoot(ev.pos, drops, {});
      ev.pileId = pile?.id ?? null;
    }
    this.activeEvents.push(ev);
    this.log(`${def.name}: ${def.blurb}`, 'event');
  }

  // ------------------------------------------------------------- helpers ----

  squadCentroid(squad) {
    const members = squad.memberIds.map((id) => this.byId(id)).filter((m) => m?.alive && !m.extracted);
    if (!members.length) return null;
    let x = 0, y = 0;
    for (const m of members) { x += m.pos.x; y += m.pos.y; }
    return { x: x / members.length, y: y / members.length };
  }

  nearestRivalSquadPos(squad, from) {
    let best = null;
    let bd = Infinity;
    for (const other of this.squads.values()) {
      if (other.id === squad.id || other.resolved) continue;
      const c = this.squadCentroid(other);
      if (!c) continue;
      const d = dist(from, c);
      if (d < bd) { bd = d; best = c; }
    }
    return bd < 2200 ? best : null;
  }

  /**
   * A wander target biased toward deeper rings for aggressive plans.
   *
   * A boss hunt goes for the deepest arena the squad is ready for rather than
   * the deepest arena there is. With one boss per ring that distinction barely
   * mattered; with seven it decides the raid, and a level-5 squad sent to the
   * core to hunt three bosses at once wiped in eight runs out of eight with
   * nothing to show. `level` is the squad's, so the ladder in
   * `READY_FOR_BOSS_TIER` is the same one that decides which classes a rival
   * of that level may field.
   */
  pickRoamGoal(from, zoneBias, level = 1) {
    const wantTier = clamp(zoneBias, 0, 2);
    let readyFor = 0;
    while (readyFor < 2 && level >= READY_FOR_BOSS_TIER[readyFor + 1]) readyFor++;
    const candidates = this.map.pois.filter((p) => p.kind === 'camp' || p.kind === 'boss');
    let best = null;
    let bestScore = -Infinity;
    for (const p of candidates) {
      const d = dist(from, p);
      if (d < 260) continue;
      const tierMatch = -Math.abs((p.tier ?? 0) - wantTier) * 700;
      let bossBonus = 0;
      if (p.kind === 'boss') {
        if (zoneBias >= 2) {
          // Out of their depth is not a small penalty: it is the difference
          // between a haul and a wipe, so it outweighs the bonus entirely.
          const overReach = Math.max(0, (p.tier ?? 0) - readyFor);
          bossBonus = 900 - overReach * 1600;
        } else {
          // Everyone else steers clear, so that meeting a boss is a decision
          // rather than an accident of where the roam goal landed. Worth only
          // about one wipe in twelve farming runs on its own — the plan is
          // already biased to the outer ring — but it never measured worse,
          // and with seven arenas on the map the accident is common enough to
          // be worth ruling out.
          bossBonus = -1200;
        }
      }
      const score = tierMatch + bossBonus - d * 0.55 + this.rng() * 500;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (!best) return { x: CENTER.x, y: CENTER.y };
    return { x: best.x, y: best.y };
  }

  // ----------------------------------------------------------------- end ----

  #checkEnd() {
    for (const squad of this.squads.values()) {
      if (squad.resolved) continue;
      const members = squad.memberIds.map((id) => this.byId(id));
      const done = members.every((m) => !m || !m.alive || m.extracted);
      if (done) {
        squad.resolved = true;
        squad.outcome = members.some((m) => m?.extracted) ? 'extracted' : 'wiped';
      }
    }

    const player = this.playerSquad;
    if (player?.resolved || this.time >= MATCH_SECONDS) {
      this.phase = 'ended';
      this.result = this.buildResult();
    }
  }

  buildResult() {
    const squad = this.playerSquad;
    const heroes = squad.memberIds.map((id) => this.byId(id)).map((m) => ({
      entityId: m.id,
      heroId: m.heroId,
      name: m.name,
      classId: m.classId,
      extracted: !!m.extracted,
      alive: m.alive,
      xp: m.xpEarned ?? 0,
      kills: m.stats_run.kills,
      damage: Math.round(m.stats_run.damage),
      healing: Math.round(m.stats_run.healing),
      taken: Math.round(m.stats_run.taken),
      // Only extracted heroes keep anything.
      kept: m.extracted ? [...m.inventory] : [],
      keptEquipped: m.extracted ? { ...m.equipped } : {},
      keptConsumables: m.extracted ? m.consumables.filter((c) => c.count > 0) : [],
      lost: m.extracted ? [] : (m.lostOnDeath ?? [...m.inventory, ...Object.values(m.equipped).filter(Boolean)]),
    }));

    const extractedCount = heroes.filter((h) => h.extracted).length;
    return {
      seed: this.seed,
      duration: this.time,
      outcome: extractedCount > 0 ? (extractedCount === heroes.length ? 'clean' : 'partial') : 'wiped',
      heroes,
      stats: { ...this.stats },
      bossesKilled: [...this.bossesKilled],
      timedOut: this.time >= MATCH_SECONDS,
    };
  }
}

function rarityRank(item) {
  return ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(item.rarity ?? 'common');
}
