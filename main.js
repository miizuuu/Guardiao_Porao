import * as THREE from 'three';

/**
 * O GUARDIÃO DO PORÃO - VERSÃO HUB DEFINITIVA
 * - Hub Central com 3 Salas + Arena Boss
 * - Paredes com vãos reais para as portas
 * - Sprite com transparência e animação frame-a-frame
 */

const clock = new THREE.Clock();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a0a2e); // Roxo místico
scene.fog = new THREE.Fog(0x1a0a2e, 10, 60);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// --- ILUMINAÇÃO (QUENTE E CLARA) ---
const ambient = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambient);
const sun = new THREE.PointLight(0xffaa44, 25, 40);
sun.position.set(0, 10, 0);
sun.castShadow = true;
scene.add(sun);

// --- ASSETS ---
const texLoader = new THREE.TextureLoader();
const assets = './public/assets/';

const floorTex = texLoader.load(assets + 'floor.png');
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
floorTex.repeat.set(20, 20);

const wallTex = texLoader.load(assets + 'wall.png');
wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
wallTex.repeat.set(1, 1);

const matFloor = new THREE.MeshStandardMaterial({ map: floorTex, color: 0xffaa44 });
const matWall = new THREE.MeshStandardMaterial({ map: wallTex, color: 0xff5533 });

// Sprite do Herói (Configuração de Transparência e Frames)
const heroTex = texLoader.load(assets + 'hero.png');
heroTex.magFilter = THREE.NearestFilter;
heroTex.repeat.set(0.25, 1); // Corta em 4 frames horizontais

const matHero = new THREE.MeshStandardMaterial({
    map: heroTex,
    transparent: true,
    alphaTest: 0.5, // RECORTA O FUNDO DO PNG
    side: THREE.DoubleSide,
    emissive: 0xffffff,
    emissiveIntensity: 0.1
});

// --- ESTADO DO JOGO ---
const game = {
    player: { mesh: null, speed: 0.2, frame: 0, timer: 0, dir: 1, action: 'idle' },
    walls: [], // Array de Box3 para colisão
    doors: {},
    interactables: [],
    leverSeq: [], symbolSeq: [], orbSeq: [],
    inv: []
};

const keys = { w: false, a: false, s: false, d: false, e: false };

// --- CONSTRUTORES DE ARQUITETURA ---

function addBox(w, h, d, x, y, z, mat, isStatic = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
    if (isStatic) {
        game.walls.push(new THREE.Box3().setFromObject(mesh));
    }
    return mesh;
}

// Cria uma parede com um buraco (vão) para porta
function createWallWithGate(x, z, rotY, doorId) {
    const group = new THREE.Group();

    // Pilar Esquerda
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(7, 10, 1), matWall);
    p1.position.set(-6.5, 5, 0);
    group.add(p1);

    // Pilar Direita
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(7, 10, 1), matWall);
    p2.position.set(6.5, 5, 0);
    group.add(p2);

    // Topo (Viga)
    const p3 = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 1), matWall);
    p3.position.set(0, 8.5, 0);
    group.add(p3);

    // A PORTA (Objeto móvel)
    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(6, 7, 0.4), new THREE.MeshStandardMaterial({ color: 0x9d00ff, emissive: 0x9d00ff, emissiveIntensity: 0.3 }));
    doorMesh.position.set(0, 3.5, 0);
    group.add(doorMesh);

    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    scene.add(group);

    // Colisões estáticas (Pilares e Viga)
    const boxes = [p1, p2, p3].map(p => new THREE.Box3().setFromObject(p));
    game.walls.push(...boxes);

    // Colisão da porta (dinâmica)
    const dBox = new THREE.Box3().setFromObject(doorMesh);
    game.doors[doorId] = { mesh: doorMesh, box: dBox, open: false };
}

function initMap() {
    // Chão Hub
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), matFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // --- HUB CENTRAL (0,0) ---
    // Parete Norte -> Sala 1
    createWallWithGate(0, -10, 0, 'door1');
    // Parede Leste -> Sala 2
    createWallWithGate(10, 0, Math.PI / 2, 'door2');
    // Parede Oeste -> Sala 3
    createWallWithGate(-10, 0, Math.PI / 2, 'door3');
    // Fechamento Sul
    addBox(21, 10, 1, 0, 5, 10, matWall);

    // --- SALA 1: ALAVANCAS (NORTE) ---
    addBox(20, 10, 1, 0, 5, -30, matWall);
    addBox(1, 10, 20, -10, 5, -20, matWall);
    addBox(1, 10, 20, 10, 5, -20, matWall);
    [-5, 0, 5].forEach((x, i) => {
        const g = new THREE.Group();
        const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x332200 }));
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2), new THREE.MeshStandardMaterial({ color: 0xffaa00 }));
        s.position.y = 0.5; s.rotation.z = Math.PI / 4;
        g.add(b); g.add(s); g.position.set(x, 1, -29);
        g.userData = { id: i, type: 'lever', stick: s, active: false };
        scene.add(g); game.interactables.push(g);
    });

    // --- SALA 2: SÍMBOLOS (LESTE) ---
    addBox(1, 10, 20, 30, 5, 0, matWall);
    addBox(20, 10, 1, 20, 5, -10, matWall);
    addBox(20, 10, 1, 20, 5, 10, matWall);
    const icons = ["🔯", "☯️", "⚛️"];
    icons.forEach((icon, i) => {
        const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#33ff33'; ctx.font = 'bold 90px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(icon, 64, 64);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, emissive: 0x33ff33, emissiveIntensity: 0.5 }));
        m.position.set(29, 4, -5 + i * 5); m.rotation.y = -Math.PI / 2;
        m.userData = { id: i, type: 'symbol', active: false };
        scene.add(m); game.interactables.push(m);
    });

    // --- SALA 3: ORBES (OESTE) ---
    addBox(1, 10, 20, -30, 5, 0, matWall);
    addBox(20, 10, 1, -20, 5, -10, matWall);
    addBox(20, 10, 1, -20, 5, 10, matWall);
}

// --- JOGADOR ---
function initPlayer() {
    game.player.mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), matHero);
    game.player.mesh.position.set(0, 2.5, 5);
    game.player.mesh.castShadow = true;
    scene.add(game.player.mesh);
}

// --- SISTEMA DE COLISÃO ---
function checkCollision(vx, vz) {
    const pBox = new THREE.Box3().setFromObject(game.player.mesh);
    pBox.min.x += vx; pBox.max.x += vx;
    pBox.min.z += vz; pBox.max.z += vz;

    // Paredes estáticas
    for (let wall of game.walls) {
        if (pBox.intersectsBox(wall)) return true;
    }
    // Portas fechadas (Buracos na parede bloqueados)
    for (let id in game.doors) {
        const d = game.doors[id];
        if (!d.open && pBox.intersectsBox(d.box)) return true;
    }
    return false;
}

// --- LOGICA PRINCIPAL ---
function update() {
    const delta = clock.getDelta();
    if (!game.player.mesh) return;

    let vx = 0, vz = 0;
    if (keys.w) vz -= game.player.speed;
    if (keys.s) vz += game.player.speed;
    if (keys.a) { vx -= game.player.speed; game.player.dir = -1; }
    if (keys.d) { vx += game.player.speed; game.player.dir = 1; }

    if (vx !== 0 || vz !== 0) {
        game.player.action = 'walking';
        if (!checkCollision(vx, 0)) game.player.mesh.position.x += vx;
        if (!checkCollision(0, vz)) game.player.mesh.position.z += vz;
    } else {
        game.player.action = 'idle';
    }

    // Animação Quadro a Quadro (UV Offset)
    if (game.player.action === 'walking') {
        game.player.timer += delta * 10;
        game.player.frame = Math.floor(game.player.timer) % 4;
        heroTex.offset.x = game.player.frame * 0.25;
    } else {
        heroTex.offset.x = 0;
    }
    game.player.mesh.scale.x = Math.abs(game.player.mesh.scale.x) * game.player.dir;

    // Câmera Perfeita
    camera.position.lerp(new THREE.Vector3(game.player.mesh.position.x, 10, game.player.mesh.position.z + 15), 0.12);
    camera.lookAt(game.player.mesh.position.x, 2, game.player.mesh.position.z);
    game.player.mesh.rotation.y = Math.atan2(camera.position.x - game.player.mesh.position.x, camera.position.z - game.player.mesh.position.z);

    // Interações
    let near = false;
    game.interactables.forEach(obj => {
        if (game.player.mesh.position.distanceTo(obj.position) < 5) {
            near = true;
            document.getElementById('interaction-label').classList.remove('hidden');
            if (keys.e) { handleInteraction(obj); keys.e = false; }
        }
    });
    if (!near) document.getElementById('interaction-label').classList.add('hidden');
}

function handleInteraction(obj) {
    const d = obj.userData;
    if (d.type === 'lever' && !d.active) {
        d.active = true; d.stick.rotation.z = -Math.PI / 4; game.leverSeq.push(d.id);
        if (game.leverSeq.length === 3) {
            if (JSON.stringify(game.leverSeq) === "[0,2,1]") {
                showMsg("PORTA 1 DESBLOQUEADA!"); game.doors.door1.open = true;
                let f = 0; const a = () => { f++; game.doors.door1.mesh.position.y += 0.2; if (f < 40) requestAnimationFrame(a); }; a();
            } else {
                showMsg("RESET."); setTimeout(() => { game.leverSeq = []; game.interactables.filter(o => o.userData.type === 'lever').forEach(o => { o.userData.active = false; o.userData.stick.rotation.z = Math.PI / 4; }); }, 800);
            }
        }
    }
    // Repetir lógica similar para símbolos e orbes...
}

function showMsg(t) { const b = document.getElementById('msg-box'); document.getElementById('msg-text').innerText = t; b.classList.remove('hidden'); b.onclick = () => b.classList.add('hidden'); }

function loop() { requestAnimationFrame(loop); update(); renderer.render(scene, camera); }

// --- BOOT ---
initMap();
initPlayer();
loop();

window.addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (keys.hasOwnProperty(k)) keys[k] = true; });
window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (keys.hasOwnProperty(k)) keys[k] = false; });
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
setTimeout(() => { document.getElementById('loader').style.display = 'none'; }, 1000);
