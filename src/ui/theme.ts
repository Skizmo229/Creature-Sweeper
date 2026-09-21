/**
 * Per-type look, and the placeholder creature art.
 *
 * Temp assets by design: a tier-N creature is N pips on a 3x3 grid, die-style.
 * No art to draw, procedural at any size, covers exactly the 1..9 range the
 * game needs, and stays countable while the tuning is still moving.
 *
 * The split: pip SHAPE carries type identity (each ladder has its own), pip
 * COLOUR carries tier identity and is global, so a tier-4 creature looks the
 * same everywhere. Shape is decoration; colour is information.
 */

export type PipShape = 'circle' | 'square' | 'diamond' | 'hex' | 'cross' | 'ring' | 'ringDiamond';

export interface TypeTheme {
  /** Covered tile. */
  tile: string;
  /** Covered tile's shaded edge, for the bevel. */
  tileEdge: string;
  /** Uncovered ground. */
  floor: string;
  /** Number ink on open ground. */
  ink: string;
  /** This type's danger accent — used for the number on a creature's cell. */
  hot: string;
  pip: PipShape;
  /** UI accent for this type. */
  accent: string;
}

export const THEMES: Record<string, TypeTheme> = {
  easy: { tile: '#b3ab1e', tileEdge: '#857f10', floor: '#24220c', ink: '#f4efc4', hot: '#e8b23a', pip: 'circle', accent: '#e0d84a' },
  normal: { tile: '#8a5a12', tileEdge: '#63400a', floor: '#1f1608', ink: '#f0dcb8', hot: '#e0742c', pip: 'square', accent: '#d99a34' },
  extreme: { tile: '#3b28d6', tileEdge: '#261a94', floor: '#0e0a2e', ink: '#d4cdf7', hot: '#ff5da8', pip: 'diamond', accent: '#7b6bff' },
  huge: { tile: '#1d7a2e', tileEdge: '#12561f', floor: '#08210d', ink: '#c9ecd0', hot: '#e8d24a', pip: 'hex', accent: '#4fc46a' },
  huge_extreme: { tile: '#6b2fd6', tileEdge: '#4a1f96', floor: '#1a0a2e', ink: '#e0ccf7', hot: '#ff4d6d', pip: 'cross', accent: '#a96bff' },
  arcane: { tile: '#1f7d76', tileEdge: '#145650', floor: '#06211f', ink: '#bfe9e4', hot: '#4fe0cf', pip: 'hex', accent: '#2aa39a' },
  // `hot` is rose rather than the light violet it shipped with, for the same
  // reason PAIRS moved: at #c08bff it sat 75 RGB units from `ink`, so a
  // creature's number and an ordinary number read as one pale lavender. The
  // warm fix PAIRS took is NOT available here — this ladder carries Reveal,
  // which writes GIVEN_COLOR, and an amber `hot` lands 58 units off that gold.
  // Rose clears the gold by 124, clears Census's cyan, and keeps the violet
  // family the palette is built on. 181 from `ink`, and 5.8:1 on the floor —
  // the same contrast NORMAL and HUGE x EXTREME have always shipped.
  oracle: { tile: '#5b3fa8', tileEdge: '#3d2a74', floor: '#140b26', ink: '#dcd0f5', hot: '#fa4f7a', pip: 'diamond', accent: '#7e5bd6' },
  checker: { tile: '#4f5d75', tileEdge: '#37425a', floor: '#12161f', ink: '#e2e8f4', hot: '#ffd166', pip: 'square', accent: '#7f8fa8' },
  // `hot` is amber rather than the pale orange it shipped with, and on this
  // ladder that is legibility rather than taste. A defeated creature's number
  // is its PARTNER'S TIER and is shown by default here, so it is the one
  // number on the board that most needs to be told apart from an ordinary
  // floor number at a glance — and #ffb07a sat 85 units from `ink` in RGB,
  // which reads as the same pale colour. Amber is 139 away and also contrasts
  // BETTER against the floor (11.3:1 against 10.1), so nothing was traded.
  pairs: { tile: '#b5482a', tileEdge: '#82301b', floor: '#25100a', ink: '#f7d6c6', hot: '#ffc23d', pip: 'ringDiamond', accent: '#d96a45' },
  // Bone tiles on an ebony floor, round pips, crimson for a creature's number
  // — a domino set. Every value here was measured rather than picked, because
  // the obvious ivory tile is a trap: at #c9bd9b the green mark on a covered
  // cell is 1.1:1, worse than EASY's 1.4:1, which is the tile the mark's dark
  // outline was added to rescue. This bone brings it to 2.1:1, in the pack
  // beside BLIND, and keeps covered and cleared cells 5:1 apart. `hot` sits
  // 183 from `ink` and 5.8:1 on the floor, and 83 clear of the nearest colour
  // that can share this board — the tier-4 orange of the hover-level digit.
  // Round pips because a creature's glyph is already a die face, and half a
  // domino is exactly that.
  dominoes: { tile: '#8f8466', tileEdge: '#6b6249', floor: '#15130f', ink: '#efe6d0', hot: '#ff4d6d', pip: 'circle', accent: '#c9bd9b' },
  // Wolf grey with amber eyes: a pack. Measured the same way as the rest — `hot`
  // 178 from `ink` and 10.4:1 on the floor, and a mark on a covered tile 3.3:1,
  // in NORMAL's range. No spells here, so an amber `hot` has no gold annotation
  // to collide with.
  packs: { tile: '#58687c', tileEdge: '#3c4859', floor: '#0f141b', ink: '#dbe4ee', hot: '#ffb347', pip: 'diamond', accent: '#8a9bb0' },
  hive: { tile: '#a8324f', tileEdge: '#78203a', floor: '#260a13', ink: '#f2c9d3', hot: '#ff7a9c', pip: 'hex', accent: '#d4536f' },
  wraparound: { tile: '#1d6a9e', tileEdge: '#134a70', floor: '#061622', ink: '#c6e4f5', hot: '#4fb8f0', pip: 'circle', accent: '#3b93c4' },
  donut: { tile: '#b06a1d', tileEdge: '#7d4711', floor: '#251505', ink: '#f7dcb6', hot: '#ffab4f', pip: 'ring', accent: '#d68a33' },
  cross: { tile: '#4a8f3a', tileEdge: '#316526', floor: '#0c2108', ink: '#d2eec7', hot: '#8ce06a', pip: 'square', accent: '#6bb054' },
  wrapped_cross: { tile: '#2f8f7e', tileEdge: '#1f6356', floor: '#08211c', ink: '#c9eee4', hot: '#4fe0b8', pip: 'cross', accent: '#4fb39c' },
  diamond: { tile: '#8f3fa0', tileEdge: '#652a73', floor: '#210a26', ink: '#f0cdf7', hot: '#e072ff', pip: 'diamond', accent: '#b45cc4' },
  cave: { tile: '#8a7050', tileEdge: '#5f4c36', floor: '#1a1410', ink: '#ecdfcd', hot: '#ffb04f', pip: 'circle', accent: '#ad9270' },
  dungeon: { tile: '#6a5088', tileEdge: '#493761', floor: '#161020', ink: '#e2d6f0', hot: '#ffb86b', pip: 'cross', accent: '#9b7ad1' },
  // Magenta, not the light violet it shipped with (74 units from `ink`, which
  // reads as the same colour). Gold is doubly unavailable on this ladder:
  // every given is drawn in GIVEN_COLOR, so an amber `hot` would be 21 units
  // from the one annotation this board is covered in. Magenta is 160 clear of
  // it and 126 from `ink`, at 6.7:1 on the floor.
  sudoku: { tile: '#7d4a8f', tileEdge: '#573165', floor: '#1c0f21', ink: '#ead2f2', hot: '#ff5dc8', pip: 'square', accent: '#b45cc9' },
  // A saturated azure rather than the pale blue it shipped with. This is the
  // hardest `ink` in the set to sit beside — a neutral near-white — so the
  // only thing that separates from it is SATURATION, not hue: #9fd8ff was 78
  // units away and #3fb8f0 is 176. Kept bright (7.7:1) rather than taken
  // darker for a few more units of separation, because this ladder's boards
  // are among the largest in the game and so are drawn at the smallest cells.
  //
  // Worth knowing why this matters at all on a ladder that never defeats a
  // creature: a palette is a PLAYER setting, so BLIND's is worn on boards
  // that do.
  blind: { tile: '#8a8a8a', tileEdge: '#616161', floor: '#1a1a1a', ink: '#e8e8e8', hot: '#3fb8f0', pip: 'ring', accent: '#bdbdbd' },
  huge_blind: { tile: '#7a8288', tileEdge: '#545a5f', floor: '#14181a', ink: '#dde3e6', hot: '#7fb4d8', pip: 'ringDiamond', accent: '#a8b4bb' },
};

export function themeFor(typeId: string): TypeTheme {
  return THEMES[typeId] ?? THEMES.normal!;
}

/** Every palette the player can pick from, in the order the ladders read. */
export const PALETTE_IDS: readonly string[] = Object.keys(THEMES);

/** Every creature-icon shape, in the order the picker shows them. */
export const PIP_SHAPES: readonly PipShape[] = [
  'circle', 'square', 'diamond', 'hex', 'cross', 'ring', 'ringDiamond',
];

export const PIP_NAMES: Record<PipShape, string> = {
  circle: 'Dots',
  square: 'Blocks',
  diamond: 'Gems',
  hex: 'Cells',
  cross: 'Crosses',
  ring: 'Rings',
  ringDiamond: 'Hollow gems',
};

/**
 * Font stacks the player can choose between.
 *
 * All system stacks with no download, because the board is drawn on a canvas
 * at arbitrary sizes and a font that arrives late would render the first frame
 * in a fallback and reflow every number. `mono` is what the game has always
 * used and stays the baseline every type defaults to unless it says otherwise.
 */
export type FontId = 'mono' | 'sans' | 'rounded' | 'serif' | 'slab';

export const FONTS: Record<FontId, { name: string; stack: string }> = {
  mono: {
    name: 'Terminal',
    stack: 'ui-monospace, "JetBrains Mono", "Cascadia Mono", Consolas, monospace',
  },
  sans: {
    name: 'Clean',
    stack: 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  rounded: {
    name: 'Soft',
    stack: '"Trebuchet MS", Verdana, Geneva, "DejaVu Sans", sans-serif',
  },
  serif: {
    name: 'Storybook',
    stack: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
  },
  slab: {
    name: 'Heavy',
    stack: '"Rockwell", "Courier New", "Bookman Old Style", serif',
  },
};

/** Sound packs. See `sfx.ts` — each is a set of synthesis recipes, not files. */
export type SfxPackId = 'chime' | 'blip' | 'thud' | 'glass';

export const SFX_NAMES: Record<SfxPackId, string> = {
  chime: 'Chimes — soft bells',
  blip: 'Blips — arcade square waves',
  thud: 'Thuds — low and dry',
  glass: 'Glass — bright and brittle',
};

/**
 * Board-clear celebrations. See `victory.ts`.
 *
 * Two families. The first four are ambient — decoration drawn over the board,
 * knowing nothing about what is underneath. The rest animate the board's own
 * creature glyphs, which is why they need the renderer to hand those glyphs
 * over for the length of the animation.
 */
export type VictoryId =
  | 'confetti' | 'burst' | 'ripple' | 'sparkle'
  | 'tumble' | 'cascade' | 'pop' | 'burn' | 'wipe' | 'wipeDown' | 'wipeRadial';

export const VICTORY_NAMES: Record<VictoryId, string> = {
  confetti: 'Confetti — falling chips',
  burst: 'Burst — rays from the centre',
  ripple: 'Ripple — expanding rings',
  sparkle: 'Sparkle — drifting motes',
  tumble: 'Tumble — creatures drop and bounce',
  cascade: 'Cascade — they bounce off, leaving trails',
  pop: 'Pop — they swell and burst',
  burn: 'Burn — they char away from the bottom up',
  wipe: 'Wipe across — a band carries them off',
  wipeDown: 'Wipe down — a band falls through them',
  wipeRadial: 'Wipe out — a ring from the centre',
};

/**
 * What "game type default" means for the settings a theme did not already
 * carry.
 *
 * Kept beside `THEMES` rather than inside it because these are presentation
 * defaults the player is expected to override, where `TypeTheme` is what the
 * renderer needs to draw a board at all. Anything missing here falls back to
 * `FALLBACK_IDENTITY`, so a new ladder renders and sounds correct on the day
 * it is added and only gets a voice of its own when someone chooses one.
 */
export interface TypeIdentity {
  font: FontId;
  sfx: SfxPackId;
  victory: VictoryId;
}

const FALLBACK_IDENTITY: TypeIdentity = { font: 'mono', sfx: 'blip', victory: 'confetti' };

export const TYPE_IDENTITY: Record<string, TypeIdentity> = {
  easy: { font: 'rounded', sfx: 'chime', victory: 'confetti' },
  // The original's own clear, on the ladder that is the original.
  normal: { font: 'mono', sfx: 'blip', victory: 'tumble' },
  extreme: { font: 'mono', sfx: 'blip', victory: 'burst' },
  huge: { font: 'sans', sfx: 'thud', victory: 'tumble' },
  huge_extreme: { font: 'slab', sfx: 'thud', victory: 'cascade' },
  arcane: { font: 'serif', sfx: 'glass', victory: 'sparkle' },
  oracle: { font: 'serif', sfx: 'glass', victory: 'pop' },
  checker: { font: 'sans', sfx: 'chime', victory: 'wipe' },
  // Creatures leave in twos, so the effect that takes them one burst at a time
  // is the one that reads as the mode.
  pairs: { font: 'rounded', sfx: 'chime', victory: 'pop' },
  // Thud is the clack of a tile set down. Cascade is the one clear effect in
  // the game that is already a row of things falling over in sequence.
  dominoes: { font: 'sans', sfx: 'thud', victory: 'cascade' },
  // A pack leaves together, so the effect that sends every creature falling at
  // once is the one that reads as the mode.
  packs: { font: 'slab', sfx: 'thud', victory: 'tumble' },
  hive: { font: 'rounded', sfx: 'blip', victory: 'pop' },
  wraparound: { font: 'sans', sfx: 'chime', victory: 'wipeRadial' },
  donut: { font: 'rounded', sfx: 'chime', victory: 'ripple' },
  cross: { font: 'sans', sfx: 'blip', victory: 'wipe' },
  wrapped_cross: { font: 'sans', sfx: 'chime', victory: 'wipe' },
  diamond: { font: 'serif', sfx: 'glass', victory: 'sparkle' },
  cave: { font: 'slab', sfx: 'thud', victory: 'burn' },
  dungeon: { font: 'slab', sfx: 'thud', victory: 'burn' },
  sudoku: { font: 'sans', sfx: 'glass', victory: 'wipeDown' },
  blind: { font: 'mono', sfx: 'thud', victory: 'wipeRadial' },
  huge_blind: { font: 'mono', sfx: 'thud', victory: 'cascade' },
};

export function identityFor(typeId: string): TypeIdentity {
  return TYPE_IDENTITY[typeId] ?? FALLBACK_IDENTITY;
}

/** Marks are green, as in the original. Drawn with a dark outline so they
 *  survive light tiles like EASY's olive, where green alone disappeared. */
export const MARK_COLOR = '#35e06a';
export const MARK_OUTLINE = 'rgba(8, 8, 4, 0.8)';

/** Census results: a corner badge, deliberately unlike the centred number. */
export const CENSUS_COLOR = '#7ad9ff';

/**
 * The line where the board meets the background.
 *
 * The board's silhouette and nothing else — not a grid. Cells keep their own
 * edges (a covered tile its bevel, cleared floor none), because what this is
 * for is telling you where the board IS: which is a question worth answering
 * on a rectangle and the whole picture on a shaped one, where the outline is
 * the rooms, the arms or the cave.
 *
 * Full white, because there is only one of these lines on screen rather than a
 * few thousand, so it can afford to be the brightest thing on the board.
 */
export const BOARD_OUTLINE = '#ffffff';

/**
 * The cursor over ground the crawl rule will not let you touch.
 *
 * Red, and the only red in the annotation palette, because it is the one
 * highlight that means "this click will do nothing" rather than telling you
 * something about the cell. It has to read at a glance against every ladder's
 * tile colour, which is why it is a saturated red rather than a dimmed green:
 * dimming was the first attempt and on DUNGEON's violet it just looked like
 * the highlight had gone slightly out of focus.
 */
export const OUT_OF_REACH_COLOR = '#ff5a5a';

/**
 * A Sudoku given: gold, against the green of a mark the player made.
 *
 * They are different kinds of claim and the board should not make you
 * remember which is which. Gold also reads as fixed — it is the one
 * annotation on the board you are not allowed to change.
 *
 * Reveal writes one of these too, on every ladder that carries magic. Same
 * argument exactly: a tier you bought for 25 mana is the board talking, not a
 * hypothesis you wrote down, and it should neither look like one nor be
 * rubbed out like one.
 */
export const GIVEN_COLOR = '#f2c34e';

/**
 * The tie between the two halves of a defeated pair.
 *
 * Drawn for the same reason the Sudoku box rules are: the rule a board rests
 * on has to be visible or it is not a rule the player can use, and "these two
 * creatures belong to each other" is invisible on a finished grid — both cells
 * are just open creatures, exactly like any other.
 *
 * Translucent white rather than an annotation colour, and the choice is
 * deliberate. Green, gold and cyan all mean something the PLAYER or a spell
 * put there; this is a fact about the board's own structure, in the same
 * family as the silhouette, so it borrows the silhouette's white and steps
 * back from it. Every ladder's floor is dark, so one value reads on all of
 * them.
 */
export const BOND_COLOR = 'rgba(255, 255, 255, 0.5)';

/**
 * The 3x3 box rules.
 *
 * Near-black with a little transparency rather than a flat colour, so one
 * value sits correctly over both the washed boxes and the unwashed ones, and
 * over cleared floor as well as covered tile.
 */
export const BOX_RULE = 'rgba(8, 4, 12, 0.92)';

/** Pencil marks: the same green as a mark, dimmed. A note is a weaker form of
 *  the same claim, so it should read as the same ink lightly applied rather
 *  than as a different kind of annotation. */
export const NOTE_COLOR = 'rgba(53, 224, 106, 0.72)';

/**
 * Creature tier colours — five hues, reused for tiers 6-9 with a gold halo.
 *
 * Deliberately NOT a warm threat ramp: yellow/orange/red cluster so tightly
 * that adjacent tiers were indistinguishable (yellow against lime measured
 * ΔE 2.5 under protanopia), which is what made the glyphs hard to read. Since
 * the pip *count* already encodes magnitude, colour's job here is identity, so
 * the hues are spread instead of ramped.
 *
 * Validated against a near-black floor: the only soft spot is yellow against
 * green under protanopia (ΔE 6.4), and the pip count disambiguates that pair
 * completely on its own.
 */
export const TIER_COLORS = ['#54c8ff', '#5fd97a', '#ffd447', '#ff8f3a', '#ff5fc4'] as const;

/** Tiers past the fifth repeat the five hues wearing this. */
export const TIER_GOLD = '#ffcc33';

export function tierColor(tier: number): string {
  return TIER_COLORS[(Math.max(1, tier) - 1) % TIER_COLORS.length]!;
}

/** True for tiers 6+, which wear their hue with a gold halo. */
export function tierGilded(tier: number): boolean {
  return tier > TIER_COLORS.length;
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const to = (x: number) => Math.round(x).toString(16).padStart(2, '0');
  return `#${to(ar + (br - ar) * t)}${to(ag + (bg - ag) * t)}${to(ab + (bb - ab) * t)}`;
}

/** Which of the nine grid positions are lit, per die face. */
const DIE_FACES: Record<number, readonly number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
  7: [0, 2, 3, 4, 5, 6, 8],
  8: [0, 1, 2, 3, 5, 6, 7, 8],
  9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
};

function pipPath(ctx: CanvasRenderingContext2D, shape: PipShape, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  switch (shape) {
    case 'square':
      ctx.rect(cx - r, cy - r, r * 2, r * 2);
      break;
    case 'diamond':
    case 'ringDiamond':
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      break;
    case 'hex':
      ctx.moveTo(cx - r, cy - r * 0.6);
      ctx.lineTo(cx, cy - r);
      ctx.lineTo(cx + r, cy - r * 0.6);
      ctx.lineTo(cx + r, cy + r * 0.6);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy + r * 0.6);
      ctx.closePath();
      break;
    case 'cross': {
      const a = r * 0.42;
      ctx.moveTo(cx - a, cy - r);
      ctx.lineTo(cx + a, cy - r);
      ctx.lineTo(cx + a, cy - a);
      ctx.lineTo(cx + r, cy - a);
      ctx.lineTo(cx + r, cy + a);
      ctx.lineTo(cx + a, cy + a);
      ctx.lineTo(cx + a, cy + r);
      ctx.lineTo(cx - a, cy + r);
      ctx.lineTo(cx - a, cy + a);
      ctx.lineTo(cx - r, cy + a);
      ctx.lineTo(cx - r, cy - a);
      ctx.lineTo(cx - a, cy - a);
      ctx.closePath();
      break;
    }
    case 'ring':
    case 'circle':
    default:
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      break;
  }
}

/**
 * Draw a creature glyph filling a `size`-pixel cell at (x, y).
 * The 3x3 pip grid sits on a 16-unit cell, scaled to size.
 */
export function drawCreature(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  tier: number,
  theme: TypeTheme,
): void {
  const face = DIE_FACES[Math.min(9, Math.max(1, tier))] ?? DIE_FACES[1]!;
  const color = tierColor(tier);
  const gilded = tierGilded(tier);
  const unit = size / 16;
  // Gilded pips shrink so their halo fits in the 4.5-unit gap between pips.
  // At full size the halos merged into a blob and the count stopped reading.
  const r = Math.max(1, unit * (gilded ? 1.45 : 1.9));
  const halo = Math.max(1.5, unit * 1.15);
  const hollow = theme.pip === 'ring' || theme.pip === 'ringDiamond';

  ctx.save();
  ctx.lineJoin = 'round';
  for (const i of face) {
    const cx = x + unit * (3.5 + (i % 3) * 4.5);
    const cy = y + unit * (3.5 + Math.floor(i / 3) * 4.5);

    // Tiers 6-9 reuse the first five hues wearing a gold halo, so the palette
    // covers nine tiers without nine barely-distinguishable colours.
    if (gilded) {
      ctx.strokeStyle = TIER_GOLD;
      ctx.lineWidth = halo;
      pipPath(ctx, theme.pip, cx, cy, hollow ? r - unit * 0.55 : r);
      ctx.stroke();
    }

    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, unit * 1.1);
    pipPath(ctx, theme.pip, cx, cy, hollow ? r - ctx.lineWidth / 2 : r);
    if (hollow) ctx.stroke();
    else ctx.fill();
  }
  ctx.restore();
}
