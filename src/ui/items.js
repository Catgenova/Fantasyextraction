// Shared rendering for items: the row widget and its hover tooltip. Both the
// loadout screen and the results screen use these so a Rare looks like a Rare
// everywhere in the game.

import { el, tooltip, titleCase } from './dom.js';
import { RARITIES, SLOT_NAMES, itemScore, BASES_BY_ID } from '../data/gear.js';
import { CONSUMABLES } from '../data/consumables.js';

const PCT_STATS = new Set([
  'critChance', 'critDamage', 'attackSpeedPct', 'moveSpeedPct', 'damagePct',
  'damageTakenPct', 'healPower', 'lifesteal', 'cooldownPct', 'dodge',
  'blockChance', 'shieldPct', 'dotPct', 'aoeRadiusPct', 'atonement', 'vulnerability',
]);

const STAT_NAMES = {
  might: 'Might', agility: 'Agility', spirit: 'Spirit', vitality: 'Vitality',
  armor: 'Armour', resist: 'Resist', maxHpFlat: 'Max health', manaRegen: 'Mana regen',
  weaponDamage: 'Weapon damage', armorPen: 'Armour penetration', rangeBonus: 'Attack range',
  attackInterval: 'Swing time', critChance: 'Crit chance', critDamage: 'Crit damage',
  attackSpeedPct: 'Attack speed', moveSpeedPct: 'Move speed', damagePct: 'Damage',
  damageTakenPct: 'Damage taken', healPower: 'Healing', lifesteal: 'Lifesteal',
  cooldownPct: 'Cooldown reduction', dodge: 'Dodge', blockChance: 'Block chance',
  shieldPct: 'Shield strength', dotPct: 'Damage over time', aoeRadiusPct: 'Area radius',
};

export function statLabel(stat) {
  return STAT_NAMES[stat] ?? titleCase(stat);
}

export function formatStat(stat, value) {
  if (PCT_STATS.has(stat)) return `${value > 0 ? '+' : ''}${(value * 100).toFixed(1).replace(/\.0$/, '')}%`;
  if (stat === 'attackInterval') return `${value > 0 ? '+' : ''}${value.toFixed(2)}s`;
  if (stat === 'manaRegen') return `${value > 0 ? '+' : ''}${value.toFixed(1)}/s`;
  return `${value > 0 ? '+' : ''}${Math.round(value)}`;
}

export const rarityColor = (item) =>
  item?.kind === 'consumable'
    ? (RARITIES[item.rarity]?.color ?? 'var(--common)')
    : (RARITIES[item?.rarity]?.color ?? 'var(--common)');

/** Short "+4 Might, +12 Armour" summary used on collapsed item rows. */
export function modSummary(item, limit = 3) {
  if (item.kind === 'consumable') {
    const def = CONSUMABLES[item.defId];
    return def ? def.desc : '';
  }
  return Object.entries(item.mods ?? {})
    .slice(0, limit)
    .map(([stat, value]) => `${formatStat(stat, value)} ${statLabel(stat).toLowerCase()}`)
    .join(', ');
}

/** The full hover card. */
export function itemTooltip(item, opts = {}) {
  if (!item) return null;
  const nodes = [];

  if (item.kind === 'consumable') {
    const def = CONSUMABLES[item.defId];
    nodes.push(el('div.t-name', { style: { color: rarityColor(item) } }, `${def?.name ?? item.name} ×${item.count}`));
    nodes.push(el('div.t-sub', null, `${titleCase(item.rarity)} consumable`));
    if (def) {
      nodes.push(el('div.t-mod', null, def.desc));
      if (def.cooldown) nodes.push(el('div.small.muted', null, `Cooldown ${def.cooldown}s`));
      nodes.push(el('div.t-desc', null, autoUseHint(def)));
    }
    return nodes;
  }

  const base = BASES_BY_ID[item.baseId];
  nodes.push(el('div.t-name', { style: { color: rarityColor(item) } }, item.name));
  nodes.push(el('div.t-sub', null,
    `${titleCase(item.rarity)} ${SLOT_NAMES[item.slot] ?? item.slot} · item level ${item.ilvl}` +
    (base?.classes ? ` · ${base.classes.map(titleCase).join('/')} only` : '')));

  for (const [stat, value] of Object.entries(item.mods ?? {})) {
    // Swing time is the one stat where a bigger number is worse.
    const bad = value < 0 || stat === 'attackInterval';
    nodes.push(el('div.t-mod' + (bad ? '.neg' : ''), null, `${formatStat(stat, value)} ${statLabel(stat)}`));
  }

  if (opts.compareTo && opts.compareTo.id !== item.id) {
    const delta = itemScore(item) - itemScore(opts.compareTo);
    nodes.push(el('div.small', { style: { marginTop: '6px', color: delta >= 0 ? 'var(--good)' : 'var(--danger)' } },
      `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} vs equipped (${opts.compareTo.name})`));
  }
  return nodes;
}

function autoUseHint(def) {
  const h = def.hint ?? {};
  if (h.onDeath) return 'Used automatically the moment the hero would die.';
  if (h.selfHpBelow != null) return `Drunk automatically below ${Math.round(h.selfHpBelow * 100)}% health (or your potion threshold).`;
  if (h.selfManaBelow != null) return `Drunk automatically below ${Math.round(h.selfManaBelow * 100)}% mana.`;
  if (h.combatStart) return 'Used automatically when a fight begins.';
  if (h.extracting) return 'Used automatically once the squad commits to an extract.';
  return 'Used automatically when it helps.';
}

/**
 * One item row.
 * @param {{slotLabel?, onclick?, compareTo?, right?}} opts
 */
export function itemRow(item, opts = {}) {
  if (!item) {
    return el('div.item.empty', null, [
      el('div.grow', null, [
        opts.slotLabel ? el('div.slot-label', null, opts.slotLabel) : null,
        el('div', null, opts.emptyText ?? 'Empty'),
      ]),
    ]);
  }

  const node = el('div.item', {
    style: { '--rar': rarityColor(item) },
    onclick: opts.onclick,
  }, [
    el('div.grow', null, [
      opts.slotLabel ? el('div.slot-label', null, opts.slotLabel) : null,
      el('div.nm', null, item.kind === 'consumable' ? `${item.name} ×${item.count}` : item.name),
      el('div.mods', null, modSummary(item)),
    ]),
    opts.right ?? null,
  ]);

  return tooltip(node, () => itemTooltip(item, { compareTo: opts.compareTo }));
}
