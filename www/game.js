// Forest Run - core endless runner prototype (real art pass)
(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
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
    deco: ['assets/bg/bush002.png', 'assets/bg/bush003.png', 'assets/bg/bush004.png', 'assets/bg/bush005.png',
           'assets/bg/mushroom001.png', 'assets/bg/mushroom002.png', 'assets/bg/mushroom003.png',
           'assets/bg/mushroom004.png', 'assets/bg/mushroom005.png', 'assets/bg/mushroom007.png',
           'assets/bg/mushroom008.png', 'assets/bg/mushroom009.png',
           'assets/bg/pumpkin1.png', 'assets/bg/pumpkin2.png', 'assets/bg/pumpkin3.png',
           'assets/bg/pumpkin4.png', 'assets/bg/pumpkin5.png'],
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
  const OBST_DEFS = {
    rock1: { img: 'rock1', w: 70, h: 62, gap: true, duck: false },
    rock2: { img: 'rock2', w: 78, h: 66, gap: true, duck: false },
    rock3: { img: 'rock3', w: 86, h: 74, gap: true, duck: false },
    tomato: { img: 'tomato', w: 58, h: 58, gap: true, duck: false },
    hole: { img: 'hole', w: 110, h: 20, gap: true, isHole: true, duck: false },
    plant: { img: 'plant_blink', w: 84, h: 84, gap: true, isPlant: true, duck: false },
    hang_rock: { img: 'hang_rock', w: 84, h: 96, gap: true, isOverhead: true, duck: true, clearBottom: 392 },
  };
  const JUMP_TYPES = Object.keys(OBST_DEFS).filter(k => !OBST_DEFS[k].duck);
  const DUCK_TYPES = Object.keys(OBST_DEFS).filter(k => OBST_DEFS[k].duck);

  let sinceDuckObstacle = 0; // spawns since the last duck-required obstacle - forces variety

  function resetRun() {
    scroll = 0; speed = 300; elapsed = 0; coins = 0; hearts = 3; tarotThisRun = 0; invuln = 0; score = 0;
    obstacles = []; coinsField = []; effects = []; spawnTimer = 1.2; coinSpawnTimer = 1.8; tarotCooldown = 8 + Math.random() * 6;
    player.y = GROUND_Y; player.vy = 0; player.airborne = false; player.ducking = false;
    player.anim = 0; player.animTimer = 0; player.deadAnim = 0; player.hitFlash = 0;
    decos = [];
    sinceDuckObstacle = 0;
    for (let i = 0; i < 6; i++) decos.push({ x: i * 300 + Math.random() * 150, img: images.deco[Math.floor(Math.random() * images.deco.length)] });
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
  const HUD = {
    coin: { cx: 68, cy: 50, size: 54 },
    coinTextX: 98,
    card: { cx: 462, cy: 50, size: 46 },
    heart: { cx: 528, cy: 50, size: 46 },
    scoreRightX: 878,
    pause: { cx: 910, cy: 50, size: 48 },
  };

  // ---------- title screen (flower select + spit animation) ----------
  // Blue flower (Elfi) and red flower (Lyra) frame canvases are pre-scaled/pre-positioned
  // to align with the flower buds already painted into title_bg.jpg (measured from the source art).
  // Positions match the reference screenshot: both flowers cluster left-of-center,
  // blue lower, red just above and to the right of it.
  const FLOWER = {
    c1: { frames: 'title_blue', ox: 112.6, oy: 192.3, w: 349.5, h: 299.4, tapX: 207, tapY: 388, fly: 'c1_fly' },
    c2: { frames: 'title_red', ox: 296.9, oy: 151, w: 362.2, h: 310.6, tapX: 403, tapY: 346, fly: 'c2_fly' },
  };
  const TAP_RADIUS = 65;
  const SPIT_FRAME_TIME = 1 / 24; // 24fps swing
  // The flower stem swings down (loading) through frame ~18, then snaps/releases at
  // frame 19 (the blurred whip-crack frame) - that's the true launch moment for both
  // characters, verified frame-by-frame against the source animation.
  const SPIT_PEAK_FRAME = 19;
  const SPIT_TOTAL_FRAMES = 30;

  // The launched character flies continuously from the flower all the way to the
  // runner's starting spot (no separate "fly to the logo" leg) so there's no cut in
  // its motion; the background crossfades into the gameplay scene during the tail
  // end of that same flight instead of hard-switching.
  const FLIGHT_DURATION = 0.9; // seconds, starts the moment the flower releases
  const BG_FADE_START = 0.5;   // fraction of the flight where the gameplay bg starts fading in

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
    const o = { type, x: W + 60, w: def.w, h: def.h, def, hit: false };
    if (def.isPlant) { o.animName = 'blink_'; o.animIdx = 0; o.animTimer = 0; o.state = 'idle'; o.actionTimer = 0; }
    obstacles.push(o);
  }

  function spawnCoins() {
    const pattern = Math.random() < 0.5 ? 'ground' : 'arc';
    const n = 3 + Math.floor(Math.random() * 3);
    const baseX = W + 80;
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
    decos = decos.filter(d => d.x > -400);
    while (decos.length < 6) {
      const last = decos.length ? Math.max(...decos.map(d => d.x)) : W;
      decos.push({ x: last + 250 + Math.random() * 200, img: images.deco[Math.floor(Math.random() * images.deco.length)] });
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
          const box = { x: o.x - o.w / 2, y: GROUND_Y - o.h, w: o.w, h: o.h };
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
          const forgive = 10;
          const box = { x: o.x - o.w / 2, y: GROUND_Y - o.h + forgive, w: o.w, h: o.h - forgive };
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
      if (spitFrame >= SPIT_PEAK_FRAME && !flightActive) {
        flightActive = true; // the flower just released - character starts flying now
      }
      if (spitFrame >= SPIT_TOTAL_FRAMES) {
        spitFrame = SPIT_TOTAL_FRAMES;
        state = 'landing'; // flower swing is done, but the character keeps flying -
                            // no cut, it flies straight into the runner scene
      }
    }
  }

  // Drives the character's single continuous flight from the flower to the runner's
  // starting spot, spanning both the 'spit' and 'landing' states without a reset.
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

  // The flower spits the character out toward screen-right first (a proper forward
  // launch, matching the direction they'll be running), then the arc bends back to
  // the runner's fixed starting spot so it lands straight into the track - a single
  // rightward-bulging curve shared by the 'spit' and 'landing' states so the motion
  // never resets or reverses direction on us.
  function flightPosition() {
    const f = FLOWER[spitChar];
    const t = Math.min(1, flightTimer / FLIGHT_DURATION);
    const startX = f.tapX, startY = f.tapY - 40;
    const endX = PLAYER_X, endY = GROUND_Y - 50;
    const bulgeX = Math.max(startX, endX) + 210;
    const bulgeY = Math.min(startY, endY) - 60;
    const omt = 1 - t;
    const x = omt * omt * startX + 2 * omt * t * bulgeX + t * t * endX;
    const y = omt * omt * startY + 2 * omt * t * bulgeY + t * t * endY;
    return { x, y, t, startX, endX };
  }

  // Both fly-portraits (and the run-cycle they hand off to) face right by default -
  // always draw them unmirrored so the character never looks like it's flying
  // backward, no matter which way the arc briefly bends.
  function drawFlightCharacter(p) {
    const f = FLOWER[spitChar];
    const img = images[f.fly][0];
    if (!img || !img.complete || !img.naturalWidth) return;
    const targetW = 90 + p.t * 45;
    const targetH = targetW * (img.naturalHeight / img.naturalWidth);
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.t * 4 + 0.15);
    ctx.translate(p.x, p.y);
    ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);
    ctx.restore();
  }

  // Gameplay parallax layers, factored out so the landing crossfade can paint them
  // at a rising alpha over the title background instead of cutting to them.
  function renderEnvironment(alpha = 1) {
    if (images.sky[0].complete) { ctx.globalAlpha = alpha; ctx.drawImage(images.sky[0], 0, 0, W, H); ctx.globalAlpha = 1; }
    drawTiled(images.backback[0], H - GROUND_H - 300, 300, scroll * 0.25, alpha);
    decos.forEach(d => {
      if (d.img && d.img.complete && d.img.naturalWidth) {
        const dh = 130, dw = d.img.naturalWidth * (dh / d.img.naturalHeight);
        ctx.globalAlpha = alpha;
        ctx.drawImage(d.img, d.x, GROUND_Y - dh + 20, dw, dh);
        ctx.globalAlpha = 1;
      }
    });
    drawTiled(images.frontback[0], H - GROUND_H - 160, 170, scroll * 0.55, alpha);
    drawTiled(images.ground[0], GROUND_Y, GROUND_H, scroll, alpha);
  }

  function renderTitle() {
    const bg = images.title_bg[0];
    if (bg && bg.complete) ctx.drawImage(bg, 0, 0, W, H);

    // idle flowers (both closed, resting pose = frame 0) unless one is mid-spit -
    // drawn BEFORE the rock ledge so the rock sits in front of the blue flower's
    // stem base, giving the "flower emerges from behind the rock" look.
    drawFlowerFrame('c1', spitChar === 'c1' ? spitFrame : 0);
    drawFlowerFrame('c2', spitChar === 'c2' ? spitFrame : 0);

    // decorative rock ledge, bottom-left corner - drawn on top of the flower stem
    const stones = images.title_stones[0];
    if (stones && stones.complete) {
      const sw = 360, sh = sw * (stones.naturalHeight / stones.naturalWidth);
      ctx.drawImage(stones, -20, 370, sw, sh);
    }

    // logo banner, top-center
    drawCentered(images.title_logo[0], W / 2, 186, 460);

    // MENU / STATS wooden signs, mounted on the post - the post is planted into the
    // ground beyond the visible frame, so it's drawn bleeding off the bottom edge.
    const plank = images.title_plank[0];
    let plankTop = H - 170;
    if (plank && plank.complete) {
      const pw = 36, ph = pw * (plank.naturalHeight / plank.naturalWidth);
      plankTop = H - ph + 50;
      ctx.drawImage(plank, 786, plankTop, pw, ph);
    }
    const signCx = 804, signW = 168;
    drawCentered(images.title_stats[0], signCx, plankTop + 62, signW);
    drawCentered(images.title_menu[0], signCx, plankTop + 122, signW);

    if (state === 'menu') {
      drawCentered(images.title_tap[0], W / 2, H - 26, 340);
    }

    // character launching out of the flower at the whip-crack peak of the swing
    // (drawn last so it's always fully visible, even flying in front of the logo)
    if (spitChar && flightActive) {
      drawFlightCharacter(flightPosition());
    }
  }

  // Flower swing just finished but the character is still mid-flight: keep the title
  // background, fade the gameplay scene in underneath it, and keep flying the same
  // continuous arc all the way down to the runner's spot - no hard scene cut.
  function renderLanding() {
    const p = flightPosition();
    const bg = images.title_bg[0];
    if (bg && bg.complete) ctx.drawImage(bg, 0, 0, W, H);
    const bgFadeT = Math.max(0, Math.min(1, (p.t - BG_FADE_START) / (1 - BG_FADE_START)));
    renderEnvironment(bgFadeT);
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
          // a vine anchors it to the (unseen) canopy above so it doesn't look like
          // it's floating in mid-air, then the rock hangs point-down off the end
          const vineTop = 0, vineBottom = o.def.clearBottom - h + h * 0.18;
          ctx.strokeStyle = '#4c7a2e';
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.moveTo(o.x, vineTop);
          ctx.lineTo(o.x, vineBottom);
          ctx.stroke();
          ctx.save();
          ctx.translate(o.x, o.def.clearBottom - h);
          ctx.scale(1, -1);
          ctx.drawImage(img, -w / 2, 0, w, h);
          ctx.restore();
        } else {
          const drawY = o.def.isHole ? GROUND_Y - 6 : GROUND_Y - h;
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

  // ---------- fullscreen "cover" scaling ----------
  // Fills the whole screen (no letterboxing) by scaling to whichever dimension needs
  // it more, cropping the canvas's top/bottom (or sides) evenly via #gameWrap's
  // overflow:hidden - accepted tradeoff for filling the frame edge-to-edge.
  function resizeCanvas() {
    const scale = Math.max(window.innerWidth / W, window.innerHeight / H);
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
  window.__forceSpawn = (type) => {
    const def = OBST_DEFS[type];
    const o = { type, x: W + 60, w: def.w, h: def.h, def, hit: false };
    if (def.isPlant) { o.animName = 'blink_'; o.animIdx = 0; o.animTimer = 0; o.state = 'idle'; o.actionTimer = 0; }
    obstacles.push(o);
  };
})();
