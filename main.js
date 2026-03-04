import * as THREE from 'three';

// --- CONFIGURAÇÃO ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0c);
scene.fog = new THREE.Fog(0x0a0a0c, 5, 25);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// --- ASSETS (Caminhos Corrigidos) ---
const textureLoader = new THREE.TextureLoader();
const assetsPath = './public/assets/';

function loadT(file, rx = 1, ry = 1) {
    const t = textureLoader.load(assetsPath + file, undefined, undefined, () => console.warn("Erro: " + file));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    return t;
}

const floorT = loadT('floor.png', 8, 8);
const wallT = loadT('wall.png', 4, 1);
const heroT = textureLoader.load(assetsPath + 'hero.png');

// --- MATERIAIS ---
const floorMat = new THREE.MeshStandardMaterial({ map: floorT, color: 0x444444 });
const wallMat = new THREE.MeshStandardMaterial({ map: wallT, color: 0x666666 });
const heroMat = new THREE.MeshStandardMaterial({ map: heroT, transparent: true, alphaTest: 0.5 });

// --- LUZES ---
const amb = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(amb);
const torch = new THREE.PointLight(0xffaa44, 15, 15);
torch.castShadow = true;
scene.add(torch);

// --- ESTADO ---
const player = { mesh: null, speed: 0.12, inv: [] };
const keys = { w: false, a: false, s: false, d: false, e: false };
const levers = [];
let leverSeq = [];
const correctLever = [0, 2, 1];
const symbols = [];
let symbolSeq = [];
const correctSymbol = [2, 0, 1];
let door = null;

// --- OBJETOS ---
function init() {
    // Sala 1
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 30), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = 2.5;
    floor.receiveShadow = true;
    scene.add(floor);

    const wN = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 1), wallMat);
    wN.position.set(0, 5, -10);
    scene.add(wN);

    const wW = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 30), wallMat);
    wW.position.set(-10, 5, 2.5);
    scene.add(wW);

    const wE = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 30), wallMat);
    wE.position.set(10, 5, 2.5);
    scene.add(wE);

    // Alavancas
    [-4, 0, 4].forEach((x, i) => {
        const g = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, 0.4), new THREE.MeshStandardMaterial({ color: 0x222222 }));
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8), new THREE.MeshStandardMaterial({ color: 0x777777 }));
        stick.position.y = 0.4;
        stick.rotation.z = Math.PI / 4;
        g.add(base); g.add(stick);
        g.position.set(x, 1, -9.3);
        g.userData = { id: i, active: false, stick: stick };
        scene.add(g);
        levers.push(g);
    });

    // Porta
    const dG = new THREE.Group();
    const dL = new THREE.Mesh(new THREE.BoxGeometry(3, 5, 0.2), new THREE.MeshStandardMaterial({ color: 0x442200 }));
    dL.position.set(1.5, 2.5, 0);
    dG.add(dL);
    dG.position.set(9.4, 0, -5);
    dG.rotation.y = Math.PI / 2;
    scene.add(dG);
    door = { mesh: dG, leaf: dL, open: false };

    // Sala 2 (Pré-construída mas fora de vista)
    const floor2 = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), floorMat);
    floor2.rotation.x = -Math.PI / 2;
    floor2.position.set(20, 0, -5);
    scene.add(floor2);

    const wN2 = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 1), wallMat);
    wN2.position.set(20, 5, -15);
    scene.add(wN2);

    // Símbolos
    [15, 20, 25].forEach((x, i) => {
        const char = ["🔯", "☯️", "⚛️"][i];
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white'; ctx.font = '80px Arial';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(char, 64, 64);
        const tex = new THREE.CanvasTexture(canvas);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, emissive: 0x333333 }));
        mesh.position.set(x, 4, -14.4);
        mesh.userData = { id: i, active: false };
        scene.add(mesh);
        symbols.push(mesh);
    });

    // Player
    player.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), heroMat);
    player.mesh.position.y = 1.2;
    player.mesh.castShadow = true;
    scene.add(player.mesh);
}

// --- LOGICA ---
window.addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (keys.hasOwnProperty(k)) keys[k] = true; });
window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (keys.hasOwnProperty(k)) keys[k] = false; });

function loop() {
    requestAnimationFrame(loop);
    if (!player.mesh) return;

    const prev = player.mesh.position.clone();
    if (keys.w) player.mesh.position.z -= player.speed;
    if (keys.s) player.mesh.position.z += player.speed;
    if (keys.a) player.mesh.position.x -= player.speed;
    if (keys.d) player.mesh.position.x += player.speed;

    // Colisão Porta
    if (!door.open && player.mesh.position.x > 8.5 && Math.abs(player.mesh.position.z + 5) < 2) player.mesh.position.x = prev.x;

    // Limites
    const limitX = door.open ? 29 : 9;
    if (player.mesh.position.x < -9 || player.mesh.position.x > limitX) player.mesh.position.x = prev.x;
    if (player.mesh.position.z < -9 || player.mesh.position.z > 16) player.mesh.position.z = prev.z;

    // Câmera e Luz
    camera.position.lerp(new THREE.Vector3(player.mesh.position.x, 8, player.mesh.position.z + 12), 0.1);
    camera.lookAt(player.mesh.position.x, 2, player.mesh.position.z);
    torch.position.set(player.mesh.position.x, 2.5, player.mesh.position.z + 0.5);
    player.mesh.rotation.y = Math.atan2(camera.position.x - player.mesh.position.x, camera.position.z - player.mesh.position.z);

    // Interações
    let near = false;
    levers.forEach(l => {
        if (player.mesh.position.distanceTo(l.position) < 2) {
            near = true; showP("Pressione [E] - Alavanca");
            if (keys.e && !l.userData.active) {
                l.userData.active = true;
                l.userData.stick.rotation.z = -Math.PI / 4;
                leverSeq.push(l.userData.id);
                keys.e = false;
                if (leverSeq.length === 3) {
                    if (JSON.stringify(leverSeq) === JSON.stringify(correctLever)) {
                        showD("Porta aberta! (Faca Curta obtida)");
                        door.open = true;
                        uiInv("slot-1", "🗡️");
                        let f = 0; const a = () => { f++; door.leaf.position.x += 0.05; if (f < 60) requestAnimationFrame(a); }; a();
                    } else {
                        showD("Resetando...");
                        setTimeout(() => { leverSeq = []; levers.forEach(lv => { lv.userData.active = false; lv.userData.stick.rotation.z = Math.PI / 4; }); }, 1000);
                    }
                }
            }
        }
    });

    symbols.forEach(s => {
        if (player.mesh.position.distanceTo(s.position) < 2.5) {
            near = true; showP("Pressione [E] - Símbolo");
            if (keys.e && !s.userData.active) {
                s.userData.active = true;
                s.material.emissive.set(0x00ffff);
                symbolSeq.push(s.userData.id);
                keys.e = false;
                if (symbolSeq.length === 3) {
                    if (JSON.stringify(symbolSeq) === JSON.stringify(correctSymbol)) {
                        showD("Pistola Velha obtida!");
                        uiInv("slot-2", "🔫");
                    } else {
                        showD("Símbolos resetados.");
                        setTimeout(() => { symbolSeq = []; symbols.forEach(sy => { sy.userData.active = false; sy.material.emissive.set(0x333333); }); }, 1000);
                    }
                }
            }
        }
    });

    if (!near) hideP();
    renderer.render(scene, camera);
}

// UI
function showP(t) { const p = document.getElementById('interaction-prompt'); p.innerText = t; p.classList.add('visible'); p.classList.remove('hidden'); }
function hideP() { document.getElementById('interaction-prompt').classList.remove('visible'); }
function showD(t) { document.getElementById('dialog-text').innerText = t; document.getElementById('dialog-box').classList.add('visible'); }
document.getElementById('close-dialog').onclick = () => document.getElementById('dialog-box').classList.remove('visible');
function uiInv(id, icon) { const s = document.getElementById(id); s.innerHTML = icon; s.classList.add('active'); }

init();
loop();
window.addEventListener('load', () => { setTimeout(() => { document.getElementById('loading-screen').style.opacity = '0'; setTimeout(() => document.getElementById('loading-screen').style.display = 'none', 1000); }, 1000); });
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
