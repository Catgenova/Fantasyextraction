// The raid instance. Owns the world, drives every entity, schedules world
// events, runs the collapse, and decides when the run is over.

import { makeRng, randInt, pick, randomInCircle } from '../core/rng.js';
import { dist, dist2, norm, clamp } from '../core/vec.js';
import { generateMap, WORLD_SIZE, CENTER, tierAt, extractIsOpen, resolveCollisions } from './map.js';
import { makeHeroEntity, makeEnemyEntity, resetIds, lootableFrom, hpFrac, recomputeStats } from './entity.js';
import { updateHero, updateMonster, squadObjective, tryDeathSave } from './ai.js';
import { tickStatuses, updateProjectiles, dealDamage } from './combat.js';
import { WORLD_EVENTS, MATCH_SECONDS } from '../data/enemies.js';
import { QUALITIES, CARVE_PROFILE, QUALITY_ORDER, makePart } from '../data/parts.js';
import { CREATURES } from '../data/creatures.js';
import { treeMods, addMods, emptyMods } from './stats.js';
import { setAuras } from '../data/sets.js';
import { READY_FOR_BOSS_TIER } from '../data/tactics.js';
import { poiMatchesQuarry, sanitizeQuarry, quarryLabel } from '../data/hunts.js';

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
const CARCASS_SECONDS = 100; // how long an uncarved body is worth walking back to
// Sustained damage a pack is allowed to represent, by ring. A large pack is
// a little over twice this.
const PACK_BUDGET = { 0: 115, 1: 210, 2: 330 };

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
    // What the player squad has met this raid, species id -> {kills, carves}.
    // This is what the journal is built from, and what decides which hunts
    // they can order: a species you have laid eyes on is one you can go and
    // look for again.
    this.encountered = {};
    // Species the player already knew when they landed, from the profile's
    // journal. A hunt can be ordered against these from the drop — you know
    // roughly where a Sicklejaw lives even before you find this raid's camp.
    this.priorKnowledge = new Set(config.knownSpecies ?? []);
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

    // A quarry chosen in camp is a preference, not a promise: it was written
    // against the profile's journal, and this raid holds about fifteen of the
    // fifty species. If what they asked for is not here, say so at the drop
    // rather than steering the squad toward something that does not exist.
    // The squad's tactics are a copy, so this never writes back to the save.
    const standing = sanitizeQuarry(this.playerSquad?.tactics?.quarry);
    if (standing && !this.faunaSpecies().has(standing.speciesId)) {
      this.playerSquad.tactics.quarry = null;
      this.droppedQuarry = standing;
      this.log(`No ${CREATURES[standing.speciesId]?.name ?? 'quarry'} in this raid. Pick another hunt.`, 'event');
    } else if (this.playerSquad) {
      this.playerSquad.tactics.quarry = standing;
      if (standing) this.log(`Hunting ${quarryLabel(standing)}.`, 'event');
    }
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

  /**
   * Squad-wide auras, folded in once. Two sources: skill-tree nodes, and the
   * full armour sets — a Screelwing set is worth more to the squad than to the
   * wearer, which is exactly what a Screelwing is.
   */
  #applyAuras(squad) {
    const members = squad.memberIds.map((id) => this.byId(id));
    const aura = emptyMods();
    for (const m of members) {
      const { aura: a } = treeMods(m.classId, this.config.allocFor?.(m) ?? this.#allocOf(m));
      addMods(aura, a);
      addMods(aura, setAuras(m.equipped));
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
    // Stamped for the renderer: the sim is the only thing that knows a cast
    // happened, and the sprite layer has to pick an animation from something.
    e.lastCastAt = this.time;
    this.pushFloat({ x: e.pos.x, y: e.pos.y - 22 }, spell.name, '#cbb9ff');
    if (e.isPlayer) this.log(`${e.name} casts ${spell.name}`, 'cast');
  }

  pushSwing(e, target) {
    e.lastSwingAt = this.time;
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
    return QUALITIES[item.quality]?.color ?? '#cfd6e2';
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
          this.#noticePoi(poi);
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
          pos: { x: poi.x, y: poi.y }, tierScale: 1, ownerPoi: poi.id, rng: this.rng,
        });
        this.addEntity(boss);
        poi.spawned = true;
        poi.bossEntityId = boss.id;
        this.#noticePoi(poi);
        this.log(`${boss.name} stirs.`, 'boss');
      }
    }
  }

  #populateCamp(poi) {
    // A pack is one species, not a mixed camp. That is what makes "hunt a
    // small pack of Sicklejaw" a thing a player can ask for, and what makes
    // the carve at the end of it predictable enough to plan around.
    const species = CREATURES[poi.speciesId] ?? this.#pickPackSpecies(poi.tier);
    poi.speciesId = species.id;

    // Pack size is a threat budget, not a headcount. A species' own packSize
    // says how many of them travel together and caps the group, but eleven
    // Skiterlings and three Thornbacks are not the same fight — sizing on the
    // raw number put nineteen bodies on a starter squad and wiped it inside a
    // minute. The budget makes a small pack of anything a comparable ask.
    const [lo, hi] = species.packSize;
    const dps = species.damage / species.attackInterval;
    const budget = PACK_BUDGET[poi.tier] ?? PACK_BUDGET[0];
    const wanted = Math.round((poi.packKind === 'large' ? budget * 2.1 : budget) / dps);
    const cap = poi.packKind === 'large' ? Math.round(hi * 1.9) : hi;
    const count = Math.max(2, Math.min(cap, wanted));
    const tierScale = (1 + poi.tier * 0.3) * (1 + this.time / MATCH_SECONDS * 0.35);

    poi.active = true;
    poi.spawnedIds = [];
    for (let i = 0; i < count; i++) {
      const off = randomInCircle(this.rng, poi.radius * (poi.packKind === 'large' ? 1.1 : 0.8));
      const e = makeEnemyEntity(species.id, {
        pos: { x: poi.x + off.x, y: poi.y + off.y }, tierScale, ownerPoi: poi.id, rng: this.rng,
      });
      resolveCollisions(this.map, e.pos, e.radius);
      e.homePos = { ...e.pos };
      this.addEntity(e);
      poi.spawnedIds.push(e.id);
    }
  }

  /**
   * Record a sighting in the journal, if the player squad is the one who made
   * it.
   *
   * It has to be their own eyes: a rival squad walking past a Sicklejaw camp
   * on the far side of the map is not something the player has learned. Laying
   * eyes on a species is enough — you can meet something without ever getting
   * a knife into one, and the journal is a record of what you have met.
   */
  #noticePoi(poi) {
    const centre = this.squadCentroid(this.playerSquad);
    if (!centre || dist(centre, poi) > CAMP_ACTIVATE) return;
    const speciesId = poi.kind === 'camp' ? poi.speciesId : poi.bossId;
    if (speciesId) this.notice(speciesId, {});
  }

  /** Fold one sighting, kill or carve into this raid's encounter ledger. */
  notice(speciesId, tally = {}) {
    if (!speciesId || !CREATURES[speciesId]) return;
    const rec = this.encountered[speciesId] ??= { kills: 0, carves: 0 };
    rec.kills += tally.kills ?? 0;
    rec.carves += tally.carves ?? 0;
  }

  /**
   * The scouting report: what lives in this raid.
   *
   * A raid draws about fifteen of the fifty species, and the player is told
   * which at the drop. That is the difference between a hunt order and a
   * wish. The first version made an order name a species from the profile's
   * journal and had the squad go looking — which sounds better and played
   * far worse, because a journal remembers every species the player has ever
   * met and a map holds fifteen. Two orders in three named something that was
   * not here, and the squad spent the raid walking: over twelve seeds a
   * mid-ring order carved the quarry in three of them and halved the total
   * haul, 558 carves down to 258.
   *
   * So the map is honest about its own contents, and every hunt on the list
   * is one the squad can actually walk to.
   */
  fauna() {
    const out = [];
    for (const [tier, ids] of Object.entries(this.map.fauna ?? {})) {
      for (const id of ids) out.push({ speciesId: id, tier: Number(tier), hunt: 'small' });
    }
    for (const poi of this.map.pois) {
      if (poi.kind !== 'boss' && poi.kind !== 'boss_event') continue;
      out.push({ speciesId: poi.bossId, tier: poi.tier ?? 0, hunt: 'solo' });
    }
    return out;
  }

  /** Species present in this raid, as a set. */
  faunaSpecies() {
    return new Set(this.fauna().map((f) => f.speciesId));
  }

  /**
   * The nearest place that satisfies a quarry, or null if this raid holds
   * none.
   *
   * Ordering a hunt is what reveals the site: a squad told to hunt Sicklejaw
   * goes and finds the spoor. Requiring them to have already laid eyes on the
   * camp is what made an order a search, and a search is what the measurement
   * above rejected.
   */
  findQuarry(from, quarry) {
    if (!quarry?.speciesId) return null;
    let best = null;
    let bestD = Infinity;
    for (const poi of this.map.pois) {
      if (!poiMatchesQuarry(poi, quarry)) continue;
      // A ground whose creature is already dead is not a hunt any more.
      if (poi.bossEntityId && !this.byId(poi.bossEntityId)?.alive) continue;
      const d = dist(from, poi);
      if (d < bestD) { bestD = d; best = poi; }
    }
    return best;
  }

  /** A pack species that belongs in this ring. */
  #pickPackSpecies(tier) {
    const pool = Object.values(CREATURES).filter((c) => c.hunt === 'small' && c.tier === tier);
    const fallback = Object.values(CREATURES).filter((c) => c.hunt === 'small');
    const list = pool.length ? pool : fallback;
    return list[Math.floor(this.rng() * list.length)];
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
      // A body with cuts left in it is not scenery, it is the reason the fight
      // happened. It waits long enough to be worth coming back for — a solo
      // carcass is four to six cuts at four seconds each — and only starts the
      // short readability countdown once there is nothing left to take.
      if (e.alive || e.kind === 'hero') continue;
      if (e.carvesLeft > 0) {
        e.carcassTimer = (e.carcassTimer ?? CARCASS_SECONDS) - TICK;
        if (e.carcassTimer > 0) continue;
        e.carvesLeft = 0;
      }
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
      if (killerSquad === this.playerSquad) this.notice(target.defId, { kills: 1 });
      if (killerSquad) this.#awardXp(killerSquad, target.xp);
      if (killer?.kind === 'hero') killer.stats_run.kills++;

      // Nothing drops. The body is what is worth something, and only if
      // somebody has time to stand over it with a knife.
      const profile = target.carve ?? CARVE_PROFILE.small;
      const [lo, hi] = profile.carves;
      target.carvesLeft = lo + Math.floor(this.rng() * (hi - lo + 1));
    }
  }

  /**
   * Parts from a species chosen for the ring the drop landed in — somebody
   * else's carving, abandoned. `bias` pushes the grades up the way a solo
   * corpse does.
   */
  #cacheParts(count, bias = 0) {
    const tier = tierAt({ x: this.map.center.x, y: this.map.center.y });
    const pool = Object.values(CREATURES).filter((c) => c.hunt === 'small' && c.tier <= Math.max(tier, 1));
    const out = [];
    for (let i = 0; i < count; i++) {
      const species = pool[Math.floor(this.rng() * pool.length)];
      if (!species) break;
      out.push(this.rollPart(species, bias));
    }
    return out;
  }

  /** One carve off a species: a part type from its own table, at a rolled grade. */
  rollPart(species, bias = 0) {
    const entries = Object.entries(species.parts);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = this.rng() * total;
    let partType = entries[0][0];
    for (const [type, weight] of entries) {
      roll -= weight;
      if (roll <= 0) { partType = type; break; }
    }

    // Quality weights, pushed up by the carve profile and by how deep the
    // species lives. Nothing off a Nightfell is ever ragged.
    const steps = bias + species.tier;
    let best = 0;
    for (let attempt = 0; attempt <= steps; attempt++) {
      let pick = 0;
      let acc = this.rng() * QUALITY_ORDER.reduce((sum, q) => sum + QUALITIES[q].weight, 0);
      for (let i = 0; i < QUALITY_ORDER.length; i++) {
        acc -= QUALITIES[QUALITY_ORDER[i]].weight;
        if (acc <= 0) { pick = i; break; }
      }
      best = Math.max(best, pick);
    }
    return makePart({
      speciesId: species.id, speciesName: species.name, partType,
      quality: QUALITY_ORDER[Math.min(best, QUALITY_ORDER.length - 1)], tier: species.tier,
    });
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
        this.dropLoot(ev.pos, this.#cacheParts(6, 2), {});
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
      const boss = makeEnemyEntity(def.boss, { pos: { x: poi.x, y: poi.y }, ownerPoi: poi.id, rng: this.rng });
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
      const pile = this.dropLoot(ev.pos, this.#cacheParts(5, 1), {});
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
      encountered: JSON.parse(JSON.stringify(this.encountered)),
      timedOut: this.time >= MATCH_SECONDS,
    };
  }
}

/** Where an item sits on the five-step ladder, whichever ladder it uses. */
function rarityRank(item) {
  const q = QUALITY_ORDER.indexOf(item.quality);
  if (q >= 0) return q;
  return ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(item.rarity ?? 'common');
}
