import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

const canvas = document.querySelector('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#182632');
scene.fog = new THREE.Fog('#182632', 55, 125);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .1, 180);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(0, 0);
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimPoint = new THREE.Vector3();
const arena = { size: 96, bound: 46 };
const tanks = [
  { name: 'SCOUT', role: 'FAST • SINGLE', color: '#b7eb67', speed: 11, hp: 100, fire: .31, damage: 18, spread: 0, shots: 1, barrels: 1, range: 48, desc: 'Quick and precise' },
  { name: 'TWIN', role: 'DUAL • RAPID', color: '#60d7d0', speed: 9.5, hp: 105, fire: .48, damage: 12, spread: .1, shots: 2, barrels: 2, range: 42, desc: 'Two barrels, twice the trouble' },
  { name: 'SNIPER', role: 'LONG • HEAVY', color: '#f0ae64', speed: 8, hp: 95, fire: .78, damage: 48, spread: 0, shots: 1, barrels: 1, range: 70, desc: 'One shot. Make it count' },
  { name: 'MACHINE', role: 'SPRAY • FAST', color: '#ef7777', speed: 8.7, hp: 100, fire: .12, damage: 7, spread: .18, shots: 1, barrels: 1, range: 37, desc: 'An endless stream of lead' },
  { name: 'HEAVY', role: 'TANK • BURST', color: '#b991ee', speed: 6.3, hp: 180, fire: .68, damage: 31, spread: .13, shots: 3, barrels: 1, range: 42, desc: 'Built to take a beating' },
  { name: 'FLANKER', role: 'AGILE • BURST', color: '#69a8ef', speed: 10, hp: 110, fire: .62, damage: 19, spread: .09, shots: 3, barrels: 3, range: 40, desc: 'Fast, with a triple bite' }
];
const mats = {};
const state = {
  running: false, paused: false, chosen: 0, player: null, level: 1, xp: 0, xpNext: 100,
  kills: 0, score: 0, hp: 100, maxHp: 100, speed: 1, damage: 1, fireRate: 1,
  projectiles: [], enemies: [], shapes: [], particles: [], keys: {}, lastShot: 0, spawnTimer: 0,
  time: 0, sound: true, pointerDown: false, joystick: { x: 0, z: 0 }, dashing: 0, dashCooldown: 0
};

function material(color, roughness = .82) {
  const key = `${color}-${roughness}`;
  if (!mats[key]) mats[key] = new THREE.MeshStandardMaterial({ color, roughness, metalness: .04 });
  return mats[key];
}
function addMesh(parent, geometry, color, x, y, z, sx = 1, sy = 1, sz = 1, cast = true) {
  const mesh = new THREE.Mesh(geometry, typeof color === 'string' ? material(color) : color);
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = cast; mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
function setupWorld() {
  scene.add(new THREE.HemisphereLight(0xc9e6ef, 0x26302b, 2.15));
  const sun = new THREE.DirectionalLight(0xffedcf, 3.2);
  sun.position.set(-25, 38, 21); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -55; sun.shadow.camera.right = 55; sun.shadow.camera.top = 55; sun.shadow.camera.bottom = -55;
  scene.add(sun);
  const floor = addMesh(scene, new THREE.PlaneGeometry(arena.size, arena.size), '#35483f', 0, -.34, 0, 1, 1, 1, false);
  floor.rotation.x = -Math.PI / 2;
  const grid = new THREE.GridHelper(arena.size, 48, '#586556', '#435347');
  grid.position.y = -.32; grid.material.transparent = true; grid.material.opacity = .26; scene.add(grid);
  const edgeMat = material('#77865b');
  for (let i = 0; i < 4; i++) {
    const wall = addMesh(scene, new THREE.BoxGeometry(arena.size + 3, 1.4, 1.5), edgeMat, 0, .3, 0, 1, 1, 1, false);
    if (i < 2) { wall.position.z = i === 0 ? -arena.bound : arena.bound; }
    else { wall.rotation.y = Math.PI / 2; wall.position.x = i === 2 ? -arena.bound : arena.bound; }
  }
  const grid2 = new THREE.GridHelper(180, 90, '#34434a', '#2b3940');
  grid2.position.set(0, -.37, 0); grid2.material.transparent = true; grid2.material.opacity = .07; scene.add(grid2);
  const groundDecor = new THREE.Group(); scene.add(groundDecor);
  for (let i = 0; i < 150; i++) {
    const x = THREE.MathUtils.randFloatSpread(arena.size), z = THREE.MathUtils.randFloatSpread(arena.size);
    if (Math.abs(x) > arena.bound || Math.abs(z) > arena.bound || Math.hypot(x, z) < 14) continue;
    const r = Math.random() * .22 + .06;
    const pebble = addMesh(groundDecor, new THREE.IcosahedronGeometry(r, 0), Math.random() > .5 ? '#556047' : '#697053', x, -.28, z, 1, .35, 1, false);
    pebble.rotation.y = Math.random() * 6;
  }
  for (let i = 0; i < 25; i++) spawnShape(true);
}

function createTank(data, player = false, size = 1) {
  const group = new THREE.Group();
  group.userData.radius = player ? .95 : .82;
  const hull = addMesh(group, new THREE.BoxGeometry(1.55, .48, 1.85), data.color, 0, .3, 0, size, size, size);
  hull.material = material(data.color, .55);
  const trim = addMesh(group, new THREE.BoxGeometry(1.62, .12, .5), '#252d30', 0, .16, 0, size, size, size);
  const treadL = addMesh(group, new THREE.BoxGeometry(.23, .42, 1.95), '#202a2d', -.82, .25, 0, size, size, size);
  const treadR = addMesh(group, new THREE.BoxGeometry(.23, .42, 1.95), '#202a2d', .82, .25, 0, size, size, size);
  for (const x of [-.84, .84]) for (let z = -.65; z <= .66; z += .43) {
    const wheel = addMesh(group, new THREE.CylinderGeometry(.13, .13, .08, 10), '#667071', x, .25, z, size, size, size);
    wheel.rotation.z = Math.PI / 2;
  }
  const turret = new THREE.Group(); turret.position.y = .63 * size;
  addMesh(turret, new THREE.CylinderGeometry(.43 * size, .49 * size, .25 * size, 12), '#283235', 0, 0, 0);
  addMesh(turret, new THREE.CylinderGeometry(.35 * size, .39 * size, .3 * size, 12), data.color, 0, .17 * size, 0);
  const barrelCount = data.barrels || 1;
  const barrels = [];
  for (let i = 0; i < barrelCount; i++) {
    const offset = barrelCount === 1 ? 0 : (i - (barrelCount - 1) / 2) * .38 * size;
    const len = data.name === 'SNIPER' ? 1.45 : data.name === 'HEAVY' ? .92 : .99;
    const barrel = addMesh(turret, new THREE.BoxGeometry(.22 * size, .21 * size, len * size), '#a3aba2', offset, .22 * size, -(.35 + len * .42) * size);
    addMesh(turret, new THREE.BoxGeometry(.27 * size, .26 * size, .12 * size), '#697578', offset, .22 * size, -(len + .35) * size);
    barrels.push(barrel);
  }
  const cap = addMesh(turret, new THREE.SphereGeometry(.22 * size, 12, 8), data.color, 0, .35 * size, 0);
  group.add(turret);
  if (data.name === 'HEAVY') {
    addMesh(group, new THREE.BoxGeometry(1.08, .18, .38), '#b9c1b4', 0, .57, .47, size, size, size);
    addMesh(group, new THREE.BoxGeometry(.34, .12, .75), '#b9c1b4', -.48, .56, -.35, size, size, size);
  }
  group.userData.turret = turret; group.userData.barrels = barrels; group.userData.color = data.color;
  return group;
}

function spawnShape(initial = false) {
  const kind = Math.random() < .61 ? 'square' : Math.random() < .64 ? 'triangle' : 'pentagon';
  const color = kind === 'square' ? '#e5c968' : kind === 'triangle' ? '#e78564' : '#bd8de5';
  const size = kind === 'square' ? 1.12 : kind === 'triangle' ? 1.15 : 1.26;
  const geo = kind === 'square' ? new THREE.BoxGeometry(size, size, size) : new THREE.CylinderGeometry(size * .62, size * .62, size * .78, kind === 'triangle' ? 3 : 5);
  const mesh = addMesh(scene, geo, color, THREE.MathUtils.randFloat(-arena.bound + 4, arena.bound - 4), size * .54, THREE.MathUtils.randFloat(-arena.bound + 4, arena.bound - 4));
  mesh.rotation.y = Math.random() * Math.PI; mesh.userData = { kind, hp: kind === 'square' ? 24 : kind === 'triangle' ? 38 : 65, maxHp: kind === 'square' ? 24 : kind === 'triangle' ? 38 : 65, radius: size * .72, spin: THREE.MathUtils.randFloat(-.7, .7), value: kind === 'square' ? 18 : kind === 'triangle' ? 30 : 48 };
  state.shapes.push(mesh);
}

function setupSelection() {
  const grid = document.querySelector('#tank-grid');
  tanks.forEach((tank, index) => {
    const card = document.createElement('button'); card.className = `tank-card${index === state.chosen ? ' selected' : ''}`;
    card.innerHTML = `<canvas width="116" height="84"></canvas><strong>${tank.name}</strong><small>${tank.role}</small>`;
    card.addEventListener('click', () => selectTank(index)); grid.appendChild(card);
    const c = card.querySelector('canvas'), ctx = c.getContext('2d');
    ctx.save(); ctx.translate(58, 42); ctx.rotate(-.27);
    ctx.fillStyle = '#202a2d'; ctx.fillRect(-28, -10, 56, 23);
    ctx.fillStyle = tank.color; ctx.fillRect(-22, -9, 44, 18);
    ctx.beginPath(); ctx.arc(0, -1, 9, 0, Math.PI * 2); ctx.fillStyle = tank.color; ctx.fill();
    ctx.fillStyle = '#a3aba2';
    const count = tank.barrels; for (let n = 0; n < count; n++) { const x = (n - (count - 1) / 2) * 10; ctx.fillRect(x - 2, -28, 4, 23); }
    ctx.restore();
  });
}
function selectTank(index) {
  state.chosen = index;
  document.querySelectorAll('.tank-card').forEach((el, i) => el.classList.toggle('selected', i === index));
  document.querySelector('.select-count').innerHTML = `${String(index + 1).padStart(2, '0')} <i>/</i> 06`;
}

function startGame() {
  cleanup();
  state.running = true; state.paused = false; state.level = 1; state.xp = 0; state.xpNext = 100;
  state.kills = 0; state.score = 0; state.speed = 1; state.damage = 1; state.fireRate = 1;
  const data = tanks[state.chosen]; state.hp = state.maxHp = data.hp;
  state.player = createTank(data, true); state.player.position.set(0, 0, 0); scene.add(state.player);
  const targetScreen = new THREE.Vector2(0, 0); raycaster.setFromCamera(targetScreen, camera); raycaster.ray.intersectPlane(groundPlane, aimPoint);
  for (let i = 0; i < 13; i++) spawnEnemy();
  document.querySelector('#welcome-screen').hidden = true;
  document.querySelector('#gameover-screen').hidden = true;
  document.querySelector('#upgrade-screen').hidden = true;
  document.querySelector('#hud').hidden = false; document.querySelector('#scoreboard').hidden = false;
  document.querySelector('#mobile-controls').hidden = false;
  const crosshair = document.querySelector('#crosshair');
  crosshair.style.display = innerWidth <= 600 ? 'block' : 'none'; crosshair.style.left = '50%'; crosshair.style.top = '50%';
  updateHud(); toast(`${data.name} TANK DEPLOYED`);
  updateCamera(1);
}
function cleanup() {
  for (const list of [state.projectiles, state.enemies, state.shapes, state.particles]) {
    for (const item of list) scene.remove(item.mesh || item);
    list.length = 0;
  }
  if (state.player) scene.remove(state.player);
  state.player = null; state.keys = {}; state.joystick.x = state.joystick.z = 0;
}
function spawnEnemy() {
  const types = [
    { name: 'DRIFTER', color: '#e98265', hp: 48, speed: 3.2, damage: 9, fire: 1.75, range: 19, value: 45, shape: 0 },
    { name: 'STALKER', color: '#b28be4', hp: 68, speed: 2.4, damage: 14, fire: 1.15, range: 23, value: 65, shape: 1 },
    { name: 'BULWARK', color: '#e0bd60', hp: 130, speed: 1.55, damage: 19, fire: 1.55, range: 17, value: 105, shape: 2 },
    { name: 'DASHER', color: '#64c4be', hp: 58, speed: 3.9, damage: 11, fire: 1.4, range: 15, value: 70, shape: 3 },
    { name: 'SENTINEL', color: '#e7799d', hp: 85, speed: 1.8, damage: 12, fire: .85, range: 26, value: 90, shape: 4 }
  ];
  const base = types[Math.floor(Math.random() * Math.min(types.length, 2 + Math.floor(state.level / 2)))];
  const data = { ...base, hp: base.hp * (1 + (state.level - 1) * .14), damage: base.damage * (1 + (state.level - 1) * .08) };
  const group = new THREE.Group(); const scale = data.name === 'BULWARK' ? 1.2 : .82;
  addMesh(group, new THREE.BoxGeometry(1.34, .43, 1.58), '#222d33', 0, .24, 0, scale, scale, scale);
  addMesh(group, new THREE.BoxGeometry(1.1, .34, 1.1), data.color, 0, .54, 0, scale, scale, scale);
  addMesh(group, new THREE.CylinderGeometry(.28, .32, .22, data.shape === 1 ? 3 : 8), '#343d3d', 0, .83 * scale, 0, scale, scale, scale);
  const barrel = addMesh(group, new THREE.BoxGeometry(.2 * scale, .18 * scale, .75 * scale), '#a4aaa2', 0, .88 * scale, -.46 * scale);
  group.userData = { radius: .72 * scale, color: data.color, barrel };
  let x, z; do { x = THREE.MathUtils.randFloat(-arena.bound + 4, arena.bound - 4); z = THREE.MathUtils.randFloat(-arena.bound + 4, arena.bound - 4); } while (Math.hypot(x, z) < 15);
  group.position.set(x, 0, z); scene.add(group);
  state.enemies.push({ mesh: group, ...data, maxHp: data.hp, cooldown: Math.random() * 1.5, wander: Math.random() * Math.PI * 2, hitFlash: 0 });
}
function spawnProjectile(origin, direction, options = {}) {
  const color = options.color || '#d7fa84';
  const mesh = addMesh(scene, new THREE.SphereGeometry(options.radius || .16, 8, 6), color, origin.x, origin.y, origin.z, 1, 1, 1, false);
  const glow = new THREE.PointLight(color, 1.5, 3); mesh.add(glow);
  state.projectiles.push({ mesh, velocity: direction.clone().multiplyScalar(options.speed || 25), damage: options.damage || 10, team: options.team || 'player', life: options.life || 2, radius: options.radius || .16 });
}
function firePlayer() {
  if (!state.running || state.paused || !state.player) return;
  const data = tanks[state.chosen], now = state.time;
  if (now - state.lastShot < data.fire / state.fireRate) return;
  state.lastShot = now;
  const target = new THREE.Vector3(aimPoint.x, 0, aimPoint.z);
  const originPos = state.player.position.clone();
  const baseDir = target.sub(originPos); baseDir.y = 0;
  if (baseDir.lengthSq() < .01) return;
  baseDir.normalize();
  const count = data.shots;
  for (let i = 0; i < count; i++) {
    const angle = (count === 1 ? 0 : (i - (count - 1) / 2) * (data.spread || .12)) + (data.name === 'MACHINE' ? THREE.MathUtils.randFloatSpread(.18) : 0);
    const dir = baseDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    const p = state.player.position.clone().add(new THREE.Vector3(0, .72, 0)).add(dir.clone().multiplyScalar(1.2));
    spawnProjectile(p, dir, { color: data.color, speed: data.name === 'SNIPER' ? 38 : 27, damage: data.damage * state.damage, life: data.range / 27, radius: data.name === 'SNIPER' ? .22 : .15 });
  }
}
function enemyFire(enemy) {
  const origin = enemy.mesh.position.clone(); origin.y = .8;
  const dir = state.player.position.clone().sub(origin); dir.y = 0; dir.normalize();
  spawnProjectile(origin.add(dir.clone().multiplyScalar(.95)), dir, { team: 'enemy', color: enemy.color, damage: enemy.damage, speed: 11 + state.level * .35, life: enemy.range / 11, radius: .17 });
}
function setAimFromPointer(event) {
  const rect = canvas.getBoundingClientRect(); pointer.x = (event.clientX - rect.left) / rect.width * 2 - 1; pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  const normalized = new THREE.Vector2(pointer.x, pointer.y); raycaster.setFromCamera(normalized, camera);
  if (!raycaster.ray.intersectPlane(groundPlane, aimPoint)) return;
  if (state.player && innerWidth > 600) { const crosshair = document.querySelector('#crosshair'); crosshair.style.left = `${event.clientX}px`; crosshair.style.top = `${event.clientY}px`; }
}
function updateCamera(dt) {
  const target = state.player ? state.player.position : new THREE.Vector3(0, 0, 0);
  const desired = new THREE.Vector3(target.x, 34, target.z + 27);
  camera.position.lerp(desired, 1 - Math.pow(.001, dt)); camera.lookAt(target.x, 0, target.z);
}
function updateHud() {
  document.querySelector('#hud-name').textContent = tanks[state.chosen].name;
  document.querySelector('#level').textContent = state.level;
  document.querySelector('#hp-text').textContent = `${Math.ceil(state.hp)} / ${state.maxHp}`;
  document.querySelector('#hp-bar').style.width = `${Math.max(0, state.hp / state.maxHp * 100)}%`;
  document.querySelector('#xp-text').textContent = `${Math.floor(state.xp)} / ${state.xpNext}`;
  document.querySelector('#xp-bar').style.width = `${state.xp / state.xpNext * 100}%`;
  document.querySelector('#kills').textContent = String(state.kills).padStart(2, '0');
  document.querySelector('#score').textContent = String(state.score).padStart(4, '0');
}
function gainXp(value) {
  state.xp += value;
  if (state.xp >= state.xpNext) { state.xp -= state.xpNext; state.level++; state.xpNext = Math.round(state.xpNext * 1.36); state.paused = true; showUpgrade(); }
  updateHud();
}
const upgrades = [
  { title: 'REINFORCED HULL', desc: 'Restore 45% hull and increase max health by 20.', apply: () => { state.maxHp += 20; state.hp = Math.min(state.maxHp, state.hp + 45); } },
  { title: 'HOT BARRELS', desc: 'Increase firing rate by 22%.', apply: () => { state.fireRate *= 1.22; } },
  { title: 'HIGH VELOCITY', desc: 'Increase projectile damage by 24%.', apply: () => { state.damage *= 1.24; } },
  { title: 'TREAD KITS', desc: 'Increase tank movement speed by 15%.', apply: () => { state.speed *= 1.15; } },
  { title: 'FIELD REPAIR', desc: 'Restore 70 hull integrity immediately.', apply: () => { state.hp = Math.min(state.maxHp, state.hp + 70); } },
  { title: 'CRITICAL LOAD', desc: 'Increase projectile damage by 12% and fire rate by 10%.', apply: () => { state.damage *= 1.12; state.fireRate *= 1.1; } }
];
let shownUpgrades = [];
function showUpgrade() {
  const list = [...upgrades].sort(() => Math.random() - .5).slice(0, 3); shownUpgrades = list;
  document.querySelector('#upgrade-options').innerHTML = list.map((u, i) => `<button class="upgrade-option" data-index="${i}"><span class="upgrade-number">0${i + 1} / UPGRADE</span><strong>${u.title}</strong><small>${u.desc}</small></button>`).join('');
  document.querySelector('#upgrade-screen').hidden = false;
  document.querySelectorAll('.upgrade-option').forEach(el => el.addEventListener('click', () => takeUpgrade(Number(el.dataset.index))));
}
function takeUpgrade(i) {
  if (!shownUpgrades[i]) return; shownUpgrades[i].apply();
  document.querySelector('#upgrade-screen').hidden = true; state.paused = false; updateHud(); toast(`${shownUpgrades[i].title} ACQUIRED`);
}
function damagePlayer(amount) {
  state.hp -= amount; updateHud();
  if (state.hp <= 0) gameOver();
}
function gameOver() {
  state.running = false; state.paused = false;
  document.querySelector('#final-kills').textContent = state.kills;
  document.querySelector('#final-level').textContent = state.level;
  document.querySelector('#final-score').textContent = String(state.score).padStart(4, '0');
  document.querySelector('#gameover-screen').hidden = false; document.querySelector('#mobile-controls').hidden = true;
  document.querySelector('#hud').hidden = true; document.querySelector('#scoreboard').hidden = true;
}
function makeBurst(position, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const mesh = addMesh(scene, new THREE.IcosahedronGeometry(.08 + Math.random() * .08, 0), color, position.x, position.y, position.z, 1, 1, 1, false);
    state.particles.push({ mesh, velocity: new THREE.Vector3(THREE.MathUtils.randFloatSpread(5), Math.random() * 4, THREE.MathUtils.randFloatSpread(5)), life: .45 + Math.random() * .4 });
  }
}
function toast(text) {
  const el = document.querySelector('#toast'); el.textContent = text; el.classList.add('visible');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('visible'), 1600);
}
function update(dt) {
  state.time += dt;
  for (const shape of [...state.shapes]) {
    shape.rotation.y += shape.userData.spin * dt; shape.rotation.x = Math.sin(state.time + shape.position.x) * .08;
  }
  if (!state.running || state.paused || !state.player) return;
  const player = state.player;
  const moveX = (state.keys.KeyD || state.keys.ArrowRight ? 1 : 0) - (state.keys.KeyA || state.keys.ArrowLeft ? 1 : 0) + state.joystick.x;
  const moveZ = (state.keys.KeyS || state.keys.ArrowDown ? 1 : 0) - (state.keys.KeyW || state.keys.ArrowUp ? 1 : 0) + state.joystick.z;
  const move = new THREE.Vector3(moveX, 0, moveZ);
  if (move.lengthSq() > 1) move.normalize();
  const data = tanks[state.chosen];
  state.dashCooldown = Math.max(0, state.dashCooldown - dt);
  if (state.keys.Space && state.dashCooldown === 0 && move.lengthSq() > .1) { state.dashing = .2; state.dashCooldown = 2.8; }
  state.dashing = Math.max(0, state.dashing - dt);
  const moveMultiplier = state.dashing > 0 ? 2.8 : 1;
  player.position.x = THREE.MathUtils.clamp(player.position.x + move.x * data.speed * state.speed * moveMultiplier * dt, -arena.bound + 1.5, arena.bound - 1.5);
  player.position.z = THREE.MathUtils.clamp(player.position.z + move.z * data.speed * state.speed * moveMultiplier * dt, -arena.bound + 1.5, arena.bound - 1.5);
  const face = new THREE.Vector3(aimPoint.x - player.position.x, 0, aimPoint.z - player.position.z);
  if (face.lengthSq() > .001) {
    player.rotation.y = Math.atan2(-face.x, -face.z);
    player.userData.turret.rotation.y = 0;
  }
  player.position.y = Math.sin(state.time * 8) * .015;
  if (state.pointerDown) firePlayer();
  state.spawnTimer += dt;
  if (state.spawnTimer > Math.max(1.2, 4.5 - state.level * .19) && state.enemies.length < Math.min(20, 7 + state.level * 2)) { state.spawnTimer = 0; spawnEnemy(); }
  for (const enemy of [...state.enemies]) {
    const delta = player.position.clone().sub(enemy.mesh.position); delta.y = 0;
    const distance = delta.length(); const dir = distance > .01 ? delta.clone().normalize() : new THREE.Vector3();
    enemy.wander += dt * .7;
    let moveDir = new THREE.Vector3(Math.cos(enemy.wander) * .22, 0, Math.sin(enemy.wander) * .22);
    if (distance > enemy.range * .76) moveDir.add(dir.clone().multiplyScalar(1.1));
    else if (distance < enemy.range * .42) moveDir.add(dir.clone().multiplyScalar(-.65));
    if (moveDir.lengthSq() > .01) moveDir.normalize();
    const candidate = enemy.mesh.position.clone().add(moveDir.multiplyScalar(enemy.speed * dt));
    candidate.x = THREE.MathUtils.clamp(candidate.x, -arena.bound + 2, arena.bound - 2); candidate.z = THREE.MathUtils.clamp(candidate.z, -arena.bound + 2, arena.bound - 2);
    enemy.mesh.position.copy(candidate); enemy.mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
    enemy.cooldown -= dt;
    if (distance < enemy.range && enemy.cooldown <= 0) { enemyFire(enemy); enemy.cooldown = enemy.fire * THREE.MathUtils.randFloat(.8, 1.2); }
    if (enemy.hp <= 0) {
      makeBurst(enemy.mesh.position, enemy.color, 14); state.score += enemy.value; state.kills++; gainXp(enemy.value); scene.remove(enemy.mesh); state.enemies.splice(state.enemies.indexOf(enemy), 1); continue;
    }
    if (distance < 1.6) damagePlayer(9 * dt);
  }
  for (const projectile of [...state.projectiles]) {
    projectile.life -= dt; projectile.mesh.position.addScaledVector(projectile.velocity, dt);
    let hit = false;
    if (projectile.team === 'player') {
      for (const enemy of state.enemies) if (projectile.mesh.position.distanceTo(enemy.mesh.position.clone().add(new THREE.Vector3(0, .6, 0))) < enemy.mesh.userData.radius + projectile.radius) {
        enemy.hp -= projectile.damage; enemy.hitFlash = .1; makeBurst(projectile.mesh.position, enemy.color, 2); hit = true; break;
      }
      if (!hit) for (const shape of [...state.shapes]) if (projectile.mesh.position.distanceTo(shape.position) < shape.userData.radius + projectile.radius) {
        shape.userData.hp -= projectile.damage; hit = true;
        if (shape.userData.hp <= 0) {
          makeBurst(shape.position, shape.material.color, 7); state.score += shape.userData.value; gainXp(shape.userData.value);
          scene.remove(shape); state.shapes.splice(state.shapes.indexOf(shape), 1); spawnShape();
        }
        break;
      }
    } else if (state.player && projectile.mesh.position.distanceTo(state.player.position.clone().add(new THREE.Vector3(0, .5, 0))) < 1.08) { damagePlayer(projectile.damage); hit = true; }
    if (hit || projectile.life <= 0 || Math.abs(projectile.mesh.position.x) > arena.bound + 4 || Math.abs(projectile.mesh.position.z) > arena.bound + 4) {
      scene.remove(projectile.mesh); state.projectiles.splice(state.projectiles.indexOf(projectile), 1);
    }
  }
  for (const particle of [...state.particles]) {
    particle.life -= dt; particle.mesh.position.addScaledVector(particle.velocity, dt); particle.velocity.y -= 9 * dt;
    particle.mesh.scale.multiplyScalar(Math.max(.01, 1 - dt * 1.5));
    if (particle.life <= 0) { scene.remove(particle.mesh); state.particles.splice(state.particles.indexOf(particle), 1); }
  }
  updateCamera(dt);
}
function render() { const dt = Math.min(clock.getDelta(), .05); update(dt); renderer.render(scene, camera); requestAnimationFrame(render); }
function resize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
  document.querySelector('#crosshair').style.display = state.running && innerWidth <= 600 ? 'block' : 'none';
}
function setupControls() {
  window.addEventListener('keydown', e => {
    if (e.repeat && e.code === 'Space') return;
    state.keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.code === 'Space' && !state.running) document.querySelector('#deploy-button').click();
    if (state.paused && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) takeUpgrade(Number(e.code.slice(-1)) - 1);
  });
  window.addEventListener('keyup', e => { state.keys[e.code] = false; });
  canvas.addEventListener('pointermove', setAimFromPointer);
  canvas.addEventListener('pointerdown', e => { if (e.button === 0) { setAimFromPointer(e); state.pointerDown = true; if (state.running) firePlayer(); } });
  window.addEventListener('pointerup', () => { state.pointerDown = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  document.querySelector('#deploy-button').addEventListener('click', startGame);
  document.querySelector('#retry-button').addEventListener('click', startGame);
  document.querySelector('#sound-button').addEventListener('click', e => { state.sound = !state.sound; e.currentTarget.querySelector('span').textContent = state.sound ? 'SOUND ON' : 'SOUND OFF'; });
  const zone = document.querySelector('#stick-zone'), knob = document.querySelector('#stick-knob'); let activePointer = null;
  zone.addEventListener('pointerdown', e => { activePointer = e.pointerId; zone.setPointerCapture(activePointer); moveStick(e); });
  zone.addEventListener('pointermove', e => { if (e.pointerId === activePointer) moveStick(e); });
  const release = e => { if (e.pointerId === activePointer) { activePointer = null; state.joystick.x = state.joystick.z = 0; knob.style.transform = 'translate(0px,0px)'; } };
  zone.addEventListener('pointerup', release); zone.addEventListener('pointercancel', release);
  function moveStick(e) {
    const rect = zone.getBoundingClientRect(), dx = e.clientX - (rect.left + rect.width / 2), dy = e.clientY - (rect.top + rect.height / 2);
    const length = Math.max(1, Math.hypot(dx, dy)), amount = Math.min(34, length), x = dx / length * amount, y = dy / length * amount;
    knob.style.transform = `translate(${x}px,${y}px)`; state.joystick.x = x / 34; state.joystick.z = y / 34;
  }
  const fireButton = document.querySelector('#fire-button');
  fireButton.addEventListener('pointerdown', e => { e.preventDefault(); state.pointerDown = true; fireButton.setPointerCapture(e.pointerId); });
  fireButton.addEventListener('pointerup', () => { state.pointerDown = false; }); fireButton.addEventListener('pointercancel', () => { state.pointerDown = false; });
  window.addEventListener('resize', resize);
  window.addEventListener('blur', () => { state.keys = {}; state.pointerDown = false; });
}
setupWorld(); setupSelection(); setupControls();
const initialAim = new THREE.Vector3(0, 0, -8); aimPoint.copy(initialAim); camera.position.set(0, 34, 27); camera.lookAt(0, 0, 0);
render();
