import * as THREE from 'three';

/**
 * O GUARDIÃO DO PORÃO - VERSÃO ANIMADA E COLORIDA
 * Foco: Câmera Próxima, Animações de Sprite, Cores Vibrantes (Ouro, Laranja, Púrpura).
 */

const clock = new THREE.Clock();
const scene = new THREE.Scene();

// Fundo Místico (Roxo Escuro e Quente)
scene.background = new THREE.Color(0x15051a);
scene.fog = new THREE.Fog(0x15051a, 5, 45);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// --- ILUMINAÇÃO (QUENTE E MÁGICA) ---
const hemiLight = new THREE.HemisphereLight(0xffaa00, 0x440066, 1.2); // Ouro e Púrpura
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xff7700, 1.0); // Laranja Forte
sunLight.position.set(10, 20, 10);
sunLight.castShadow = true;
scene.add(sunLight);

// --- ASSETS ---
const texLoader = new THREE.TextureLoader();
const assets = './public/assets/';

const load = (f, rx = 1, ry = 1) => {
    const t = texLoader.load(assets + f, undefined, undefined, () => console.warn("Faltando: " + f));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    return t;
};

// Materiais Coloridos
const floorMat = new THREE.MeshStandardMaterial({ map: load('floor.png', 12, 12), color: 0xffaa44, roughness: 0.6 });
const wallMat = new THREE.MeshStandardMaterial({ map: load('wall.png', 5, 1), color: 0xff5533, roughness: 0.8 });
const heroMat = new THREE.MeshStandardMaterial({
    map: texLoader.load(assets + 'hero.png'),
    transparent: true,
    alphaTest: 0.4,
    emissive: 0xff6600,
    emissiveIntensity: 0.15
});

// --- ESTADO DO JOGO ---
const game = {
    player: {
        mesh: null,
        state: 'idle', // idle, walking, attacking, interacting
        speed: 0.16,
        radius: 1.0,
        bob: 0,
        animTime: 0,
        dir: 1 // 1 = direita, -1 = esquerda
    },
    walls: [],
    interactables: [],
    leverSeq: [],
    symbolSeq: [],
    orbSeq: [],
    room2: false,
    room3: false,
    inv: []
};

const keys = { w: false, a: false, s: false, d: false, e: false };

// --- CONSTRUTORES ---

function addWall(x, z, w, d, color = 0xff5533) {
    const mat = wallMat.clone();
    mat.color.set(color);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 10, d), mat);
    mesh.position.set(x, 5, z);
    scene.add(mesh);
    game.walls.push({ x, z, w: w / 2 + 0.8, d: d / 2 + 0.8, active: true });
    return mesh;
}

function createHub() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Paredes Sala 1 (Laranja/Ouro)
    addWall(0, -15, 30, 1, 0xff7700);
    addWall(-15, 5, 1, 40, 0xff7700);
    addWall(15, 5, 1, 40, 0xff7700);

    // Puzzle 1: Alavancas
    for (let i = 0; i < 3; i++) {
        const g = new THREE.Group();
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.6), new THREE.MeshStandardMaterial({ color: 0x442200 }));
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.5), new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff5500 }));
        s.position.y = 0.6; s.rotation.z = Math.PI / 4;
        g.add(b); g.add(s);
        g.position.set(-8 + i * 8, 1, -14);
        g.userData = { id: i, type: 'lever', stick: s, active: false };
        scene.add(g);
        game.interactables.push(g);
    }

    // Porta 1
    const dG = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(5, 8, 0.6), new THREE.MeshStandardMaterial({ color: 0x9d00ff, emissive: 0x9d00ff, emissiveIntensity: 0.4 }));
    leaf.position.x = 2.5;
    dG.add(leaf);
    dG.position.set(14.5, 0, -4);
    dG.rotation.y = Math.PI / 2;
    scene.add(dG);

    const doorWall = { x: 14.5, z: -4, w: 0.5, d: 3, active: true, name: 'door1' };
    game.walls.push(doorWall);
    game.door1 = { g: dG, leaf, wall: doorWall };
}

function createRoom2() {
    if (game.room2) return; game.room2 = true;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(35, 0, -4);
    scene.add(floor);

    addWall(35, -24, 40, 1, 0x33ff33); // Norte (Verde)
    addWall(35, 16, 40, 1, 0x33ff33);  // Sul
    addWall(55, -4, 1, 40, 0x33ff33);  // Leste

    // Símbolos Gigantes (Verdes)
    const chars = ["🔯", "☯️", "⚛️"];
    chars.forEach((c, i) => {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#33ff33'; ctx.font = 'bold 100px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(c, 64, 64);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, emissive: 0x33ff33, emissiveIntensity: 0.8 }));
        m.position.set(25 + i * 12, 4.5, -23.2);
        m.userData = { id: i, type: 'symbol', active: false };
        scene.add(m);
        game.interactables.push(m);
    });

    // Porta 2
    const door2 = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(6, 8, 0.6), new THREE.MeshStandardMaterial({ color: 0x33ff33, emissive: 0x33ff33, emissiveIntensity: 0.5 }));
    leaf.position.x = 3; door2.add(leaf);
    door2.position.set(35, 0, 15.5);
    scene.add(door2);
    const wall = { x: 35, z: 15.5, w: 4, d: 0.5, active: true, name: 'door2' };
    game.walls.push(wall);
    game.door2 = { g: door2, leaf, wall };
}

function createRoom3() {
    if (game.room3) return; game.room3 = true;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 50), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(35, 0, 55);
    scene.add(floor);

    addWall(35, 80, 40, 1, 0x9d00ff); // Sul (Púrpura)
    addWall(15, 55, 1, 50, 0x9d00ff); // Oeste
    addWall(55, 55, 1, 50, 0x9d00ff); // Leste

    [0xff3300, 0x33ff33, 0x9d00ff].forEach((col, i) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1.5), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2 }));
        m.position.set(23 + i * 12, 3, 70);
        m.userData = { id: i, type: 'orb', active: false };
        scene.add(m);
        game.interactables.push(m);
    });
}

// --- JOGADOR ANIMADO ---

function initPlayer() {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 5.2), heroMat);
    mesh.position.set(0, 2.6, 5);
    mesh.castShadow = true;
    scene.add(mesh);
    game.player.mesh = mesh;
}

window.onkeydown = e => { const k = e.key.toLowerCase(); if (keys.hasOwnProperty(k)) keys[k] = true; };
window.onkeyup = e => { const k = e.key.toLowerCase(); if (keys.hasOwnProperty(k)) keys[k] = false; };

function checkCollision(nx, nz) {
    for (let w of game.walls) {
        if (!w.active) continue;
        if (nx > w.x - w.w && nx < w.x + w.w && nz > w.z - w.d && nz < w.z + w.d) return true;
    }
    return false;
}

function animatePlayer(delta) {
    const p = game.player;
    if (!p.mesh) return;

    if (p.state === 'walking') {
        p.bob += delta * 12;
        p.mesh.position.y = 2.6 + Math.sin(p.bob) * 0.15; // Bobbing de altura
        p.mesh.rotation.z = Math.sin(p.bob * 0.5) * 0.08; // Balanço lateral
        p.mesh.scale.x = (p.dir * 1) + (Math.sin(p.bob) * 0.05); // Pulsar de largura
    } else if (p.state === 'attacking') {
        p.animTime += delta * 15;
        p.mesh.rotation.z = Math.sin(p.animTime) * 0.4; // Balanço de ataque
        p.mesh.scale.set(1.2, 1.2, 1);
        if (p.animTime > Math.PI * 2) { p.state = 'idle'; p.animTime = 0; }
    } else if (p.state === 'interacting') {
        p.animTime += delta * 10;
        p.mesh.scale.y = 1 + Math.sin(p.animTime) * 0.1; // "Agachar" para interagir
        if (p.animTime > Math.PI) { p.state = 'idle'; p.animTime = 0; }
    } else {
        // Idle
        p.mesh.position.y = 2.6 + Math.sin(Date.now() * 0.002) * 0.05;
        p.mesh.rotation.z = 0;
        p.mesh.scale.set(p.dir, 1, 1);
    }
}

function update() {
    const delta = clock.getDelta();
    if (!game.player.mesh) return;
    const p = game.player;

    // Movimento
    let vx = 0, vz = 0;
    if (keys.w) vz -= p.speed;
    if (keys.s) vz += p.speed;
    if (keys.a) { vx -= p.speed; p.dir = -1; }
    if (keys.d) { vx += p.speed; p.dir = 1; }

    if (vx !== 0 || vz !== 0) {
        if (p.state !== 'attacking' && p.state !== 'interacting') p.state = 'walking';
    } else {
        if (p.state === 'walking') p.state = 'idle';
    }

    const nx = p.mesh.position.x + vx;
    const nz = p.mesh.position.z + vz;

    if (!checkCollision(nx, p.mesh.position.z)) p.mesh.position.x = nx;
    if (!checkCollision(p.mesh.position.x, nz)) p.mesh.position.z = nz;

    animatePlayer(delta);

    // Billboard
    p.mesh.rotation.y = Math.atan2(camera.position.x - p.mesh.position.x, camera.position.z - p.mesh.position.z);

    // CÂMERA MAIS PRÓXIMA
    const targetCam = new THREE.Vector3(p.mesh.position.x, 8, p.mesh.position.z + 12); // Posição mais perto e baixa
    camera.position.lerp(targetCam, 0.12);
    camera.lookAt(p.mesh.position.x, 2, p.mesh.position.z);

    // Interações
    let nearInteractable = null;
    game.interactables.forEach(obj => {
        const dist = p.mesh.position.distanceTo(obj.position);
        if (dist < 5) {
            nearInteractable = obj;
            document.getElementById('interaction-label').classList.remove('hidden');
            if (keys.e) {
                p.state = 'interacting';
                handleInteraction(obj);
                keys.e = false;
            }
        }
    });
    if (!nearInteractable) document.getElementById('interaction-label').classList.add('hidden');

    // Ataque (Espaço)
    if (keys[' ']) {
        p.state = 'attacking';
        // Futura lógica de dano aqui
    }
}

function handleInteraction(obj) {
    const d = obj.userData;
    if (d.type === 'lever' && !d.active) {
        d.active = true; d.stick.rotation.z = -Math.PI / 4;
        game.leverSeq.push(d.id);
        if (game.leverSeq.length === 3) {
            if (JSON.stringify(game.leverSeq) === "[0,2,1]") {
                showMsg("PORTA MÍSTICA ABERTA!");
                game.door1.wall.active = false;
                addToInv("Faca Curta", "slot-1");
                let f = 0; const a = () => { f++; game.door1.leaf.position.x += 0.15; if (f < 40) requestAnimationFrame(a); }; a();
                createRoom2();
            } else {
                showMsg("AS ALAVANCAS TRAVARAM...");
                setTimeout(() => { game.leverSeq = []; game.interactables.filter(o => o.userData.type === 'lever').forEach(o => { o.userData.active = false; o.userData.stick.rotation.z = Math.PI / 4; }); }, 800);
            }
        }
    }

    if (d.type === 'symbol' && !d.active) {
        d.active = true; obj.material.emissiveIntensity = 3;
        game.symbolSeq.push(d.id);
        if (game.symbolSeq.length === 3) {
            if (JSON.stringify(game.symbolSeq) === "[2,0,1]") {
                showMsg(" ENERGIA VERDE LIBERADA!");
                game.door2.wall.active = false;
                addToInv("Pistola Velha", "slot-2");
                let f = 0; const a = () => { f++; game.door2.leaf.position.x += 0.18; if (f < 40) requestAnimationFrame(a); }; a();
                createRoom3();
            } else {
                showMsg("ORDEM INCORRETA.");
                setTimeout(() => { game.symbolSeq = []; game.interactables.filter(o => o.userData.type === 'symbol').forEach(o => { o.userData.active = false; o.material.emissiveIntensity = 0.8; }); }, 1000);
            }
        }
    }

    if (d.type === 'orb' && !d.active) {
        d.active = true; obj.material.emissiveIntensity = 6;
        game.orbSeq.push(d.id);
        if (game.orbSeq.length === 3) {
            if (JSON.stringify(game.orbSeq) === "[1,0,2]") {
                showMsg("O CETRO RÚNICO É SEU!");
                addToInv("Cetro Rúnico", "slot-3");
            } else {
                showMsg("RITUAL FALHOU.");
                setTimeout(() => { game.orbSeq = []; game.interactables.filter(o => o.userData.type === 'orb').forEach(o => { o.userData.active = false; o.material.emissiveIntensity = 1.5; }); }, 1000);
            }
        }
    }
}

// UI HELPERS
function showMsg(t) { const b = document.getElementById('msg-box'); document.getElementById('msg-text').innerText = t; b.classList.remove('hidden'); b.onclick = () => b.classList.add('hidden'); }
function addToInv(name, id) { const s = document.getElementById(id); s.classList.add('active'); game.inv.push(name); document.getElementById('weapon-display').innerText = name.toUpperCase(); }

function loop() {
    requestAnimationFrame(loop);
    update();
    renderer.render(scene, camera);
}

// BOOT
createHub();
initPlayer();
loop();

window.onload = () => {
    let p = 0; const i = setInterval(() => { p += 4; document.getElementById('progress-fill').style.width = p + '%'; if (p >= 100) { clearInterval(i); document.getElementById('loader').style.display = 'none'; } }, 30);
};
window.onresize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
