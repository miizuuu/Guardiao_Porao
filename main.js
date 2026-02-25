import * as THREE from 'three';

// --- CONFIGURAÇÃO ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0c);
scene.fog = new THREE.Fog(0x0a0a0c, 10, 30);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

// --- ILUMINAÇÃO ---
const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
scene.add(ambientLight);

const torch = new THREE.PointLight(0xffaa22, 10, 15);
scene.add(torch);

// --- ESTADO DO JOGO ---
const player = {
    mesh: null,
    speed: 0.15,
    health: 100,
    inventory: [], // 'Faca', 'Pistola', 'Cetro'
    currentWeaponIndex: -1,
    canInteract: true
};

const keys = { w: false, a: false, s: false, d: false };
let currentRoom = 1;

// --- CRIAÇÃO DO CENÁRIO (PORÃO) ---
function createWorld() {
    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x151515 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Divisórias das Salas
    for (let i = 1; i <= 4; i++) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 1), new THREE.MeshStandardMaterial({ color: 0x222222 }));
        wall.position.set(0, 4, -20 * i);
        scene.add(wall);
    }
}

// --- PUZZLES ---
const objects = [];

// SALA 1: Alavancas
function setupRoom1() {
    const sequence = [];
    const correct = [1, 2, 0];
    for (let i = 0; i < 3; i++) {
        const lever = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 0.2), new THREE.MeshStandardMaterial({ color: 0xff4444 }));
        lever.position.set(-4 + i * 4, 1, -15);
        lever.userData = {
            type: 'lever',
            id: i,
            action: () => {
                if (lever.material.color.getHex() === 0x44ff44) return;
                lever.material.color.set(0x44ff44);
                sequence.push(i);
                if (sequence.length === 3) {
                    if (JSON.stringify(sequence) === JSON.stringify(correct)) {
                        showDialog("A grade se abriu! Você pegou a FACA CURTA.");
                        addWeapon("Faca Curta", 0);
                        currentRoom = 2;
                    } else {
                        showDialog("Seqüência errada... Resetando.");
                        sequence.length = 0;
                        objects.filter(o => o.userData.type === 'lever').forEach(o => o.material.color.set(0xff4444));
                    }
                }
            }
        };
        scene.add(lever);
        objects.push(lever);
    }
}

// SALA 2: Símbolos/Cores
function setupRoom2() {
    const colors = [0xff0000, 0x00ff00, 0x0000ff];
    let step = 0;
    colors.forEach((col, i) => {
        const stone = new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshStandardMaterial({ color: col }));
        stone.position.set(-3 + i * 3, 0.5, -35);
        stone.userData = {
            type: 'stone',
            action: () => {
                if (i === step) {
                    stone.scale.set(1.5, 1.5, 1.5);
                    step++;
                    if (step === 3) {
                        showDialog("Os símbolos brilham... Você obteve a PISTOLA VELHA.");
                        addWeapon("Pistola Velha", 1);
                        currentRoom = 3;
                    }
                } else {
                    showDialog("O brilho desaparece. Tente outra ordem.");
                    step = 0;
                    objects.filter(o => o.userData.type === 'stone').forEach(o => o.scale.set(1, 1, 1));
                }
            }
        };
        scene.add(stone);
        objects.push(stone);
    });
}

// SALA 4: O CÉRBERO
let bossHealth = { h1: 100, h2: 100, h3: 100 };
let boss;

function setupBoss() {
    const group = new THREE.Group();
    // Corpo
    const body = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 6), new THREE.MeshStandardMaterial({ color: 0x330000 }));
    group.add(body);

    // 3 Cabeças
    const headGeo = new THREE.SphereGeometry(1);
    const h1 = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xff0000 })); // FOGO
    h1.position.set(-1.5, 2, 3.5);
    const h2 = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: 0x00ff00 })); // ÁGIL
    h2.position.set(0, 3, 3.5);
    const h3 = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: 0x0000ff })); // MÁGICA
    h3.position.set(1.5, 2, 3.5);

    group.add(h1, h2, h3);
    group.position.set(0, 1.5, -75);
    scene.add(group);
    boss = { group, h1, h2, h3 };
}

// --- JOGADOR ---
function createPlayer() {
    const geo = new THREE.PlaneGeometry(1.2, 2.2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide });
    player.mesh = new THREE.Mesh(geo, mat);
    player.mesh.position.y = 1.1;
    scene.add(player.mesh);
}

// --- LÓGICA DE ARMAS ---
function addWeapon(name, index) {
    player.inventory.push(name);
    player.currentWeaponIndex = player.inventory.length - 1;
    updateUI();
}

function updateUI() {
    document.getElementById('weapon-name').innerText = player.inventory[player.currentWeaponIndex] || "Mãos Vazias";
    player.inventory.forEach((w, i) => {
        const slot = document.getElementById(`slot-${i + 1}`);
        slot.classList.add('active');
        slot.innerText = i === 0 ? "🗡️" : (i === 1 ? "🔫" : "🔮");
    });
}

// --- MOVIMENTO E CÂMERA ---
function update() {
    if (keys.w) player.mesh.position.z -= player.speed;
    if (keys.s) player.mesh.position.z += player.speed;
    if (keys.a) player.mesh.position.x -= player.speed;
    if (keys.d) player.mesh.position.x += player.speed;

    // Colisão simples com as bordas do corredor
    player.mesh.position.x = Math.max(-8, Math.min(8, player.mesh.position.x));

    camera.position.lerp(new THREE.Vector3(player.mesh.position.x, player.mesh.position.y + 6, player.mesh.position.z + 10), 0.1);
    camera.lookAt(player.mesh.position);
    torch.position.copy(player.mesh.position).add(new THREE.Vector3(0, 2, 1));

    // Billboard
    player.mesh.rotation.y = Math.atan2(camera.position.x - player.mesh.position.x, camera.position.z - player.mesh.position.z);

    // Interações
    objects.forEach(obj => {
        if (player.mesh.position.distanceTo(obj.position) < 1.2 && player.canInteract) {
            obj.userData.action();
            player.canInteract = false;
            setTimeout(() => player.canInteract = true, 1000);
        }
    });

    // Lógica do Chefe
    if (currentRoom === 4 && boss) {
        boss.group.position.x = Math.sin(Date.now() * 0.001) * 5;
    }
}

// --- SISTEMA DE DIÁLOGO ---
let dialogTimeout;
function showDialog(text) {
    const box = document.getElementById('dialog-box');
    const content = document.getElementById('dialog-text');
    content.innerText = text;
    box.classList.add('visible');

    clearTimeout(dialogTimeout);
    dialogTimeout = setTimeout(() => {
        box.classList.remove('visible');
    }, 3000);
}

// --- ENTRADA ---
window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true;

    // Troca de armas
    if (e.key === '1' && player.inventory[0]) player.currentWeaponIndex = 0;
    if (e.key === '2' && player.inventory[1]) player.currentWeaponIndex = 1;
    if (e.key === '3' && player.inventory[2]) player.currentWeaponIndex = 2;
    updateUI();
});
window.addEventListener('keyup', (e) => { if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });

// --- LOOP ---
function animate() {
    requestAnimationFrame(animate);
    update();
    renderer.render(scene, camera);
}

// INICIALIZAR
createWorld();
createPlayer();
setupRoom1();
setupRoom2();
setupBoss();
animate();

window.addEventListener('load', () => {
    setTimeout(() => {
        document.getElementById('loading-screen').style.opacity = '0';
        setTimeout(() => document.getElementById('loading-screen').style.display = 'none', 1000);
        showDialog("Onde estou? Preciso sair deste porão...");
    }, 1000);
});
