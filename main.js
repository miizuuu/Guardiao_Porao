import * as THREE from 'three';

/**
 * O GUARDIÃO DO PORÃO - VERSÃO BLINDADA (ESTÁVEL)
 * ---------------------------------------------
 * [FIX] Caminhos de assets compatíveis com Vite/GitHub Pages.
 * [FIX] Colisão deslizante por eixo.
 * [FEAT] Recorte de fundo PNG agressivo.
 */

// --- CONFIGURAÇÃO INICIAL ---
const clock = new THREE.Clock();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0510);
scene.fog = new THREE.Fog(0x0a0510, 5, 60);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 10, 20);

const renderer = new THREE.WebGLRenderer({
    canvas: document.querySelector('#bg'),
    antialias: true,
    alpha: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// --- ILUMINAÇÃO RECALIBRADA ---
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const mainLight = new THREE.PointLight(0xffaa00, 30, 60);
mainLight.position.set(0, 10, 0);
mainLight.castShadow = true;
scene.add(mainLight);

// --- GERENCIADOR DE ASSETS ---
const texLoader = new THREE.TextureLoader();
// Tenta detectar se está no Vite ou local
const assetsBase = window.location.href.includes('localhost') || window.location.href.includes('127.0.0.1') ? './public/assets/' : './assets/';

const loadTexture = (file, rx = 1, ry = 1) => {
    const t = texLoader.load(assetsBase + file,
        () => console.log('Carregado: ' + file),
        undefined,
        () => console.warn('Falha ao carregar: ' + file + '. Usando cor sólida.')
    );
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    return t;
};

const matFloor = new THREE.MeshStandardMaterial({ map: loadTexture('floor.png', 15, 15), color: 0x887766 });
const matWall = new THREE.MeshStandardMaterial({ map: loadTexture('wall.png', 1, 1), color: 0x554433 });

// Sprite do Herói (Recorte de Fundo e Animação)
const heroTex = texLoader.load(assetsBase + 'hero.png');
heroTex.magFilter = THREE.NearestFilter;
heroTex.repeat.set(0.25, 1);

const matHero = new THREE.MeshStandardMaterial({
    map: heroTex,
    transparent: true,
    alphaTest: 0.4, // Elimina transparência 'suja'
    side: THREE.DoubleSide,
    emissive: 0xffffff,
    emissiveIntensity: 0.12
});

// --- ESTADO DO JOGO ---
const game = {
    player: { mesh: null, speed: 0.18, frame: 0, timer: 0, dir: 1, moving: false },
    walls: [],
    doors: {},
    interactables: [],
    leverSeq: [], symbolSeq: [], orbSeq: [],
    input: { w: false, a: false, s: false, d: false, e: false }
};

// --- FERRAMENTAS DE CONSTRUÇÃO ---

function addBox(w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    game.walls.push(box);
    return mesh;
}

function createOpening(x, z, rotY, doorId, doorCol) {
    const g = new THREE.Group();
    // Paredes ao redor do buraco
    const l = new THREE.Mesh(new THREE.BoxGeometry(7, 10, 1), matWall); l.position.set(-6.5, 5, 0);
    const r = new THREE.Mesh(new THREE.BoxGeometry(7, 10, 1), matWall); r.position.set(6.5, 5, 0);
    const t = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 1), matWall); t.position.set(0, 8.5, 0);
    const dM = new THREE.Mesh(new THREE.BoxGeometry(6, 7.2, 0.4), new THREE.MeshStandardMaterial({ color: doorCol, emissive: doorCol, emissiveIntensity: 0.4 }));
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
    // Chão Hub
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), matFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // --- HUB (CENTRO) ---
    createOpening(0, -10, 0, 'door1', 0x9d00ff);      // Norte -> Alavancas
    createOpening(12, 0, Math.PI / 2, 'door2', 0x00ffcc);  // Leste -> Símbolos
    createOpening(-12, 0, Math.PI / 2, 'door3', 0xffcc00); // Oeste -> Orbes
    addBox(24, 10, 1, 0, 5, 12, matWall); // Muralha Sul

    // --- SALA 1 (ALAVANCAS) ---
    addBox(20, 10, 1, 0, 5, -30, matWall);
    addBox(1, 10, 20, -10, 5, -20, matWall);
    addBox(1, 10, 20, 10, 5, -20, matWall);
    [-5, 0, 5].forEach((x, i) => {
        const group = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.5), new THREE.MeshStandardMaterial({ color: 0x332200 }));
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5), new THREE.MeshStandardMaterial({ color: 0xffaa00 }));
        stick.position.y = 0.5; stick.rotation.z = Math.PI / 4;
        group.add(base, stick); group.position.set(x, 1, -29);
        group.userData = { id: i, type: 'lever', stick: stick, active: false };
        scene.add(group); game.interactables.push(group);
    });
}

function initPlayer() {
    game.player.mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 5.5), matHero);
    game.player.mesh.position.set(0, 2.7, 5);
    scene.add(game.player.mesh);
}

// --- COLISÃO DESLIZANTE ---
function canMove(vx, vz) {
    const pB = new THREE.Box3().setFromObject(game.player.mesh);
    pB.expandByScalar(-0.4); // Torna o player um pouco menor para colisão mais fluida
    pB.min.x += vx; pB.max.x += vx;
    pB.min.z += vz; pB.max.z += vz;

    for (let w of game.walls) if (pB.intersectsBox(w)) return false;
    for (let id in game.doors) if (!game.doors[id].open && pB.intersectsBox(game.doors[id].box)) return false;
    return true;
}

function update() {
    const dt = clock.getDelta();
    const p = game.player;
    if (!p.mesh) return;

    let moveX = 0, moveZ = 0;
    if (game.input.w) moveZ -= p.speed;
    if (game.input.s) moveZ += p.speed;
    if (game.input.a) { moveX -= p.speed; p.dir = -1; }
    if (game.input.d) { moveX += p.speed; p.dir = 1; }

    if (moveX !== 0 || moveZ !== 0) {
        // Testa eixos separadamente para DESLIZAR na parede
        if (canMove(moveX, 0)) p.mesh.position.x += moveX;
        if (canMove(0, moveZ)) p.mesh.position.z += moveZ;

        p.timer += dt * 10;
        p.frame = Math.floor(p.timer) % 4;
        heroTex.offset.x = p.frame * 0.25;
    } else {
        heroTex.offset.x = 0;
    }
    p.mesh.scale.x = Math.abs(p.mesh.scale.x) * p.dir;

    // Câmera persegue suavemente
    const targetX = Math.max(-8, Math.min(8, p.mesh.position.x));
    camera.position.lerp(new THREE.Vector3(targetX, 10, p.mesh.position.z + 14), 0.1);
    camera.lookAt(p.mesh.position.x, 2, p.mesh.position.z);
    p.mesh.rotation.y = Math.atan2(camera.position.x - p.mesh.position.x, camera.position.z - p.mesh.position.z);

    // Prompt de Interação
    let near = false;
    for (let obj of game.interactables) {
        if (p.mesh.position.distanceTo(new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld)) < 5) {
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
                const a = () => { game.doors.door1.mesh.position.y += 0.2; if (game.doors.door1.mesh.position.y < 11) requestAnimationFrame(a); }; a();
            } else {
                showMsg("ORDEM INCORRETA. RESET."); setTimeout(() => { game.leverSeq = []; game.interactables.forEach(o => { if (o.userData.type === 'lever') { o.userData.active = false; o.userData.stick.rotation.z = Math.PI / 4; } }); }, 800);
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

const animate = () => {
    requestAnimationFrame(animate);
    update();
    renderer.render(scene, camera);
};

// --- CONTROLES ---
window.addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (game.input.hasOwnProperty(k)) game.input[k] = true; });
window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (game.input.hasOwnProperty(k)) game.input[k] = false; });
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

// BOOT
initMap();
initPlayer();
animate();
// Remove o loader garantindo que o JS rodou
setTimeout(() => { document.getElementById('loader').style.display = 'none'; }, 1000);
