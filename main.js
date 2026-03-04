import * as THREE from 'three';

// Configurações Básicas
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
scene.fog = new THREE.Fog(0x050505, 5, 25);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

// Texturas
const textureLoader = new THREE.TextureLoader();
const floorTexture = textureLoader.load('./assets/floor.png');
const wallTexture = textureLoader.load('./assets/wall.png');
const heroTexture = textureLoader.load('./assets/hero.png');

floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
floorTexture.repeat.set(10, 10);

wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;
wallTexture.repeat.set(4, 1);

// Iluminação
const ambientLight = new THREE.AmbientLight(0x404040, 0.3); // Mais escuro para atmosfera
scene.add(ambientLight);

const torchLight = new THREE.PointLight(0xffaa00, 20, 15); // Luz de tocha quente
torchLight.castShadow = true;
scene.add(torchLight);

// Variáveis de Jogo
const player = {
    mesh: null,
    speed: 0.1,
    health: 100,
    inventory: [],
    currentWeapon: null
};

const keys = { w: false, a: false, s: false, d: false, e: false };

// --- Criação do Mundo (Porão Melhorado) ---
function createBasement() {
    // Chão
    const floorGeo = new THREE.PlaneGeometry(50, 50);
    const floorMat = new THREE.MeshStandardMaterial({
        map: floorTexture,
        roughness: 0.8,
        metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Paredes da Sala 1
    const wallMat = new THREE.MeshStandardMaterial({
        map: wallTexture,
        roughness: 0.9
    });

    // Parede Norte
    const wallN = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 1), wallMat);
    wallN.position.set(0, 5, -10);
    wallN.receiveShadow = true;
    scene.add(wallN);

    // Parede Sul (atrás da câmera inicial)
    const wallS = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 1), wallMat);
    wallS.position.set(0, 5, 15);
    scene.add(wallS);

    // Parede Oeste
    const wallW = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 26), wallMat);
    wallW.position.set(-10, 5, 2.5);
    scene.add(wallW);

    // Parede Leste
    const wallE = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 26), wallMat);
    wallE.position.set(10, 5, 2.5);
    scene.add(wallE);

    // Alavancas (Agora com visual melhor)
    createLever(new THREE.Vector3(-4, 1.5, -9), 0);
    createLever(new THREE.Vector3(0, 1.5, -9), 1);
    createLever(new THREE.Vector3(4, 1.5, -9), 2);
}

const levers = [];
let leverSequence = [];
const correctSequence = [0, 2, 1];

function createLever(position, id) {
    const group = new THREE.Group();

    // Base da alavanca
    const baseGeo = new THREE.BoxGeometry(0.8, 1.2, 0.4);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    group.add(base);

    // Haste
    const handleGeo = new THREE.CylinderGeometry(0.05, 0.05, 1);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.y = 0.5;
    handle.rotation.z = Math.PI / 4;
    group.add(handle);

    group.position.copy(position);
    group.userData = { id: id, active: false, handle: handle };
    scene.add(group);
    levers.push(group);
}

// --- Jogador (Billboard 2.5D com Sprite Real) ---
function createPlayer() {
    const geo = new THREE.PlaneGeometry(2, 3);
    const mat = new THREE.MeshStandardMaterial({
        map: heroTexture,
        transparent: true,
        side: THREE.FrontSide,
        alphaTest: 0.5
    });
    player.mesh = new THREE.Mesh(geo, mat);
    player.mesh.position.y = 1.5;
    player.mesh.castShadow = true;
    scene.add(player.mesh);
}

// --- Controles ---
window.addEventListener('keydown', (e) => { if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });

function handleMovement() {
    const prevPos = player.mesh.position.clone();

    if (keys.w) player.mesh.position.z -= player.speed;
    if (keys.s) player.mesh.position.z += player.speed;
    if (keys.a) player.mesh.position.x -= player.speed;
    if (keys.d) player.mesh.position.x += player.speed;

    // Colisão simples com as paredes do porão
    if (Math.abs(player.mesh.position.x) > 9) player.mesh.position.x = prevPos.x;
    if (player.mesh.position.z < -8.5 || player.mesh.position.z > 14) player.mesh.position.z = prevPos.z;

    // Câmera segue o jogador suavemente
    const targetCamPos = new THREE.Vector3(
        player.mesh.position.x,
        player.mesh.position.y + 6,
        player.mesh.position.z + 10
    );
    camera.position.lerp(targetCamPos, 0.1);
    camera.lookAt(player.mesh.position.x, player.mesh.position.y + 1, player.mesh.position.z);

    // Luz da tocha segue o jogador com um pequeno balanço
    torchLight.position.set(
        player.mesh.position.x,
        player.mesh.position.y + 2 + Math.sin(Date.now() * 0.002) * 0.1,
        player.mesh.position.z + 1
    );

    // Efeito Billboard
    player.mesh.rotation.y = Math.atan2(
        camera.position.x - player.mesh.position.x,
        camera.position.z - player.mesh.position.z
    );
}

// --- Interação e Puzzle ---
function checkInteractions() {
    let nearObject = false;
    levers.forEach(lever => {
        const distance = player.mesh.position.distanceTo(lever.position);
        if (distance < 2) {
            nearObject = true;
            showInteractionPrompt("Pressione [E] para usar a alavanca");
            if (keys.e) {
                if (!lever.userData.active) {
                    activateLever(lever);
                }
                keys.e = false; // Debounce
            }
        }
    });

    if (!nearObject) {
        hideInteractionPrompt();
    }
}

function activateLever(lever) {
    lever.userData.active = true;
    lever.userData.handle.rotation.z = -Math.PI / 4;
    leverSequence.push(lever.userData.id);

    console.log("Sequência:", leverSequence);

    if (leverSequence.length === correctSequence.length) {
        if (JSON.stringify(leverSequence) === JSON.stringify(correctSequence)) {
            showDialog("Sequência Correta! Um compartimento secreto se abriu... Você encontrou a Faca Curta.");
            addToInventory("Faca Curta", "slot-1", "🗡️");
        } else {
            showDialog("As alavancas travam e resetam com um som metálico. Talvez haja uma ordem certa.");
            setTimeout(resetLevers, 1000);
        }
    }
}

function resetLevers() {
    leverSequence = [];
    levers.forEach(l => {
        l.userData.active = false;
        l.userData.handle.rotation.z = Math.PI / 4;
    });
}

// --- UI Helpers ---
function showDialog(text) {
    const box = document.getElementById('dialog-box');
    const content = document.getElementById('dialog-text');
    content.innerText = text;
    box.classList.add('visible');
}

document.getElementById('close-dialog').addEventListener('click', () => {
    document.getElementById('dialog-box').classList.remove('visible');
});

function showInteractionPrompt(text) {
    const prompt = document.getElementById('interaction-prompt');
    prompt.innerText = text;
    prompt.classList.add('visible');
}

function hideInteractionPrompt() {
    document.getElementById('interaction-prompt').classList.remove('visible');
}

function addToInventory(name, slotId, icon) {
    const slot = document.getElementById(slotId);
    slot.classList.add('active');
    slot.innerHTML = `<span style="font-size: 2rem">${icon}</span>`;
    player.inventory.push(name);
    player.currentWeapon = name;
    document.getElementById('weapon-name').innerText = name;
}

// --- Loop Principal ---
function animate() {
    requestAnimationFrame(animate);

    handleMovement();
    checkInteractions();

    renderer.render(scene, camera);
}

// Inicialização
createBasement();
createPlayer();
animate();

// Esconder loading após carregar
window.addEventListener('load', () => {
    setTimeout(() => {
        document.getElementById('loading-screen').style.opacity = '0';
        setTimeout(() => document.getElementById('loading-screen').classList.add('hidden'), 1000);
    }, 1000);
});

// Ajuste de janela
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
