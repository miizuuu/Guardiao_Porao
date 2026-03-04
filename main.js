import * as THREE from 'three';

/**
 * O GUARDIÃO DO PORÃO - VERSÃO ESTÁVEL E CORRIGIDA
 * -----------------------------------------------
 * [FIX] Resolvido erro de variável indefinida que impedia o boot.
 * [FIX] Unificados IDs de UI (msg-box).
 * [FEAT] Hub Central, Buracos nas Paredes, Colisão Deslizante.
 */

const clock = new THREE.Clock();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510);
scene.fog = new THREE.Fog(0x050510, 10, 65);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// --- ILUMINAÇÃO ---
scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const light = new THREE.PointLight(0xffae22, 25, 60);
light.position.set(0, 10, 0);
light.castShadow = true;
scene.add(light);

// --- ASSETS ---
const texLoader = new THREE.TextureLoader();
const assets = './public/assets/';

const loadT = (f, rx = 1, ry = 1) => {
    const t = texLoader.load(assets + f);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    return t;
};

const matFloor = new THREE.MeshStandardMaterial({ map: loadT('floor.png', 20, 20), color: 0x887766 });
const matWall = new THREE.MeshStandardMaterial({ map: loadT('wall.png', 1, 1), color: 0xaa5544 });

// HERO SPRITE (Animado 4x1)
const heroTex = texLoader.load(assets + 'hero.png');
heroTex.magFilter = THREE.NearestFilter;
heroTex.repeat.set(0.25, 1);

const matHero = new THREE.MeshStandardMaterial({
    map: heroTex,
    transparent: true,
    alphaTest: 0.5,
    side: THREE.FrontSide,
    emissive: 0xffffff,
    emissiveIntensity: 0.1
});

// --- ESTADO ---
const game = {
    player: { mesh: null, box: new THREE.Box3(), speed: 0.18, frame: 0, timer: 0, dir: 1, action: 'idle' },
    walls: [],
    doors: {},
    interactables: [],
    leverSeq: [], symbolSeq: [], orbSeq: [],
    input: { w: false, a: false, s: false, d: false, e: false }
};

// --- CONSTRUTORES ---

function addBox(w, h, d, x, y, z, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    scene.add(m);
    game.walls.push(new THREE.Box3().setFromObject(m));
    return m;
}

function createOpening(x, z, rotY, doorId, col) {
    const g = new THREE.Group();
    const l = new THREE.Mesh(new THREE.BoxGeometry(7, 10, 1), matWall); l.position.set(-6, 5, 0);
    const r = new THREE.Mesh(new THREE.BoxGeometry(7, 10, 1), matWall); r.position.set(6, 5, 0);
    const t = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 1), matWall); t.position.set(0, 8.5, 0);
    const dM = new THREE.Mesh(new THREE.BoxGeometry(5.2, 7.2, 0.4), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.3 }));
    dM.position.set(0, 3.5, 0);
    g.add(l, r, t, dM);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    scene.add(g);

    // Colisões pilares
    game.walls.push(new THREE.Box3().setFromObject(l), new THREE.Box3().setFromObject(r), new THREE.Box3().setFromObject(t));
    const dB = new THREE.Box3().setFromObject(dM);
    game.doors[doorId] = { mesh: dM, box: dB, open: false };
}

function initMap() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), matFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // HUB
    createOpening(0, -10, 0, 'door1', 0x9d00ff); // Norte
    createOpening(10, 0, Math.PI / 2, 'door2', 0x00ffcc); // Leste
    createOpening(-10, 0, Math.PI / 2, 'door3', 0xffcc00); // Oeste
    addBox(21, 10, 1, 0, 5, 10, matWall); // Sul

    // SALA 1
    addBox(20, 10, 1, 0, 5, -30, matWall);
    addBox(1, 10, 20, -10, 5, -20, matWall);
    addBox(1, 10, 20, 10, 5, -20, matWall);
    [-5, 0, 5].forEach((x, i) => {
        const group = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.6), new THREE.MeshStandardMaterial({ color: 0x332200 }));
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5), new THREE.MeshStandardMaterial({ color: 0xffaa00 }));
        stick.position.y = 0.5; stick.rotation.z = Math.PI / 4;
        group.add(base, stick); group.position.set(x, 1, -29);
        group.userData = { id: i, type: 'lever', stick: stick, active: false }; // [FIX] Variável correta: stick
        scene.add(group); game.interactables.push(group);
    });

    // SALA 2
    addBox(1, 10, 20, 30, 5, 0, matWall);
    addBox(20, 10, 1, 20, 5, -10, matWall);
    addBox(20, 10, 1, 20, 5, 10, matWall);
    ["🔯", "☯️", "⚛️"].forEach((icon, i) => {
        const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#00ffcc'; ctx.font = 'bold 90px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(icon, 64, 64);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, emissive: 0x00ffcc }));
        m.position.set(29.4, 4, -5 + i * 5); m.rotation.y = -Math.PI / 2;
        m.userData = { id: i, type: 'symbol', active: false };
        scene.add(m); game.interactables.push(m);
    });

    // SALA 3
    addBox(1, 10, 20, -30, 5, 0, matWall);
    addBox(20, 10, 1, -20, 5, -10, matWall);
    addBox(20, 10, 1, -20, 5, 10, matWall);
    [0xff0000, 0x00ff00, 0x0000ff].forEach((col, i) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1.5), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2 }));
        m.position.set(-29.4, 3, -5 + i * 5); m.rotation.y = Math.PI / 2;
        m.userData = { id: i, type: 'orb', active: false };
        scene.add(m); game.interactables.push(m);
    });
}

function initPlayer() {
    game.player.mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), matHero);
    game.player.mesh.position.set(0, 2.5, 5);
    scene.add(game.player.mesh);
}

function canMove(vx, vz) {
    const pB = new THREE.Box3().setFromObject(game.player.mesh);
    pB.expandByScalar(-0.4);
    pB.min.x += vx; pB.max.x += vx; pB.min.z += vz; pB.max.z += vz;
    for (let w of game.walls) if (pB.intersectsBox(w)) return false;
    for (let id in game.doors) if (!game.doors[id].open && pB.intersectsBox(game.doors[id].box)) return false;
    return true;
}

function update() {
    const dt = clock.getDelta();
    const p = game.player;
    if (!p.mesh) return;

    let mx = 0, mz = 0;
    if (game.input.w) mz -= p.speed;
    if (game.input.s) mz += p.speed;
    if (game.input.a) { mx -= p.speed; p.dir = -1; }
    if (game.input.d) { mx += p.speed; p.dir = 1; }

    if (mx !== 0 || mz !== 0) {
        if (canMove(mx, 0)) p.mesh.position.x += mx;
        if (canMove(0, mz)) p.mesh.position.z += mz;
        p.timer += dt * 10;
        p.frame = Math.floor(p.timer) % 4;
        heroTex.offset.x = p.frame * 0.25;
    } else {
        heroTex.offset.x = 0;
    }
    p.mesh.scale.x = Math.abs(p.mesh.scale.x) * p.dir;

    const cX = Math.max(-8, Math.min(8, p.mesh.position.x));
    camera.position.lerp(new THREE.Vector3(cX, 10, p.mesh.position.z + 14), 0.1);
    camera.lookAt(p.mesh.position.x, 2, p.mesh.position.z);
    p.mesh.rotation.y = Math.atan2(camera.position.x - p.mesh.position.x, camera.position.z - p.mesh.position.z);

    let near = false;
    for (let obj of game.interactables) {
        if (p.mesh.position.distanceTo(obj.position) < 5) {
            near = true;
            document.getElementById('interaction-label').classList.remove('hidden');
            if (game.input.e) { handleInteraction(obj); game.input.e = false; }
            break;
        }
    }
    if (!near) document.getElementById('interaction-label').classList.add('hidden');
}

function handleInteraction(obj) {
    const d = obj.userData;
    if (d.type === 'lever' && !d.active) {
        d.active = true; d.stick.rotation.z = -Math.PI / 4; game.leverSeq.push(d.id);
        if (game.leverSeq.length === 3) {
            if (JSON.stringify(game.leverSeq) === "[0,2,1]") {
                showMsg("PASSAGEM NORTE ABERTA!"); game.doors.door1.open = true;
                const a = () => { game.doors.door1.mesh.position.y += 0.2; if (game.doors.door1.mesh.position.y < 12) requestAnimationFrame(a); }; a();
            } else {
                showMsg("ORDEM INCORRETA. RESET."); setTimeout(() => { game.leverSeq = []; game.interactables.filter(o => o.userData.type === 'lever').forEach(o => { o.userData.active = false; o.userData.stick.rotation.z = Math.PI / 4; }); }, 800);
            }
        }
    }
    if (d.type === 'symbol' && !d.active) {
        d.active = true; obj.material.emissiveIntensity = 3; game.symbolSeq.push(d.id);
        if (game.symbolSeq.length === 3) {
            if (JSON.stringify(game.symbolSeq) === "[2,0,1]") {
                showMsg("PASSAGEM LESTE ABERTA!"); game.doors.door2.open = true;
                const a = () => { game.doors.door2.mesh.position.y += 0.2; if (game.doors.door2.mesh.position.y < 12) requestAnimationFrame(a); }; a();
            } else {
                showMsg("RESETS SYMBOLS."); setTimeout(() => { game.symbolSeq = []; game.interactables.filter(o => o.userData.type === 'symbol').forEach(o => { o.userData.active = false; o.material.emissiveIntensity = 1; }); }, 1000);
            }
        }
    }
    if (d.type === 'orb' && !d.active) {
        d.active = true; obj.material.emissiveIntensity = 5; game.orbSeq.push(d.id);
        if (game.orbSeq.length === 3) {
            if (JSON.stringify(game.orbSeq) === "[1,0,2]") {
                showMsg("PASSAGEM OESTE ABERTA!"); game.doors.door3.open = true;
                const a = () => { game.doors.door3.mesh.position.y += 0.2; if (game.doors.door3.mesh.position.y < 12) requestAnimationFrame(a); }; a();
            } else {
                showMsg("RESET ORBES."); setTimeout(() => { game.orbSeq = []; game.interactables.filter(o => o.userData.type === 'orb').forEach(o => { o.userData.active = false; o.material.emissiveIntensity = 2; }); }, 1000);
            }
        }
    }
}

function showMsg(t) {
    const mb = document.getElementById('msg-box');
    document.getElementById('msg-text').innerText = t;
    mb.classList.remove('hidden');
    mb.onclick = () => mb.classList.add('hidden');
}

const loop = () => { requestAnimationFrame(loop); update(); renderer.render(scene, camera); };

window.addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (game.input.hasOwnProperty(k)) game.input[k] = true; });
window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (game.input.hasOwnProperty(k)) game.input[k] = false; });
window.onresize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };

// BOOT
initMap();
initPlayer();
loop();
setTimeout(() => document.getElementById('loader').style.display = 'none', 1000);
