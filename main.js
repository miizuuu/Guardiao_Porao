import * as THREE from 'three';

/**
 * O GUARDIÃO DO PORÃO - VERSÃO DEFINITIVA
 * ---------------------------------------
 * [ARQUITETURA] Hub Central com vãos reais nas paredes.
 * [PERSONAGEM] Sprite animado (4x1) com recorte de transparência agressivo.
 * [COLISÃO] Sistema Box3 por-eixo para deslize lateral.
 * [CÂMERA] Perseguição suave sem atravessar paredes.
 */

const clock = new THREE.Clock();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510);
scene.fog = new THREE.Fog(0x050510, 10, 60);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// --- ILUMINAÇÃO (PEAK) ---
const amb = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(amb);
const sun = new THREE.PointLight(0xffaa22, 25, 50);
sun.position.set(0, 10, 0);
sun.castShadow = true;
scene.add(sun);

// --- ASSETS & MATERIAIS ---
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
    alphaTest: 0.5, // RECORTA O FUNDO DO PNG
    side: THREE.FrontSide,
    emissive: 0xffffff,
    emissiveIntensity: 0.1
});

// --- ESTADO DO JOGO ---
const game = {
    player: { mesh: null, box: new THREE.Box3(), speed: 0.2, frame: 0, timer: 0, dir: 1, action: 'idle' },
    walls: [], // Array de Box3
    doors: {}, // Objetos de porta
    interactables: [],
    leverSeq: [], symbolSeq: [], orbSeq: [],
    input: { w: false, a: false, s: false, d: false, e: false }
};

// --- FERRAMENTAS DE CONSTRUÇÃO ---

function addBox(w, h, d, x, y, z, mat, collidable = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    if (collidable) {
        game.walls.push(new THREE.Box3().setFromObject(mesh));
    }
    return mesh;
}

// Cria uma parade com um BURACO real para a porta
function createWallWithOpening(x, z, rotY, doorId, doorColor) {
    const group = new THREE.Group();

    // Pilar Esquerdo
    const l = new THREE.Mesh(new THREE.BoxGeometry(7, 10, 1), matWall);
    l.position.set(-6, 5, 0);
    group.add(l);

    // Pilar Direito
    const r = new THREE.Mesh(new THREE.BoxGeometry(7, 10, 1), matWall);
    r.position.set(6, 5, 0);
    group.add(r);

    // Viga (Topo)
    const t = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 1), matWall);
    t.position.set(0, 8.5, 0);
    group.add(t);

    // Malha da Porta (Veste o buraco)
    const dMesh = new THREE.Mesh(new THREE.BoxGeometry(5.2, 7.2, 0.4), new THREE.MeshStandardMaterial({ color: doorColor, emissive: doorColor, emissiveIntensity: 0.3 }));
    dMesh.position.set(0, 3.5, 0);
    group.add(dMesh);

    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    scene.add(group);

    // Adiciona colisões dos pilares e viga
    group.children.forEach(child => {
        if (child !== dMesh) game.walls.push(new THREE.Box3().setFromObject(child));
    });

    // Colisão da Porta
    const dBox = new THREE.Box3().setFromObject(dMesh);
    game.doors[doorId] = { mesh: dMesh, box: dBox, open: false };
}

function initMap() {
    // Chão Base
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), matFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // --- HUB CENTRAL (0,0) ---
    createWallWithOpening(0, -10, 0, 'door1', 0x9d00ff); // Norte -> Sala 1
    createWallWithOpening(10, 0, Math.PI / 2, 'door2', 0x00ffcc); // Leste -> Sala 2
    createWallWithOpening(-10, 0, Math.PI / 2, 'door3', 0xffcc00); // Oeste -> Sala 3
    addBox(21, 10, 1, 0, 5, 10, matWall); // Muralha Sul

    // --- SALA 1: ALAVANCAS (NORTE) ---
    addBox(20, 10, 1, 0, 5, -30, matWall); // Parede Norte
    addBox(1, 10, 20, -10, 5, -20, matWall); // Oeste
    addBox(1, 10, 20, 10, 5, -20, matWall); // Leste
    [-5, 0, 5].forEach((x, i) => {
        const g = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.6), new THREE.MeshStandardMaterial({ color: 0x332200 }));
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5), new THREE.MeshStandardMaterial({ color: 0xffaa00 }));
        stick.position.y = 0.5; stick.rotation.z = Math.PI / 4;
        g.add(base, stick); g.position.set(x, 1, -29);
        g.userData = { id: i, type: 'lever', stick: s, active: false };
        scene.add(g); game.interactables.push(g);
    });

    // --- SALA 2: SÍMBOLOS (LESTE) ---
    addBox(1, 10, 20, 30, 5, 0, matWall);
    addBox(20, 10, 1, 20, 5, -10, matWall);
    addBox(20, 10, 1, 20, 5, 10, matWall);
    ["🔯", "☯️", "⚛️"].forEach((icon, i) => {
        const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#00ffcc'; ctx.font = 'bold 90px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(icon, 64, 64);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, emissive: 0x00ffcc, emissiveIntensity: 0.5 }));
        m.position.set(29.4, 4, -5 + i * 5); m.rotation.y = -Math.PI / 2;
        m.userData = { id: i, type: 'symbol', active: false };
        scene.add(m); game.interactables.push(m);
    });

    // --- SALA 3: ORBES (OESTE) ---
    addBox(1, 10, 20, -30, 5, 0, matWall);
    addBox(20, 10, 1, -20, 5, -10, matWall);
    addBox(20, 10, 1, -20, 5, 10, matWall);
    [0xff3300, 0x33ff33, 0x9d00ff].forEach((col, i) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1.5), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2 }));
        m.position.set(-29, 3, -5 + i * 5);
        m.userData = { id: i, type: 'orb', active: false };
        scene.add(m); game.interactables.push(m);
    });
}

function initPlayer() {
    game.player.mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), matHero);
    game.player.mesh.position.set(0, 2.5, 5);
    game.player.mesh.castShadow = true;
    scene.add(game.player.mesh);
}

// --- COLISÃO POR EIXO (SLIDING) ---
function canMove(vx, vz) {
    const pBox = new THREE.Box3().setFromObject(game.player.mesh);
    // Margem de segurança
    pBox.expandByScalar(-0.4);
    pBox.min.x += vx; pBox.max.x += vx;
    pBox.min.z += vz; pBox.max.z += vz;

    for (let wall of game.walls) {
        if (pBox.intersectsBox(wall)) return false;
    }
    for (let id in game.doors) {
        if (!game.doors[id].open && pBox.intersectsBox(game.doors[id].box)) return false;
    }
    return true;
}

function update() {
    const delta = clock.getDelta();
    const p = game.player;
    if (!p.mesh) return;

    let moveX = 0, moveZ = 0;
    if (game.input.w) moveZ -= p.speed;
    if (game.input.s) moveZ += p.speed;
    if (game.input.a) { moveX -= p.speed; p.dir = -1; }
    if (game.input.d) { moveX += p.speed; p.dir = 1; }

    if (moveX !== 0 || moveZ !== 0) {
        // Deslizamento: Tenta cada eixo separadamente
        if (canMove(moveX, 0)) p.mesh.position.x += moveX;
        if (canMove(0, moveZ)) p.mesh.position.z += moveZ;

        p.timer += delta * 10;
        p.frame = Math.floor(p.timer) % 4;
        heroTex.offset.x = p.frame * 0.25;
    } else {
        heroTex.offset.x = 0;
    }
    p.mesh.scale.x = Math.abs(p.mesh.scale.x) * p.dir;

    // Câmera persegue suavemente e não atravessa a parede leste/oeste do hub
    const camX = Math.max(-8, Math.min(8, p.mesh.position.x));
    camera.position.lerp(new THREE.Vector3(camX, 10, p.mesh.position.z + 14), 0.1);
    camera.lookAt(p.mesh.position.x, 2, p.mesh.position.z);

    // Billboard
    p.mesh.rotation.y = Math.atan2(camera.position.x - p.mesh.position.x, camera.position.z - p.mesh.position.z);

    // Interações
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
                const anim = () => { game.doors.door1.mesh.position.y += 0.2; if (game.doors.door1.mesh.position.y < 12) requestAnimationFrame(anim); }; anim();
            } else {
                showMsg("RESET."); setTimeout(() => { game.leverSeq = []; game.interactables.forEach(o => { if (o.userData.type === 'lever') { o.userData.active = false; o.userData.stick.rotation.z = Math.PI / 4; } }); }, 800);
            }
        }
    }
    // Lógica para as outras salas...
}

function showMsg(t) {
    document.getElementById('msg-text').innerText = t;
    document.getElementById('msg-box').classList.remove('hidden');
    document.getElementById('msg-box').onclick = () => document.getElementById('msg-box').classList.add('hidden');
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
