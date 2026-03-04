import * as THREE from 'three';

console.log("Iniciando O Guardião do Porão...");

// --- CONFIGURAÇÕES DO MOTOR ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0c);
scene.fog = new THREE.Fog(0x0a0a0c, 5, 30);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
    canvas: document.querySelector('#bg'),
    antialias: true,
    powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// --- SISTEMA DE ILUMINAÇÃO (Garante visibilidade mesmo sem texturas) ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // Luz base mais forte
scene.add(ambientLight);

const torchLight = new THREE.PointLight(0xffaa44, 15, 20); // Luz da tocha
torchLight.castShadow = true;
scene.add(torchLight);

// --- CARREGAMENTO DE TEXTURAS (Híbrido) ---
const textureLoader = new THREE.TextureLoader();
const assetsPath = './public/assets/';

function setupTexture(texture, repeatX = 1, repeatY = 1) {
    if (!texture) return null;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    return texture;
}

// Fallbacks de Material
const floorMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
const wallMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
const heroMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, alphaTest: 0.5 });

// Tenta carregar texturas
textureLoader.load(assetsPath + 'floor.png', (t) => { floorMat.map = setupTexture(t, 10, 10); floorMat.needsUpdate = true; });
textureLoader.load(assetsPath + 'wall.png', (t) => { wallMat.map = setupTexture(t, 4, 1); wallMat.needsUpdate = true; });
textureLoader.load(assetsPath + 'hero.png', (t) => { heroMat.map = t; heroMat.needsUpdate = true; });

// --- ESTADO DO JOGO ---
const player = {
    mesh: null,
    speed: 0.15,
    inventory: [],
    currentWeapon: null
};

const keys = { w: false, a: false, s: false, d: false, e: false };
const levers = [];
let leverSequence = [];
const correctSequence = [0, 2, 1];
let door = null;
const symbols = [];
let symbolPattern = [];

// --- CONSTRUTORES ---

function createWorld() {
    // Chão
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Parede Norte (Sala 1)
    const wallN = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 1), wallMat);
    wallN.position.set(0, 5, -10);
    wallN.receiveShadow = true;
    scene.add(wallN);

    // Outras paredes básicas
    const wallW = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 26), wallMat);
    wallW.position.set(-10, 5, 2.5);
    scene.add(wallW);

    const wallE = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 26), wallMat);
    wallE.position.set(10, 5, 2.5);
    scene.add(wallE);

    // Alavancas
    [-4, 0, 4].forEach((x, i) => {
        const group = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.4), new THREE.MeshStandardMaterial({ color: 0x222222 }));
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1), new THREE.MeshStandardMaterial({ color: 0x777777 }));
        handle.position.y = 0.5;
        handle.rotation.z = Math.PI / 4;
        group.add(base);
        group.add(handle);
        group.position.set(x, 1, -9.2);
        group.userData = { id: i, active: false, handle: handle };
        scene.add(group);
        levers.push(group);
    });

    // Porta para Sala 2
    const doorGroup = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.5, 6, 0.5), new THREE.MeshStandardMaterial({ color: 0x1a110a }));
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(3, 5.5, 0.2), new THREE.MeshStandardMaterial({ color: 0x3d2b1f }));
    leaf.position.z = 0.1;
    doorGroup.add(frame);
    doorGroup.add(leaf);
    doorGroup.position.set(9.5, 3, -5);
    doorGroup.rotation.y = Math.PI / 2;
    scene.add(doorGroup);
    door = { mesh: doorGroup, leaf: leaf, open: false };
}

function createPlayer() {
    player.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 3), heroMat);
    player.mesh.position.y = 1.6;
    player.mesh.castShadow = true;
    scene.add(player.mesh);
}

function createRoom2() {
    // Chão e Paredes da Sala 2
    const floor2 = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), floorMat);
    floor2.rotation.x = -Math.PI / 2;
    floor2.position.set(20, 0, -5);
    scene.add(floor2);

    const wallN2 = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 1), wallMat);
    wallN2.position.set(20, 5, -15);
    scene.add(wallN2);

    // Símbolos
    [15, 20, 25].forEach((x, i) => {
        const char = ["🔯", "☯️", "⚛️"][i];
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white'; ctx.font = 'bold 90px Arial';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(char, 64, 64);

        const texture = new THREE.CanvasTexture(canvas);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshStandardMaterial({ map: texture, transparent: true, emissive: 0x333333 }));
        mesh.position.set(x, 4, -14.4);
        mesh.userData = { id: i, active: false };
        scene.add(mesh);
        symbols.push(mesh);
    });
}

// --- LÓGICA DE JOGO ---

window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = true;
});
window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = false;
});

function update() {
    if (!player.mesh) return;

    const prevPos = player.mesh.position.clone();

    // Movimento
    if (keys.w) player.mesh.position.z -= player.speed;
    if (keys.s) player.mesh.position.z += player.speed;
    if (keys.a) player.mesh.position.x -= player.speed;
    if (keys.d) player.mesh.position.x += player.speed;

    // Colisão com Porta
    if (door && !door.open && player.mesh.position.x > 8.5 && Math.abs(player.mesh.position.z - (-5)) < 2) {
        player.mesh.position.x = prevPos.x;
    }

    // Limites de Mapa
    const maxX = (door && door.open) ? 28 : 9;
    if (player.mesh.position.x < -9 || player.mesh.position.x > maxX) player.mesh.position.x = prevPos.x;
    if (player.mesh.position.z < -9 || player.mesh.position.z > 14) player.mesh.position.z = prevPos.z;

    // Câmera
    camera.position.lerp(new THREE.Vector3(player.mesh.position.x, 8, player.mesh.position.z + 12), 0.1);
    camera.lookAt(player.mesh.position.x, 2, player.mesh.position.z);

    // Tocha
    torchLight.position.set(player.mesh.position.x, 3, player.mesh.position.z + 1);

    // Billboard
    player.mesh.rotation.y = Math.atan2(camera.position.x - player.mesh.position.x, camera.position.z - player.mesh.position.z);

    // Interações
    checkInteractions();
}

function checkInteractions() {
    let near = false;

    // Alavancas
    levers.forEach(l => {
        if (player.mesh.position.distanceTo(l.position) < 2) {
            near = true;
            showPrompt("Pressione [E] para usar Alavanca");
            if (keys.e && !l.userData.active) {
                l.userData.active = true;
                l.userData.handle.rotation.z = -Math.PI / 4;
                leverSequence.push(l.userData.id);
                keys.e = false;
                processLevers();
            }
        }
    });

    // Símbolos
    symbols.forEach(s => {
        if (player.mesh.position.distanceTo(s.position) < 2.5) {
            near = true;
            showPrompt("Pressione [E] para tocar Símbolo");
            if (keys.e && !s.userData.active) {
                s.userData.active = true;
                s.material.emissive.set(0x00ffff);
                symbolPattern.push(s.userData.id);
                keys.e = false;
                processSymbols();
            }
        }
    });

    if (!near) hidePrompt();
}

function processLevers() {
    if (leverSequence.length === 3) {
        if (JSON.stringify(leverSequence) === "[0,2,1]") {
            showDialog("A porta lateral se abriu com um estrondo! (Pego: Faca Curta)");
            updateInv("slot-1", "🗡️", "Faca Curta");
            door.open = true;
            animateDoor();
            createRoom2();
        } else {
            showDialog("As alavancas resetaram...");
            setTimeout(() => {
                leverSequence = [];
                levers.forEach(l => { l.userData.active = false; l.userData.handle.rotation.z = Math.PI / 4; });
            }, 1000);
        }
    }
}

function processSymbols() {
    if (symbolPattern.length === 3) {
        if (JSON.stringify(symbolPattern) === "[2,0,1]") {
            showDialog("Os símbolos brilham! Você obteve a Pistola Velha.");
            updateInv("slot-2", "🔫", "Pistola Velha");
        } else {
            showDialog("Os símbolos se apagam.");
            setTimeout(() => {
                symbolPattern = [];
                symbols.forEach(s => { s.userData.active = false; s.material.emissive.set(0x333333); });
            }, 1000);
        }
    }
}

function animateDoor() {
    let frame = 0;
    const anim = () => {
        frame++;
        door.leaf.position.x += 0.04;
        if (frame < 60) requestAnimationFrame(anim);
    };
    anim();
}

// UI HANDLERS
function showPrompt(t) { const p = document.getElementById('interaction-prompt'); p.innerText = t; p.classList.add('visible'); p.classList.remove('hidden'); }
function hidePrompt() { const p = document.getElementById('interaction-prompt'); p.classList.remove('visible'); p.classList.add('hidden'); }
function showDialog(t) { document.getElementById('dialog-text').innerText = t; document.getElementById('dialog-box').classList.add('visible'); document.getElementById('dialog-box').classList.remove('hidden'); }
document.getElementById('close-dialog').onclick = () => document.getElementById('dialog-box').classList.remove('visible');
function updateInv(id, icon, name) {
    const s = document.getElementById(id);
    s.innerHTML = `<span style="font-size: 2rem">${icon}</span>`;
    s.classList.add('active');
    document.getElementById('weapon-name').innerText = name;
}

// --- LOOP PRINCIPAL ---
function animate() {
    requestAnimationFrame(animate);
    update();
    renderer.render(scene, camera);
}

// INICIALIZAÇÃO
createWorld();
createPlayer();
animate();

window.addEventListener('load', () => {
    setTimeout(() => {
        const loading = document.getElementById('loading-screen');
        loading.style.opacity = '0';
        setTimeout(() => loading.classList.add('hidden'), 1000);
    }, 1500);
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
