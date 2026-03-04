import * as THREE from 'three';

/**
 * CÉRBERO: O Guardião - Código Estável
 * ------------------------------------
 * Hub Central -> Sala 1 -> Sala 2 -> Sala 3 -> Boss
 */

const clock = new THREE.Clock();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0510);
scene.fog = new THREE.Fog(0x0a0510, 5, 60);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// --- LUZES ---
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const glow = new THREE.PointLight(0xffaa00, 40, 60);
glow.position.set(0, 12, 0);
scene.add(glow);

// --- ASSETS ---
const texLoader = new THREE.TextureLoader();
// Ajuste automático de caminho para GitHub Pages ou Local
const path = window.location.href.includes('github.io') ? './assets/' : './public/assets/';

const createMat = (file, color) => {
    const mat = new THREE.MeshStandardMaterial({ color });
    texLoader.load(path + file, (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        mat.map = t;
        mat.needsUpdate = true;
    }, undefined, () => console.warn("Asset não encontrado: " + file));
    return mat;
};

const matFloor = createMat('floor.png', 0x554433);
const matWall = createMat('wall.png', 0xaa5544);

// SPRITE DO HERÓI (Animado 4x1)
const matHero = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, alphaTest: 0.5 });
texLoader.load(path + 'hero.png', (t) => {
    t.magFilter = THREE.NearestFilter;
    t.repeat.set(0.25, 1);
    matHero.map = t;
    matHero.needsUpdate = true;
}, undefined, () => {
    matHero.color.set(0x00ff00);
    matHero.transparent = false;
});

// --- ESTADO ---
const game = {
    player: { mesh: null, speed: 0.2, frame: 0, timer: 0, dir: 1 },
    walls: [],
    doors: {},
    interactables: [],
    leverSeq: [], symbolSeq: [], orbSeq: [],
    input: { w: false, a: false, s: false, d: false, e: false }
};

// --- MUNDO ---
function addBox(w, h, d, x, y, z, mat, isWall = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    m.position.set(x, y, z);
    scene.add(m);
    if (isWall) game.walls.push(new THREE.Box3().setFromObject(m));
    return m;
}

function createOpening(x, z, rotY, doorId, doorCol) {
    const group = new THREE.Group();
    // Vãos da parede
    const l = new THREE.Mesh(new THREE.BoxGeometry(7, 10, 1), matWall); l.position.set(-6, 5, 0);
    const r = new THREE.Mesh(new THREE.BoxGeometry(7, 10, 1), matWall); r.position.set(6, 5, 0);
    const t = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 1), matWall); t.position.set(0, 8.5, 0);
    // A Porta
    const door = new THREE.Mesh(new THREE.BoxGeometry(5.2, 7.5, 0.4), new THREE.MeshStandardMaterial({ color: doorCol, emissive: doorCol, emissiveIntensity: 0.5 }));
    door.position.set(0, 3.7, 0);

    group.add(l, r, t, door);
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    scene.add(group);

    game.walls.push(new THREE.Box3().setFromObject(l), new THREE.Box3().setFromObject(r), new THREE.Box3().setFromObject(t));
    game.doors[doorId] = { mesh: door, box: new THREE.Box3().setFromObject(door), open: false };
}

function init() {
    // Chão
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(250, 250), matFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // HUB CENTRAL
    createOpening(0, -12, 0, 'door1', 0x9d00ff);      // NORTE
    createOpening(15, 0, Math.PI / 2, 'door2', 0x00ffff);  // LESTE
    createOpening(-15, 0, -Math.PI / 2, 'door3', 0xffff00); // OESTE
    const sWall = new THREE.Mesh(new THREE.BoxGeometry(30, 10, 1), matWall);
    sWall.position.set(0, 5, 15);
    scene.add(sWall);
    game.walls.push(new THREE.Box3().setFromObject(sWall));

    // Sala 1: Alavancas
    [-5, 0, 5].forEach((x, i) => {
        const lev = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 1), new THREE.MeshStandardMaterial({ color: 0x332200 }));
        lev.position.set(x, 1, -28);
        scene.add(lev);
        lev.userData = { id: i, type: 'lever', active: false };
        game.interactables.push(lev);
    });

    // Sala 2: Símbolos
    ["🔯", "☯️", "⚛️"].forEach((icon, i) => {
        const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#00ffff'; ctx.font = 'bold 90px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(icon, 64, 64);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, emissive: 0x00ffff, emissiveIntensity: 0.5 }));
        m.position.set(29.4, 4, -5 + i * 5); m.rotation.y = -Math.PI / 2;
        m.userData = { id: i, type: 'symbol', active: false };
        scene.add(m); game.interactables.push(m);
    });

    // Sala 3: Orbes
    [0xff3300, 0x33ff33, 0x9d00ff].forEach((col, i) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1.5), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2 }));
        m.position.set(-29.4, 3, -5 + i * 5);
        m.userData = { id: i, type: 'orb', active: false };
        scene.add(m); game.interactables.push(m);
    });

    // Herói
    game.player.mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 6), matHero);
    game.player.mesh.position.set(0, 3, 5);
    scene.add(game.player.mesh);
}

// --- LOGICA ---
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
        const pB = new THREE.Box3().setFromObject(p.mesh).expandByScalar(-0.4);

        // Colisão X
        pB.translate(new THREE.Vector3(mx, 0, 0));
        let hitX = game.walls.some(w => pB.intersectsBox(w)) ||
            Object.values(game.doors).some(d => !d.open && pB.intersectsBox(d.box));
        if (!hitX) p.mesh.position.x += mx;

        // Colisão Z
        pB.setFromObject(p.mesh).expandByScalar(-0.4).translate(new THREE.Vector3(0, 0, mz));
        let hitZ = game.walls.some(w => pB.intersectsBox(w)) ||
            Object.values(game.doors).some(d => !d.open && pB.intersectsBox(d.box));
        if (!hitZ) p.mesh.position.z += mz;

        if (matHero.map) {
            p.timer += dt * 10;
            matHero.map.offset.x = (Math.floor(p.timer) % 4) * 0.25;
        }
    } else {
        if (matHero.map) matHero.map.offset.x = 0;
    }
    p.mesh.scale.x = Math.abs(p.mesh.scale.x) * p.dir;

    camera.position.lerp(new THREE.Vector3(p.mesh.position.x, 10, p.mesh.position.z + 16), 0.1);
    camera.lookAt(p.mesh.position.x, 2, p.mesh.position.z);
    p.mesh.rotation.y = Math.atan2(camera.position.x - p.mesh.position.x, camera.position.z - p.mesh.position.z);

    // Interação
    let near = false;
    for (let obj of game.interactables) {
        if (p.mesh.position.distanceTo(obj.position) < 5) {
            near = true;
            document.getElementById('interact-hint').classList.remove('hidden');
            if (game.input.e) {
                handleInteraction(obj);
                game.input.e = false;
            }
            break;
        }
    }
    if (!near) document.getElementById('interact-hint').classList.add('hidden');
}

function handleInteraction(obj) {
    const d = obj.userData;
    if (d.type === 'lever' && !d.active) {
        d.active = true; obj.material.color.set(0xffaa00);
        game.leverSeq.push(d.id);
        if (game.leverSeq.length === 3) {
            if (JSON.stringify(game.leverSeq) === "[0,2,1]") {
                showMsg("PORTA NORTE ABERTA!"); game.doors.door1.open = true;
                const a = () => { game.doors.door1.mesh.position.y += 0.2; if (game.doors.door1.mesh.position.y < 11) requestAnimationFrame(a); }; a();
            } else {
                showMsg("RESET."); game.leverSeq = [];
                game.interactables.filter(o => o.userData.type === 'lever').forEach(o => { o.userData.active = false; o.material.color.set(0x332200); });
            }
        }
    }
    if (d.type === 'symbol' && !d.active) {
        d.active = true; obj.material.emissiveIntensity = 3;
        game.symbolSeq.push(d.id);
        if (game.symbolSeq.length === 3) {
            if (JSON.stringify(game.symbolSeq) === "[2,0,1]") {
                showMsg("PORTA LESTE ABERTA!"); game.doors.door2.open = true;
                const a = () => { game.doors.door2.mesh.position.y += 0.2; if (game.doors.door2.mesh.position.y < 11) requestAnimationFrame(a); }; a();
            } else {
                showMsg("RESET."); game.symbolSeq = [];
                game.interactables.filter(o => o.userData.type === 'symbol').forEach(o => { o.userData.active = false; o.material.emissiveIntensity = 0.5; });
            }
        }
    }
    if (d.type === 'orb' && !d.active) {
        d.active = true; obj.material.emissiveIntensity = 5;
        game.orbSeq.push(d.id);
        if (game.orbSeq.length === 3) {
            if (JSON.stringify(game.orbSeq) === "[1,0,2]") {
                showMsg("PORTA OESTE ABERTA!"); game.doors.door3.open = true;
                const a = () => { game.doors.door3.mesh.position.y += 0.2; if (game.doors.door3.mesh.position.y < 11) requestAnimationFrame(a); }; a();
            } else {
                showMsg("RESET."); game.orbSeq = [];
                game.interactables.filter(o => o.userData.type === 'orb').forEach(o => { o.userData.active = false; o.material.emissiveIntensity = 2; });
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
init();
loop();
setTimeout(() => document.getElementById('loader').classList.add('hidden'), 500);
