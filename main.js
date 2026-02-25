import * as THREE from 'three';

// --- CONFIGURAÇÃO DA CENA ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050508);
scene.fog = new THREE.Fog(0x050508, 5, 40);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('bg'), antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

const ambient = new THREE.AmbientLight(0x404040, 0.6);
scene.add(ambient);

// --- ESTADO DO JOGO ---
const player = {
    mesh: null,
    hp: 100,
    speed: 0.18,
    inventory: [], // 'Faca', 'Pistola', 'Cetro'
    currentWeapon: -1,
    canInteract: true
};

const keys = {};
const gameObjects = [];
let currentRoom = 1;

// --- MUNDO E CORREDORES ---
function createWorld() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 250), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -100;
    scene.add(floor);

    // Paredes indicativas de fim de sala
    for (let i = 1; i <= 4; i++) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 1), new THREE.MeshStandardMaterial({ color: 0x0a0a0a }));
        wall.position.set(0, 5, -30 * i);
        scene.add(wall);
    }
}

// --- JOGADOR (BILLBOARD) ---
function setupPlayer() {
    player.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true }));
    player.mesh.position.y = 1.1;
    scene.add(player.mesh);

    const torch = new THREE.PointLight(0xffaa22, 15, 12);
    torch.position.y = 1;
    player.torch = torch;
    scene.add(torch);
}

// --- PUZZLES ---
let boss;
let heads = [];

function setupPuzzles() {
    // Sala 1: Alavancas (Sequência)
    const seq = [];
    const correct = [1, 2, 0];
    for (let i = 0; i < 3; i++) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.2), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
        l.position.set(-4 + i * 4, 1, -15);
        l.userData = {
            type: 'lever', id: i,
            interact: () => {
                if (l.material.color.getHex() === 0x00ff00) return;
                l.material.color.set(0x00ff00);
                seq.push(i);
                if (seq.length === 3) {
                    if (JSON.stringify(seq) === JSON.stringify(correct)) {
                        notify("VOCÊ ENCONTROU A FACA CURTA!");
                        collectWeapon("Faca Curta", "🗡️");
                    } else {
                        notify("ORDEM ERRADA. RESETANDO...");
                        seq.length = 0;
                        gameObjects.filter(o => o.userData.type === 'lever').forEach(o => o.material.color.set(0xff0000));
                    }
                }
            }
        };
        scene.add(l);
        gameObjects.push(l);
    }

    // Sala 2: Cristais
    const crystalCols = [0xff0000, 0x00ff00, 0x0000ff];
    crystalCols.forEach((c, i) => {
        const crys = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshStandardMaterial({ color: c, emissive: c }));
        crys.position.set(-3 + i * 3, 1, -45);
        crys.userData = {
            interact: () => {
                if (player.inventory.length === 1 && i === 1) { // Só desbloqueia se tiver a faca e for o cristal certo
                    notify("PISTOLA VELHA OBTIDA!");
                    collectWeapon("Pistola Velha", "🔫");
                    crys.visible = false;
                }
            }
        };
        scene.add(crys);
        gameObjects.push(crys);
    });

    // Sala 4: O CÉRBERO
    boss = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 6), new THREE.MeshStandardMaterial({ color: 0x220000 }));
    boss.add(body);
    const hTypes = [0xff4444, 0x44ff44, 0x4444ff]; // Cores das fraquezas
    hTypes.forEach((col, i) => {
        const h = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshStandardMaterial({ color: col }));
        h.position.set(-1.8 + i * 1.8, 2.5, 3.5);
        h.userData = { id: i, hp: 100 };
        boss.add(h);
        heads.push(h);
    });
    boss.position.set(0, 1.5, -120);
    scene.add(boss);
}

// --- MECÂNICAS ---
function collectWeapon(name, icon) {
    player.inventory.push(name);
    const slot = document.getElementById(`slot-${player.inventory.length}`);
    slot.innerText = icon;
    slot.classList.add('active');
    switchWeapon(player.inventory.length - 1);
}

function switchWeapon(index) {
    if (index >= player.inventory.length) return;
    player.currentWeapon = index;
    document.getElementById('weapon-name').innerText = player.inventory[index];
    document.querySelectorAll('.slot').forEach((s, i) => {
        s.classList.toggle('active', i === index);
    });
}

function attack() {
    if (player.currentWeapon === -1) return;
    const currentWpnName = player.inventory[player.currentWeapon];

    heads.forEach(h => {
        const dist = player.mesh.position.distanceTo(boss.position.clone().add(h.position));
        if (dist < 10 && h.userData.hp > 0) {
            let hit = false;
            if (h.userData.id === 0 && currentWpnName === "Faca Curta") hit = true;
            if (h.userData.id === 1 && currentWpnName === "Pistola Velha") hit = true;
            if (h.userData.id === 2 && currentWpnName === "Cetro Rúnico") hit = true; // Placeholder sala 3

            if (hit) {
                h.userData.hp -= 34;
                h.scale.multiplyScalar(0.8);
                notify("DANO CRÍTICO NA CABEÇA!");
                if (h.userData.hp <= 0) {
                    h.visible = false;
                    notify("CABEÇA DESTRUÍDA!");
                }
            } else {
                notify("ESSA ARMA NÃO FUNCIONA AQUI!");
            }
        }
    });

    if (heads.every(h => h.userData.hp <= 0)) {
        notify("O CÉRBERO CAIU! VOCÊ ESCAPOU DO PORÃO.");
        setTimeout(() => location.reload(), 6000);
    }
}

function notify(text) {
    const box = document.getElementById('dialog-box');
    const content = document.getElementById('dialog-text');
    content.innerText = text;
    box.classList.remove('hidden');
    box.classList.remove('show');
    void box.offsetWidth;
    box.classList.add('show');
}

// --- CONTROLES ---
window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === '1') switchWeapon(0);
    if (e.key === '2') switchWeapon(1);
    if (e.key === '3') switchWeapon(2);
    if (e.key === ' ') attack();
});
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// --- LOOP ---
function update() {
    if (keys.w) player.mesh.position.z -= player.speed;
    if (keys.s) player.mesh.position.z += player.speed;
    if (keys.a) player.mesh.position.x -= player.speed;
    if (keys.d) player.mesh.position.x += player.speed;

    player.mesh.position.x = Math.max(-8, Math.min(8, player.mesh.position.x));

    // Suavização da Câmera
    const targetCam = new THREE.Vector3(player.mesh.position.x, 6, player.mesh.position.z + 10);
    camera.position.lerp(targetCam, 0.1);
    camera.lookAt(player.mesh.position);

    player.torch.position.copy(player.mesh.position).add(new THREE.Vector3(0, 1.5, 1));
    player.mesh.rotation.y = Math.atan2(camera.position.x - player.mesh.position.x, camera.position.z - player.mesh.position.z);

    // Colisões e Interações
    gameObjects.forEach(obj => {
        if (player.mesh.position.distanceTo(obj.position) < 1.5 && player.canInteract) {
            obj.userData.interact();
            player.canInteract = false;
            setTimeout(() => player.canInteract = true, 500);
        }
    });

    // Boss Move
    if (boss && player.mesh.position.z < -80) {
        boss.position.x = Math.sin(Date.now() * 0.0015) * 6;
    }
}

function animate() {
    requestAnimationFrame(animate);
    update();
    renderer.render(scene, camera);
}

// INICIALIZAÇÃO
createWorld();
setupPlayer();
setupPuzzles();
animate();

window.addEventListener('load', () => {
    setTimeout(() => {
        document.getElementById('loading-screen').style.display = 'none';
        notify("ONDE ESTOU? PRECISO SAIR DAS PROFUNDEZAS...");
    }, 1500);
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
