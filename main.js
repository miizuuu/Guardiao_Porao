import * as THREE from 'three';

/**
 * O GUARDIÃO DO PORÃO - VERSÃO SUPREMA (BRILHANTE E FUNCIONAL)
 * Foco: Luz Estilo Arcade, Colisões Lerdas e Progressão Real.
 */

// --- ENGINE SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222233); // Fundo azulado claro
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// --- ILUMINAÇÃO (SOLUÇÃO PARA A ESCURIDÃO) ---
// Luz que vem de cima e de baixo, garante que NADA fique preto
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444466, 1.2);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
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

// Materiais Estáveis
const floorMat = new THREE.MeshStandardMaterial({ map: load('floor.png', 10, 10), color: 0xcccccc });
const wallMat = new THREE.MeshStandardMaterial({ map: load('wall.png', 4, 1), color: 0xeeeeee });
const heroMat = new THREE.MeshStandardMaterial({
    map: texLoader.load(assets + 'hero.png'),
    transparent: true,
    alphaTest: 0.5, // Remove o fundo do PNG agressivamente
    emissive: 0xffffff,
    emissiveIntensity: 0.2 // Herói brilha levemente para visibilidade
});

// --- ESTADO ---
const game = {
    player: { mesh: null, radius: 1.0, speed: 0.2 },
    walls: [], // Array de {x, z, r} para colisões cilíndricas simples
    interactables: [],
    leverSeq: [],
    symbolSeq: [],
    orbSeq: [],
    room2: false,
    room3: false,
    boss: false,
    inv: []
};

const keys = { w: false, a: false, s: false, d: false, e: false };

// --- CONSTRUTORES ---

function addWall(x, z, w, d) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 8, d), wallMat);
    mesh.position.set(x, 4, z);
    scene.add(mesh);
    // Adiciona limites para colisão (simplificado)
    game.walls.push({ x, z, w: w / 2 + 0.8, d: d / 2 + 0.8, active: true });
    return mesh;
}

function createHub() {
    // Chão
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Paredes Sala 1
    addWall(0, -12, 24, 1); // Norte
    addWall(-12, 5, 1, 34); // Oeste
    addWall(12, 5, 1, 34);  // Leste

    // Puzzle 1: Alavancas
    for (let i = 0; i < 3; i++) {
        const g = new THREE.Group();
        const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x333333 }));
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2), new THREE.MeshStandardMaterial({ color: 0xffcc00 }));
        s.position.y = 0.5; s.rotation.z = Math.PI / 4;
        g.add(b); g.add(s);
        g.position.set(-6 + i * 6, 1, -11);
        g.userData = { id: i, type: 'lever', stick: s, active: false };
        scene.add(g);
        game.interactables.push(g);
    }

    // Porta 1
    const dG = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(4, 7, 0.5), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffdd00, emissiveIntensity: 0.2 }));
    leaf.position.x = 2;
    dG.add(leaf);
    dG.position.set(11.5, 0, -4);
    dG.rotation.y = Math.PI / 2;
    scene.add(dG);

    // Colisão especial da porta
    const doorWall = { x: 11.5, z: -4, w: 0.5, d: 2.5, active: true, name: 'door1' };
    game.walls.push(doorWall);
    game.door1 = { g: dG, leaf, wall: doorWall };
}

function createRoom2() {
    if (game.room2) return; game.room2 = true;

    // Expansão do Cenário
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(30, 0, -4);
    scene.add(floor);

    addWall(30, -19, 30, 1); // Norte
    addWall(30, 11, 30, 1);  // Sul
    addWall(45, -4, 1, 30);  // Leste

    // Símbolos Gigantes
    const chars = ["🔯", "☯️", "⚛️"];
    chars.forEach((c, i) => {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white'; ctx.font = 'bold 90px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(c, 64, 64);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, emissive: 0x00d4ff }));
        m.position.set(22 + i * 8, 4, -18.2);
        m.userData = { id: i, type: 'symbol', active: false };
        scene.add(m);
        game.interactables.push(m);
    });

    // Porta 2 (Para Sala 3)
    const door2 = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(5, 7, 0.5), new THREE.MeshStandardMaterial({ color: 0x00d4ff, emissive: 0x00d4ff, emissiveIntensity: 0.3 }));
    leaf.position.x = 2.5; door2.add(leaf);
    door2.position.set(30, 0, 10.5);
    scene.add(door2);
    const wall = { x: 30, z: 10.5, w: 3, d: 0.5, active: true, name: 'door2' };
    game.walls.push(wall);
    game.door2 = { g: door2, leaf, wall };
}

function createRoom3() {
    if (game.room3) return; game.room3 = true;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 40), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(30, 0, 45);
    scene.add(floor);

    addWall(30, 65, 30, 1); // Sul
    addWall(15, 45, 1, 40); // Oeste
    addWall(45, 45, 1, 40); // Leste

    // Orbes
    [0xff0000, 0x00ff00, 0x0000ff].forEach((col, i) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1.2), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1 }));
        m.position.set(22 + i * 8, 2.5, 55);
        m.userData = { id: i, type: 'orb', active: false };
        scene.add(m);
        game.interactables.push(m);
    });
}

// --- JOGADOR E CONTROLES ---

function initPlayer() {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 4.5), heroMat);
    mesh.position.set(0, 2.2, 5);
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

function update() {
    if (!game.player.mesh) return;
    const p = game.player;

    // Movimento com detecção de colisão antecipada
    let nextX = p.mesh.position.x;
    let nextZ = p.mesh.position.z;

    if (keys.w) nextZ -= p.speed;
    if (keys.s) nextZ += p.speed;
    if (keys.a) nextX -= p.speed;
    if (keys.d) nextX += p.speed;

    if (!checkCollision(nextX, p.mesh.position.z)) p.mesh.position.x = nextX;
    if (!checkCollision(p.mesh.position.x, nextZ)) p.mesh.position.z = nextZ;

    // Billboard
    p.mesh.rotation.y = Math.atan2(camera.position.x - p.mesh.position.x, camera.position.z - p.mesh.position.z);

    // Câmera Perseguição Suave
    camera.position.lerp(new THREE.Vector3(p.mesh.position.x, 12, p.mesh.position.z + 18), 0.1);
    camera.lookAt(p.mesh.position.x, 2, p.mesh.position.z);

    // Interações
    let near = false;
    game.interactables.forEach(obj => {
        const dist = p.mesh.position.distanceTo(obj.position);
        if (dist < 4) {
            near = true;
            document.getElementById('interaction-label').classList.remove('hidden');
            if (keys.e) {
                handleInteraction(obj);
                keys.e = false;
            }
        }
    });
    if (!near) document.getElementById('interaction-label').classList.add('hidden');
}

function handleInteraction(obj) {
    const d = obj.userData;
    if (d.type === 'lever' && !d.active) {
        d.active = true; d.stick.rotation.z = -Math.PI / 4;
        game.leverSeq.push(d.id);
        if (game.leverSeq.length === 3) {
            if (JSON.stringify(game.leverSeq) === "[0,2,1]") {
                showMsg("PORTA DO CORREDOR ABERTA! (Faca Obtida)");
                game.door1.wall.active = false;
                addToInv("Faca Curta", "slot-1");
                let f = 0; const a = () => { f++; game.door1.leaf.position.x += 0.1; if (f < 40) requestAnimationFrame(a); }; a();
                createRoom2();
            } else {
                showMsg("RESETANDO ALAVANCAS...");
                setTimeout(() => { game.leverSeq = []; game.interactables.filter(o => o.userData.type === 'lever').forEach(o => { o.userData.active = false; o.userData.stick.rotation.z = Math.PI / 4; }); }, 800);
            }
        }
    }

    if (d.type === 'symbol' && !d.active) {
        d.active = true; obj.material.emissiveIntensity = 2;
        game.symbolSeq.push(d.id);
        if (game.symbolSeq.length === 3) {
            if (JSON.stringify(game.symbolSeq) === "[2,0,1]") {
                showMsg("CAMINHO DO SUL LIBERADO! (Pistola Obtida)");
                game.door2.wall.active = false;
                addToInv("Pistola Velha", "slot-2");
                let f = 0; const a = () => { f++; game.door2.leaf.position.x += 0.12; if (f < 40) requestAnimationFrame(a); }; a();
                createRoom3();
            } else {
                showMsg("SÍMBOLOS RESETADOS.");
                setTimeout(() => { game.symbolSeq = []; game.interactables.filter(o => o.userData.type === 'symbol').forEach(o => { o.userData.active = false; o.material.emissiveIntensity = 1; }); }, 1000);
            }
        }
    }

    if (d.type === 'orb' && !d.active) {
        d.active = true; obj.material.emissiveIntensity = 5;
        game.orbSeq.push(d.id);
        if (game.orbSeq.length === 3) {
            if (JSON.stringify(game.orbSeq) === "[1,0,2]") {
                showMsg("ALTAR FINAL ATIVADO! (Cetro Obtido)");
                addToInv("Cetro Rúnico", "slot-3");
            } else {
                showMsg("ORBES RESETADAS.");
                setTimeout(() => { game.orbSeq = []; game.interactables.filter(o => o.userData.type === 'orb').forEach(o => { o.userData.active = false; o.material.emissiveIntensity = 1; }); }, 1000);
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
    let p = 0; const i = setInterval(() => { p += 5; document.getElementById('progress-fill').style.width = p + '%'; if (p >= 100) { clearInterval(i); document.getElementById('loader').style.display = 'none'; } }, 50);
};
window.onresize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
