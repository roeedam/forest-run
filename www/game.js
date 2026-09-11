// Forest Run - core endless runner prototype (real art pass)
(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  // The canvas's internal width now matches the device's actual aspect ratio (clamped
  // to a sane range) instead of a fixed 960x540, so filling the screen no longer means
  // cropping the top/bottom off a narrower-than-device canvas - the canvas IS the
  // screen shape, and resizeCanvas() below just scales it 1:1 into the viewport.
  const H = 540;
  const BASE_ASPECT = 960 / 540;   // 16:9-ish floor - never render narrower than this
  const MAX_ASPECT = 2.4;          // covers the widest real phone screens (~21:9)
  const viewportAspect = window.innerWidth / window.innerHeight;
  const aspect = Math.max(BASE_ASPECT, Math.min(MAX_ASPECT, viewportAspect || BASE_ASPECT));
  const W = Math.round(H * aspect);
  canvas.width = W;
  canvas.height = H;
  const GROUND_H = 90;
  const GROUND_Y = H - GROUND_H; // the line the character's feet stand on

  // ---------- asset loading ----------
  const images = {};
  function seq(prefix, count, pad = 2) {
    const arr = [];
    for (let i = 1; i <= count; i++) arr.push(`${prefix}${String(i).padStart(pad, '0')}.png`);
    return arr;
  }

  const ASSET_PATHS = {
    // characters
    c1_run: seq('assets/c1/run_', 11),
    c1_duck: seq('assets/c1/duck_', 6),
    c1_jump: ['assets/c1/jump_01.png'],
    c1_dead: seq('assets/c1/dead/dead_', 16),
    c2_run: seq('assets/c2/run_', 11),
    c2_duck: seq('assets/c2/duck_', 4),
    c2_jump: ['assets/c2/jump_01.png'],
    c2_dead: seq('assets/c2/dead/dead_', 13),
    // coin
    coin_spin: seq('assets/coin/spin/spin_', 12),
    coin_effect: seq('assets/coin/effect/effect_', 17),
    // hud
    hud_coin: ['assets/hud/coin.png'],
    hud_heart: ['assets/hud/heart.png'],
    hud_card: ['assets/hud/card.png'],
    hud_pause: ['assets/hud/pause.png'],
    // tarot
    tarot: ['assets/tarot/tarot.png'],
    // bg
    sky: ['assets/bg/sky.png'],
    backback: ['assets/bg/backback.png'],
    frontback: ['assets/bg/frontback.png'],
    ground: ['assets/bg/ground.png'],
    // Split into two pools per the LAYOUT reference art: most decorations are small
    // ground-level accents, but every so often a giant showpiece mushroom/pumpkin
    // (taller than the character by several multiples) anchors the scene, the way the
    // reference screenshots do it - see deco_big usage in resetRun()/update().
    deco_small: ['assets/bg/bush002.png', 'assets/bg/bush003.png', 'assets/bg/bush004.png', 'assets/bg/bush005.png',
           'assets/bg/mushroom001.png', 'assets/bg/mushroom002.png', 'assets/bg/mushroom003.png',
           'assets/bg/mushroom004.png', 'assets/bg/mushroom005.png', 'assets/bg/mushroom009.png',
           'assets/bg/pumpkin3.png', 'assets/bg/pumpkin5.png'],
    deco_big: ['assets/bg/mushroom007.png', 'assets/bg/mushroom008.png',
           'assets/bg/pumpkin1.png', 'assets/bg/pumpkin2.png', 'assets/bg/pumpkin4.png'],
    // obstacles
    rock1: ['assets/obstacles/rocks/rock_01.png'],
    rock2: ['assets/obstacles/rocks/rock_02.png'],
    rock3: ['assets/obstacles/rocks/rock_03.png'],
    tomato: ['assets/obstacles/tomato.png'],
    hole: ['assets/obstacles/hole.png'],
    hang_rock: ['assets/obstacles/rocks/rock_02.png'],
    plant_blink: seq('assets/obstacles/plant/blink/blink_', 8),
    plant_eat: seq('assets/obstacles/plant/eat/eat_', 41),
    plant_step: seq('assets/obstacles/plant/step/step_', 10),
    // title screen
    title_bg: ['assets/title/title_bg.jpg'],
    title_blue: seq('assets/title/blue/f', 30),
    title_red: seq('assets/title/red/f', 30),
    c1_fly: ['assets/title/c1_fly.png'],
    c2_fly: ['assets/title/c2_fly.png'],
    title_logo: ['assets/title/logo.png'],
    title_tap: ['assets/title/tap_a_flower.png'],
    title_menu: ['assets/title/menu_sign.png'],
    title_stats: ['assets/title/stats_sign.png'],
    title_plank: ['assets/title/plank.png'],
    title_stones: ['assets/title/stones.png'],
  };

  let totalCount = 0, loadedCount = 0;
  for (const k in ASSET_PATHS) totalCount += ASSET_PATHS[k].length;

  function loadAll(done) {
    for (const key in ASSET_PATHS) {
      images[key] = ASSET_PATHS[key].map(src => {
        const img = new Image();
        img.onload = img.onerror = () => { loadedCount++; if (loadedCount >= totalCount) done(); };
        img.src = src;
        return img;
      });
    }
  }

  // ---------- input ----------
  const keys = { jump: false, duck: false };
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp') { keys.jump = true; e.preventDefault(); }
    if (e.code === 'ArrowDown') { keys.duck = true; e.preventDefault(); }
    if (e.code === 'KeyP') togglePause();
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp') keys.jump = false;
    if (e.code === 'ArrowDown') keys.duck = false;
  });
  // Swipe controls during gameplay: swipe up = jump, swipe down = duck (briefly).
  // Anywhere on the touch area works - no more left/right split zones.
  const touchZonesEl = document.getElementById('touchZones');
  const SWIPE_THRESHOLD = 26; // px
  let swipeActive = false, swipeStartX = 0, swipeStartY = 0;
  let touchDuckTimer = 0; // seconds remaining to force a duck pose from a swipe-down

  touchZonesEl.addEventListener('pointerdown', e => {
    e.preventDefault();
    swipeActive = true;
    swipeStartX = e.clientX;
    swipeStartY = e.clientY;
  });
  touchZonesEl.addEventListener('pointerup', e => {
    if (!swipeActive) return;
    swipeActive = false;
    const dx = e.clientX - swipeStartX, dy = e.clientY - swipeStartY;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > SWIPE_THRESHOLD) {
      if (dy < 0) {
        // swipe up -> jump
        if (!player.airborne) { player.airborne = true; player.vy = JUMP_V; }
      } else {
        // swipe down -> duck for a short moment
        touchDuckTimer = 0.45;
      }
    } else if (state === 'playing') {
      // not a swipe - a plain tap. If it landed on the HUD pause icon, pause.
      const p = canvasPointFromEvent(e);
      const ddx = p.x - HUD.pause.cx, ddy = p.y - HUD.pause.cy;
      if (ddx * ddx + ddy * ddy <= 34 * 34) togglePause();
    }
  });
  touchZonesEl.addEventListener('pointercancel', () => { swipeActive = false; });

  // ---------- game state ----------
  const GRAVITY = 2400;
  const JUMP_V = -900;
  const PLAYER_X = 170;

  let state = 'menu'; // menu | playing | paused | dead | gameover
  let chosenChar = 'c1';
  let scroll = 0;
  let speed = 300;
  let elapsed = 0;
  let coins = 0;
  let score = 0;
  let hearts = 3;
  let tarotThisRun = 0;
  let invuln = 0;

  const player = {
    y: GROUND_Y,
    vy: 0,
    airborne: false,
    ducking: false,
    anim: 0,
    animTimer: 0,
    deadAnim: 0,
    deadTimer: 0,
    hitFlash: 0,
  };

  let obstacles = []; // {type, x, w, h, kind, extra}
  let coinsField = []; // {x, y, frame, timer, kind:'coin'|'tarot', collected}
  let effects = []; // {x, y, frame, timer}
  let decos = []; // scrolling background decorations
  let spawnTimer = 0;
  let coinSpawnTimer = 0;
  let tarotCooldown = 8; // seconds before first possible tarot

  // Ground obstacles: must be jumped over (or, for the hole, jumped across).
  // hang_rock is a low-hanging obstacle mounted near the top of the screen -
  // jumping into it hits it, only ducking clears it, so the run actually needs both inputs.
  // groundOffsetFrac compensates for transparent padding baked into the bottom of
  // each source PNG (measured directly from the art) so the visible rock/plant
  // silhouette actually touches the ground instead of floating above it.
  // scaleRange lets each spawn vary in size for visual variety; tomato's range is
  // kept tight since it must stay jump-able.
  const OBST_DEFS = {
    rock1: { img: 'rock1', w: 70, h: 62, gap: true, duck: false, groundOffsetFrac: 0.113, scaleRange: [0.85, 1.25] },
    rock2: { img: 'rock2', w: 78, h: 66, gap: true, duck: false, groundOffsetFrac: 0.084, scaleRange: [0.85, 1.25] },
    rock3: { img: 'rock3', w: 86, h: 74, gap: true, duck: false, groundOffsetFrac: 0.035, scaleRange: [0.85, 1.2] },
    tomato: { img: 'tomato', w: 58, h: 58, gap: true, duck: false, groundOffsetFrac: 0.132, scaleRange: [0.9, 1.12] },
    hole: { img: 'hole', w: 110, h: 20, gap: true, isHole: true, duck: false },
    plant: { img: 'plant_blink', w: 84, h: 84, gap: true, isPlant: true, duck: false, groundOffsetFrac: 0.057 },
    hang_rock: { img: 'hang_rock', w: 84, h: 96, gap: true, isOverhead: true, duck: true, clearBottom: 392, scaleRange: [0.8, 1.3] },
  };
  const JUMP_TYPES = Object.keys(OBST_DEFS).filter(k => !OBST_DEFS[k].duck);
  const DUCK_TYPES = Object.keys(OBST_DEFS).filter(k => OBST_DEFS[k].duck);

  let sinceDuckObstacle = 0; // spawns since the last duck-required obstacle - forces variety

  // Most decorations are small ground-level accents (bushes/mushrooms scattered for
  // texture); every so often a giant showpiece mushroom or pumpkin appears, dwarfing
  // the character, matching the scale seen in the LAYOUT reference art. avoidBig keeps
  // two giants from landing back-to-back and crowding each other.
  function pickDeco(x, avoidBig) {
    const big = !avoidBig && Math.random() < 0.18;
    const pool = big ? images.deco_big : images.deco_small;
    const img = pool[Math.floor(Math.random() * pool.length)];
    const dh = big ? (260 + Math.random() * 160) : (85 + Math.random() * 60);
    return { x, img, dh, big };
  }

  function resetRun() {
    scroll = 0; speed = 300; elapsed = 0; coins = 0; hearts = 3; tarotThisRun = 0; invuln = 0; score = 0;
    obstacles = []; coinsField = []; effects = []; spawnTimer = 1.2; coinSpawnTimer = 1.8; tarotCooldown = 8 + Math.random() * 6;
    player.y = GROUND_Y; player.vy = 0; player.airborne = false; player.ducking = false;
    player.anim = 0; player.animTimer = 0; player.deadAnim = 0; player.hitFlash = 0;
    decos = [];
    sinceDuckObstacle = 0;
    let lastBig = false;
    for (let i = 0; i < 6; i++) {
      const d = pickDeco(i * 320 + Math.random() * 180, lastBig);
      decos.push(d);
      lastBig = d.big;
    }
  }

  // ---------- UI wiring ----------
  const loadingScreen = document.getElementById('loadingScreen');
  const loadingText = document.getElementById('loadingText');
  const pauseScreen = document.getElementById('pauseScreen');
  const gameOverScreen = document.getElementById('gameOverScreen');
  const touchZones = document.getElementById('touchZones');
  const hint = document.getElementById('hint');
  const finalScoreEl = document.getElementById('finalScore');
  const tarotNoteEl = document.getElementById('tarotNote');

  document.getElementById('retryBtn').addEventListener('click', () => goToMenu());
  document.getElementById('resumeBtn').addEventListener('click', () => togglePause());

  // ---------- HUD (drawn on the canvas itself, sharing its coordinate space, so it
  // scales pixel-perfectly with the canvas's CSS size instead of drifting as a
  // separately-positioned DOM overlay) ----------
  // Sizes/positions/spacing measured from the reference HUD screenshot.
  // Right-anchored elements are expressed relative to W so they stay flush with the
  // right edge of the screen at any device aspect ratio, instead of drifting inward
  // (now-narrower gap) or off the edge (now-wider gap) like the old fixed 878/910 did.
  const HUD = {
    coin: { cx: 68, cy: 50, size: 54 },
    coinTextX: 98,
    card: { cx: 462, cy: 50, size: 46 },
    heart: { cx: 528, cy: 50, size: 46 },
    scoreRightX: W - 82,
    pause: { cx: W - 50, cy: 50, size: 48 },
  };

  // ---------- title screen (flower select + spit animation) ----------
  // Blue flower (Elfi) and red flower (Lyra) frame canvases are pre-scaled/pre-positioned,
  // left-anchored so they stay put near the rock ledge regardless of canvas width.
  // Per Roee's reference: both flowers cluster tight against the left edge, tucked
  // behind the rock ledge - blue lower and further left, red just above/right of it,
  // its stem base also overlapping the rock.
  const FLOWER = {
    c1: { frames: 'title_blue', ox: 25, oy: 210, w: 349.5, h: 299.4, tapX: 119, tapY: 406, fly: 'c1_fly' },
    c2: { frames: 'title_red', ox: 140, oy: 190, w: 362.2, h: 310.6, tapX: 246, tapY: 385, fly: 'c2_fly' },
  };
  const TAP_RADIUS = 65;
  const SPIT_FRAME_TIME = 1 / 24; // 24fps swing
  const SPIT_TOTAL_FRAMES = 30;

  // Once the flower's swing animation finishes, the character flies in from just off
  // the right edge of the screen all the way to the runner's starting spot, while the
  // whole title scene pans out to the left in lockstep and the gameplay scene wipes in
  // from the right to replace it - so the player experiences a real right-to-left flight
  // across the full screen, landing exactly as the new scene finishes filling it.
  const FLIGHT_DURATION = 0.85; // seconds, the full pan+flight duration

  let spitChar = null;   // 'c1' | 'c2' while playing the spit-out animation
  let spitFrame = 0;
  let spitTimer = 0;
  let flightActive = false;
  let flightTimer = 0;

  function goToMenu() {
    state = 'menu';
    spitChar = null; spitFrame = 0; spitTimer = 0;
    flightActive = false; flightTimer = 0;
    gameOverScreen.hidden = true;
    pauseScreen.hidden = true;
    touchZones.hidden = true;
    hint.hidden = true;
  }

  function canvasPointFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = W / rect.width, sy = H / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  canvas.addEventListener('pointerdown', e => {
    if (state !== 'menu') return;
    const p = canvasPointFromEvent(e);
    for (const key of ['c1', 'c2']) {
      const f = FLOWER[key];
      const dx = p.x - f.tapX, dy = p.y - f.tapY;
      if (dx * dx + dy * dy <= TAP_RADIUS * TAP_RADIUS) {
        chosenChar = key;
        spitChar = key;
        spitFrame = 0;
        spitTimer = 0;
        flightActive = false;
        flightTimer = 0;
        state = 'spit';
        return;
      }
    }
  });

  function startGame() {
    resetRun();
    state = 'playing';
    gameOverScreen.hidden = true;
    pauseScreen.hidden = true;
    touchZones.hidden = false;
    hint.hidden = false;
  }

  function togglePause() {
    if (state === 'playing') { state = 'paused'; pauseScreen.hidden = false; }
    else if (state === 'paused') { state = 'playing'; pauseScreen.hidden = true; }
  }

  function endRun() {
    state = 'gameover';
    touchZones.hidden = true;
    hint.hidden = true;
    finalScoreEl.textContent = `Coins collected: ${coins}`;
    tarotNoteEl.hidden = tarotThisRun === 0;
    gameOverScreen.hidden = false;
  }

  // ---------- update ----------
  function updatePlayer(dt) {
    if (touchDuckTimer > 0) touchDuckTimer -= dt;
    const wantDuck = (keys.duck || touchDuckTimer > 0) && !player.airborne;
    player.ducking = wantDuck;

    if (keys.jump && !player.airborne) {
      player.airborne = true;
      player.vy = JUMP_V;
    }

    if (player.airborne) {
      player.vy += GRAVITY * dt;
      player.y += player.vy * dt;
      if (player.y >= GROUND_Y) {
        player.y = GROUND_Y;
        player.vy = 0;
        player.airborne = false;
      }
    } else {
      player.y = GROUND_Y;
    }

    // animation
    const set = player.ducking ? images[chosenChar + '_duck'] : (player.airborne ? images[chosenChar + '_jump'] : images[chosenChar + '_run']);
    const frameTime = player.ducking ? 0.09 : 0.07;
    player.animTimer += dt;
    if (player.animTimer >= frameTime) {
      player.animTimer = 0;
      player.anim = (player.anim + 1) % set.length;
    }
    if (player.anim >= set.length) player.anim = 0;

    if (invuln > 0) invuln -= dt;
  }

  function playerBox() {
    // approximate hitbox, a bit smaller than sprite for fairness
    const w = player.ducking ? 60 : 46;
    const h = player.ducking ? 46 : 92;
    const x = PLAYER_X - w / 2;
    const y = player.y - h;
    return { x, y, w, h };
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function spawnObstacle() {
    // Force a healthy mix of jump- and duck-reactions instead of pure random picks,
    // so a run never turns into "just hold jump" - every few obstacles a hang_rock
    // shows up that can only be passed by ducking.
    sinceDuckObstacle++;
    let type;
    if (sinceDuckObstacle >= 3 && Math.random() < 0.55) {
      type = DUCK_TYPES[Math.floor(Math.random() * DUCK_TYPES.length)];
      sinceDuckObstacle = 0;
    } else {
      type = JUMP_TYPES[Math.floor(Math.random() * JUMP_TYPES.length)];
    }
    const def = OBST_DEFS[type];
    const scale = def.scaleRange ? (def.scaleRange[0] + Math.random() * (def.scaleRange[1] - def.scaleRange[0])) : 1;
    const w = def.w * scale, h = def.h * scale;
    // Coins and obstacles scroll at the identical world speed, so their relative x
    // spacing at spawn time never changes - keeping this clear of any coin trail
    // already in flight is enough to guarantee it stays clear forever.
    let x = W + 60;
    const margin = 26;
    for (let attempt = 0; attempt < 6; attempt++) {
      const left = x - w / 2 - margin, right = x + w / 2 + margin;
      const blocked = coinsField.some(c => c.kind === 'coin' && c.x >= left && c.x <= right);
      if (!blocked) break;
      x += 70;
    }
    const o = { type, x, w, h, def, hit: false };
    if (def.isPlant) { o.animName = 'blink_'; o.animIdx = 0; o.animTimer = 0; o.state = 'idle'; o.actionTimer = 0; }
    obstacles.push(o);
  }

  function spawnCoins() {
    const pattern = Math.random() < 0.5 ? 'ground' : 'arc';
    const n = 3 + Math.floor(Math.random() * 3);
    let baseX = W + 80;
    // Same reasoning as spawnObstacle: nudge the whole coin trail past any obstacle it
    // would otherwise land on/inside, so a coin never spawns somewhere it can't be
    // reached without hitting the thing it's sitting on.
    const margin = 30;
    for (let attempt = 0; attempt < 6; attempt++) {
      const trailEnd = baseX + (n - 1) * 46;
      const blocked = obstacles.some(o => {
        const left = o.x - o.w / 2 - margin, right = o.x + o.w / 2 + margin;
        return trailEnd >= left && baseX <= right;
      });
      if (!blocked) break;
      baseX += 90;
    }
    for (let i = 0; i < n; i++) {
      let y;
      if (pattern === 'ground') y = GROUND_Y - 40;
      else y = GROUND_Y - 40 - Math.sin((i / (n - 1 || 1)) * Math.PI) * 120;
      coinsField.push({ x: baseX + i * 46, y, frame: 0, timer: 0, kind: 'coin', collected: false });
    }
  }

  function spawnTarot() {
    coinsField.push({ x: W + 100, y: GROUND_Y - 110, frame: 0, timer: 0, kind: 'tarot', collected: false, bob: Math.random() * 10 });
  }

  function hitPlayer() {
    if (invuln > 0) return;
    hearts -= 1;
    invuln = 1.4;
    if (hearts <= 0) {
      player.deadAnim = 0; player.deadTimer = 0;
      state = 'dead';
    }
  }

  function update(dt) {
    if (state !== 'playing') return;
    elapsed += dt;
    speed = Math.min(560, 300 + elapsed * 6);
    scroll += speed * dt;

    updatePlayer(dt);
    const pBox = playerBox();

    // decorations scroll
    decos.forEach(d => { d.x -= speed * 0.5 * dt; });
    decos = decos.filter(d => d.x > -500);
    while (decos.length < 6) {
      const lastD = decos[decos.length - 1];
      const last = decos.length ? Math.max(...decos.map(d => d.x)) : W;
      const gap = 260 + Math.random() * 240 + (lastD && lastD.big ? 180 : 0);
      decos.push(pickDeco(last + gap, lastD ? lastD.big : false));
    }

    // obstacle spawn
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnObstacle();
      spawnTimer = Math.max(0.9, 1.9 - elapsed * 0.01) + Math.random() * 0.6;
    }

    coinSpawnTimer -= dt;
    if (coinSpawnTimer <= 0) {
      spawnCoins();
      coinSpawnTimer = 2.2 + Math.random() * 1.4;
    }

    tarotCooldown -= dt;
    if (tarotCooldown <= 0) {
      spawnTarot();
      tarotCooldown = 22 + Math.random() * 10;
    }

    // obstacles update
    for (const o of obstacles) {
      o.x -= speed * dt;
      if (o.def.isPlant) {
        o.animTimer += dt;
        if (o.state === 'idle') {
          if (o.animTimer > 0.12) { o.animTimer = 0; o.animIdx = (o.animIdx + 1) % images.plant_blink.length; }
        } else if (o.state === 'eat' || o.state === 'step') {
          if (o.animTimer > 0.045) {
            o.animTimer = 0; o.animIdx++;
            const arr = o.state === 'eat' ? images.plant_eat : images.plant_step;
            if (o.animIdx >= arr.length) { o.dead = true; }
          }
        }
      }

      if (!o.hit && !o.dead) {
        if (o.def.isOverhead) {
          // hangs from the top of the screen down to clearBottom - only ducking
          // (the player's short hitbox) passes underneath it.
          const box = { x: o.x - o.w / 2, y: 0, w: o.w, h: o.def.clearBottom };
          if (rectsOverlap(pBox, box)) { o.hit = true; hitPlayer(); }
        } else if (o.def.isHole) {
          // fall in hole only if not airborne while over it
          const holeBox = { x: o.x - o.w / 2, y: GROUND_Y - 4, w: o.w, h: 8 };
          if (!player.airborne && rectsOverlap(pBox, holeBox)) { o.hit = true; hitPlayer(); }
        } else if (o.def.isPlant) {
          const groundOffset = o.h * (o.def.groundOffsetFrac || 0);
          const box = { x: o.x - o.w / 2, y: GROUND_Y - o.h + groundOffset, w: o.w, h: o.h };
          if (rectsOverlap(pBox, box)) {
            const stomping = player.airborne && player.vy > 100 && (pBox.y + pBox.h) < (box.y + box.h * 0.55);
            if (stomping && o.state === 'idle') {
              o.state = 'step'; o.animIdx = 0; o.animTimer = 0;
              player.vy = JUMP_V * 0.55; player.airborne = true;
              coins += 1;
            } else if (o.state === 'idle') {
              o.hit = true;
              // the plant's big "eating" animation only plays on the hit that actually
              // ends the run - a non-fatal bite just costs a heart with no fanfare.
              const fatal = hearts <= 1;
              if (fatal) { o.state = 'eat'; o.animIdx = 0; o.animTimer = 0; }
              hitPlayer();
            }
          }
        } else {
          // small top-edge forgiveness on ground obstacles (rocks/tomato) so a jump
          // that lands on the obstacle's flat top, grazing it, isn't a fail.
          // groundOffset compensates for transparent padding baked into the art so the
          // hitbox lines up with the obstacle's actual visible silhouette on the ground.
          const forgive = 10;
          const groundOffset = o.h * (o.def.groundOffsetFrac || 0);
          const box = { x: o.x - o.w / 2, y: GROUND_Y - o.h + groundOffset + forgive, w: o.w, h: o.h - forgive };
          if (rectsOverlap(pBox, box)) { o.hit = true; hitPlayer(); }
        }
      }
    }
    obstacles = obstacles.filter(o => o.x > -150 && !o.dead);

    if (state === 'playing') score = coins * 10 + Math.floor(elapsed * 20);

    // coins/tarot update + collection
    for (const c of coinsField) {
      c.x -= speed * dt;
      c.timer += dt;
      if (c.kind === 'coin') {
        if (c.timer > 0.06) { c.timer = 0; c.frame = (c.frame + 1) % images.coin_spin.length; }
        if (!c.collected) {
          const box = { x: c.x - 18, y: c.y - 18, w: 36, h: 36 };
          if (rectsOverlap(pBox, box)) { c.collected = true; coins += 1; effects.push({ x: c.x, y: c.y, frame: 0, timer: 0 }); }
        }
      } else if (c.kind === 'tarot') {
        c.y += Math.sin(elapsed * 3 + c.bob) * 0.4;
        if (!c.collected) {
          const box = { x: c.x - 30, y: c.y - 30, w: 60, h: 60 };
          if (rectsOverlap(pBox, box)) { c.collected = true; tarotThisRun += 1; }
        }
      }
    }
    coinsField = coinsField.filter(c => c.x > -100 && !c.collected);

    for (const e of effects) { e.timer += dt; if (e.timer > 0.03) { e.timer = 0; e.frame++; } }
    effects = effects.filter(e => e.frame < images.coin_effect.length);

    if (state === 'dead') {
      // handled in render/deadUpdate
    }

    if (state === 'playing' && hearts <= 0) { /* safety */ }
  }

  function updateSpit(dt) {
    spitTimer += dt;
    if (spitTimer >= SPIT_FRAME_TIME) {
      spitTimer = 0;
      spitFrame++;
      if (spitFrame >= SPIT_TOTAL_FRAMES) {
        spitFrame = SPIT_TOTAL_FRAMES;
        // Flower swing is done - now the character flies in from the right edge of the
        // screen while the whole scene pans/wipes left underneath it into gameplay.
        state = 'landing';
        flightActive = true;
        flightTimer = 0;
      }
    }
  }

  // Drives the character's right-to-left flight across the full screen during 'landing',
  // in lockstep with the scene pan/wipe (see renderLanding).
  function updateFlight(dt) {
    if (!flightActive) return;
    flightTimer += dt;
    if (state === 'landing' && flightTimer >= FLIGHT_DURATION) {
      startGame();
    }
  }

  function updateDead(dt) {
    player.deadTimer += dt;
    const arr = images[chosenChar + '_dead'];
    if (player.deadTimer > 0.06) {
      player.deadTimer = 0;
      player.deadAnim++;
      if (player.deadAnim >= arr.length) { endRun(); }
    }
  }

  // ---------- render ----------
  function drawTiled(img, y, h, offset, alpha = 1) {
    if (!img || !img.complete || !img.naturalWidth) return;
    const scale = h / img.naturalHeight;
    const w = img.naturalWidth * scale;
    ctx.globalAlpha = alpha;
    let x = -((offset) % w);
    while (x < W) {
      ctx.drawImage(img, x, y, w, h);
      x += w;
    }
    ctx.globalAlpha = 1;
  }

  function drawFlowerFrame(key, frameIdx) {
    const f = FLOWER[key];
    const arr = images[f.frames];
    const img = arr[Math.min(frameIdx, arr.length - 1)];
    if (img && img.complete) ctx.drawImage(img, f.ox, f.oy, f.w, f.h);
  }

  function drawCentered(img, cx, cy, targetW) {
    if (!img || !img.complete || !img.naturalWidth) return;
    const targetH = targetW * (img.naturalHeight / img.naturalWidth);
    ctx.drawImage(img, cx - targetW / 2, cy - targetH / 2, targetW, targetH);
  }

  // The character flies straight across the screen from just off the right edge to the
  // runner's fixed starting spot on the left - a real right-to-left crossing, not a
  // local hop - eased so it comes in fast and settles into place as it lands.
  function flightPosition() {
    const rawT = Math.min(1, flightTimer / FLIGHT_DURATION);
    const t = rawT * (2 - rawT); // ease-out
    const startX = W + 60, startY = GROUND_Y - 90;
    const endX = PLAYER_X, endY = GROUND_Y - 50;
    const x = startX + (endX - startX) * t;
    const y = startY + (endY - startY) * t;
    return { x, y, t, rawT };
  }

  // Both fly-portraits (and the run-cycle they hand off to) face right by default -
  // but the character is now flying screen-right to screen-left, so it must be mirrored
  // to actually face the direction it's traveling.
  function drawFlightCharacter(p) {
    const f = FLOWER[spitChar];
    const img = images[f.fly][0];
    if (!img || !img.complete || !img.naturalWidth) return;
    const targetW = 85 + p.t * 55;
    const targetH = targetW * (img.naturalHeight / img.naturalWidth);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);
    ctx.restore();
  }

  // Gameplay parallax layers, factored out so the landing crossfade can paint them
  // at a rising alpha over the title background instead of cutting to them.
  function renderEnvironment(alpha = 1) {
    if (images.sky[0].complete) { ctx.globalAlpha = alpha; ctx.drawImage(images.sky[0], 0, 0, W, H); ctx.globalAlpha = 1; }
    drawTiled(images.backback[0], H - GROUND_H - 300, 300, scroll * 0.25, alpha);
    drawTiled(images.frontback[0], H - GROUND_H - 160, 170, scroll * 0.55, alpha);
    drawTiled(images.ground[0], GROUND_Y, GROUND_H, scroll, alpha);
    // Decorations are drawn AFTER the ground tile (not before) so a decoration whose
    // base sits flush with GROUND_Y - especially a big showpiece mushroom/pumpkin -
    // actually reads as planted on top of the ground instead of having its base
    // hidden behind the opaque dirt strip.
    decos.forEach(d => {
      if (d.img && d.img.complete && d.img.naturalWidth) {
        const dh = d.dh, dw = d.img.naturalWidth * (dh / d.img.naturalHeight);
        ctx.globalAlpha = alpha;
        ctx.drawImage(d.img, d.x, GROUND_Y - dh, dw, dh);
        ctx.globalAlpha = 1;
      }
    });
  }

  // The title background + flowers + logo + signpost, with nothing panned - shared by
  // the plain menu/spit screen and by the panned title layer during the landing wipe.
  function renderTitleScene() {
    const bg = images.title_bg[0];
    if (bg && bg.complete) ctx.drawImage(bg, 0, 0, W, H);

    // idle flowers (both closed, resting pose = frame 0) unless one is mid-spit -
    // drawn BEFORE the rock ledge so the rock sits in front of the flowers' stem
    // bases, giving the "flowers emerge from behind the rock" look.
    drawFlowerFrame('c1', spitChar === 'c1' ? spitFrame : 0);
    drawFlowerFrame('c2', spitChar === 'c2' ? spitFrame : 0);

    // decorative rock ledge, bottom-left corner - drawn on top of both flower stems
    // (widened so it spans under blue AND red, per Roee's "both behind the rock" note)
    const stones = images.title_stones[0];
    if (stones && stones.complete) {
      const sw = 420, sh = sw * (stones.naturalHeight / stones.naturalWidth);
      ctx.drawImage(stones, -20, 370, sw, sh);
    }

    // logo banner, top-center
    drawCentered(images.title_logo[0], W / 2, 186, 460);

    // MENU / STATS wooden signs, mounted on the post - the post is planted into the
    // ground beyond the visible frame, so it's drawn bleeding off the bottom edge.
    const plankX = W - 174;
    const plank = images.title_plank[0];
    let plankTop = H - 170;
    if (plank && plank.complete) {
      const pw = 36, ph = pw * (plank.naturalHeight / plank.naturalWidth);
      plankTop = H - ph + 50;
      ctx.drawImage(plank, plankX, plankTop, pw, ph);
    }
    const signCx = W - 156, signW = 168;
    drawCentered(images.title_stats[0], signCx, plankTop + 62, signW);
    drawCentered(images.title_menu[0], signCx, plankTop + 122, signW);
  }

  function renderTitle() {
    renderTitleScene();
    if (state === 'menu') {
      drawCentered(images.title_tap[0], W / 2, H - 26, 340);
    }
  }

  // Flower swing just finished: the character flies in from the right while the whole
  // title scene slides out to the left and the gameplay scene wipes in from the right
  // to replace it, both driven by the same t as the flight - so the pan finishes and
  // the runner scene fully fills the screen at the exact moment the character lands.
  function renderLanding() {
    const p = flightPosition();
    const panX = p.t * W;

    ctx.save();
    ctx.translate(-panX, 0);
    renderTitleScene();
    ctx.restore();

    ctx.save();
    ctx.translate(W - panX, 0);
    renderEnvironment(1);
    ctx.restore();

    drawFlightCharacter(p);
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    if (state === 'menu' || state === 'spit') { renderTitle(); return; }
    if (state === 'landing') { renderLanding(); return; }
    renderEnvironment(1);

    // obstacles
    for (const o of obstacles) {
      let img;
      if (o.def.isPlant) {
        const arr = o.state === 'idle' ? images.plant_blink : (o.state === 'eat' ? images.plant_eat : images.plant_step);
        img = arr[Math.min(o.animIdx, arr.length - 1)];
      } else {
        img = images[o.def.img][0];
      }
      if (img && img.complete) {
        const h = o.h, w = o.w;
        if (o.def.isOverhead) {
          // hangs point-down off the top of the screen, no visible vine/rope -
          // just the rock itself, flipped so it reads as jutting down from above.
          ctx.save();
          ctx.translate(o.x, o.def.clearBottom - h);
          ctx.scale(1, -1);
          ctx.drawImage(img, -w / 2, 0, w, h);
          ctx.restore();
        } else {
          // groundOffset compensates for transparent padding baked into the bottom of
          // the source art so the visible silhouette actually touches the ground.
          const groundOffset = h * (o.def.groundOffsetFrac || 0);
          const drawY = o.def.isHole ? GROUND_Y - 6 : GROUND_Y - h + groundOffset;
          ctx.drawImage(img, o.x - w / 2, drawY, w, h);
        }
      }
    }

    // coins & tarot
    for (const c of coinsField) {
      if (c.kind === 'coin') {
        const img = images.coin_spin[c.frame];
        if (img && img.complete) ctx.drawImage(img, c.x - 22, c.y - 22, 44, 44);
      } else {
        const img = images.tarot[0];
        if (img && img.complete) ctx.drawImage(img, c.x - 34, c.y - 34, 68, 68);
      }
    }
    for (const e of effects) {
      const img = images.coin_effect[Math.min(e.frame, images.coin_effect.length - 1)];
      if (img && img.complete) ctx.drawImage(img, e.x - 30, e.y - 30, 60, 60);
    }

    // player
    ctx.save();
    if (invuln > 0 && Math.floor(invuln * 12) % 2 === 0) ctx.globalAlpha = 0.4;
    let img;
    if (state === 'dead') {
      const arr = images[chosenChar + '_dead'];
      img = arr[Math.min(player.deadAnim, arr.length - 1)];
    } else {
      const set = player.ducking ? images[chosenChar + '_duck'] : (player.airborne ? images[chosenChar + '_jump'] : images[chosenChar + '_run']);
      img = set[player.anim] || set[0];
    }
    if (img && img.complete && img.naturalWidth) {
      const targetH = player.ducking ? 78 : 118;
      const scale = targetH / img.naturalHeight;
      const w = img.naturalWidth * scale;
      ctx.drawImage(img, PLAYER_X - w / 2, player.y - targetH, w, targetH);
    }
    ctx.restore();

    drawHUD();
  }

  function drawIconCount(imgKey, cx, cy, size, text) {
    const img = images[imgKey][0];
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
    }
    ctx.font = "30px 'LuckiestGuy'";
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.fillStyle = '#fff';
    const tx = cx + size / 2 + 8;
    ctx.strokeText(text, tx, cy + 2);
    ctx.fillText(text, tx, cy + 2);
  }

  // Sizes/positions/spacing match the reference HUD screenshot: coin+count top-left,
  // card/heart counters centered, score + pause button top-right.
  function drawHUD() {
    drawIconCount('hud_coin', HUD.coin.cx, HUD.coin.cy, HUD.coin.size, 'x ' + coins);
    drawIconCount('hud_card', HUD.card.cx, HUD.card.cy, HUD.card.size, String(tarotThisRun));
    drawIconCount('hud_heart', HUD.heart.cx, HUD.heart.cy, HUD.heart.size, String(hearts));

    ctx.font = "34px 'LuckiestGuy'";
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.fillStyle = '#ffe066';
    ctx.strokeText(String(score), HUD.scoreRightX, HUD.pause.cy + 2);
    ctx.fillText(String(score), HUD.scoreRightX, HUD.pause.cy + 2);
    ctx.textAlign = 'left';

    const pauseImg = images.hud_pause[0];
    if (pauseImg && pauseImg.complete && pauseImg.naturalWidth) {
      const s = HUD.pause.size;
      ctx.drawImage(pauseImg, HUD.pause.cx - s / 2, HUD.pause.cy - s / 2, s, s);
    }
  }

  // ---------- fullscreen scaling ----------
  // The canvas's internal width was already matched to the device aspect ratio at
  // startup (see W/aspect above), so filling the screen is now a plain uniform scale
  // by height - no cropping needed, the canvas shape already matches the viewport.
  function resizeCanvas() {
    const scale = window.innerHeight / H;
    canvas.style.width = Math.ceil(W * scale) + 'px';
    canvas.style.height = Math.ceil(H * scale) + 'px';
  }
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', resizeCanvas);
  resizeCanvas();

  // ---------- main loop ----------
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (state === 'playing') update(dt);
    if (state === 'dead') updateDead(dt);
    if (state === 'spit') updateSpit(dt);
    if (state === 'spit' || state === 'landing') updateFlight(dt);
    render();
    requestAnimationFrame(loop);
  }

  loadAll(() => {
    loadingScreen.hidden = true;
    state = 'menu';
    requestAnimationFrame(loop);
  });
  loadingText.textContent = 'Loading...';

  window.__debug = () => ({ state, hearts, coins, score, tarotThisRun, obstacles: obstacles.length, elapsed, spitFrame, flightActive, flightTimer });
  window.__forceSpawn = (type, atX) => {
    const def = OBST_DEFS[type];
    const scale = def.scaleRange ? (def.scaleRange[0] + Math.random() * (def.scaleRange[1] - def.scaleRange[0])) : 1;
    const o = { type, x: atX != null ? atX : W + 60, w: def.w * scale, h: def.h * scale, def, hit: false };
    if (def.isPlant) { o.animName = 'blink_'; o.animIdx = 0; o.animTimer = 0; o.state = 'idle'; o.actionTimer = 0; }
    obstacles.push(o);
  };
})();
