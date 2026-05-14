/**
 * Kids English Garden 3D - Core Rendering Engine
 * A Three.js based 3D visualization that renders English vocabulary as flowers in a garden.
 * 
 * Features:
 *   - Procedural flower generation (roses, tulips, daisies, etc.)
 *   - 3D ground grid with category-based garden beds
 *   - OrbitControls rotation & zoom
 *   - Raycaster hover/click detection
 *   - Growth animation from seed to bloom
 *   - Category filtering with visual dimming
 *   - View mode switching: flowers / plants / mixed
 */

// ===== Global THREE (loaded via <script> tag) =====

// ===== Configuration - Kids English Garden Categories =====
const CONFIG = {
    // Ground
    gridSize: 10,
    cellSize: 10,       // 每块花园10米
    pathWidth: 1,       // 小径1米宽
    groundColor: 0x7CB342,
    gridLineColor: 0x689F38,
    
    // Camera
    cameraDistance: 65,
    cameraAngleX: Math.PI / 4,
    cameraAngleY: Math.PI / 5,
    
    // Flowers - 更大更密
    flowerBaseScale: 1.0,
    flowerScaleRange: 0.4,
    flowerMinRadius: 0.5, // 花朵最小分布半径
    flowerMaxRadius: 4.5, // 花朵最大分布半径（留出边距给小径）
    
    // Animation - 更强的飘摇感
    growthDuration: 4000,
    swayAmplitude: 0.15,  // 大幅增加飘摇幅度
    swaySpeed: 1.5,
    swayPhaseVariation: true,
    
    // Category colors - 20 rainbow categories for kids
    categories: {
        'Electronics':       { color: 0xFF9800, name: 'Electronics', pos: [0, 0] },
        'Furniture':         { color: 0x009688, name: 'Furniture', pos: [1, 0] },
        'Toiletries':        { color: 0xE91E63, name: 'Toiletries', pos: [2, 0] },
        'Tableware':        { color: 0x9C27B0, name: 'Tableware', pos: [3, 0] },
        'Plants':           { color: 0x4CAF50, name: 'Plants', pos: [4, 0] },
        'Vehicles':         { color: 0xF44336, name: 'Vehicles', pos: [0, 1] },
        'Weather':          { color: 0x2196F3, name: 'Weather', pos: [1, 1] },
        'Animals':          { color: 0xFF9800, name: 'Animals', pos: [2, 1] },
        'Fruits & Veg':     { color: 0x8BC34A, name: 'Fruits & Veg', pos: [3, 1] },
        'Food':             { color: 0xFF5722, name: 'Food', pos: [4, 1] },
        'Clothing':         { color: 0x3F51B5, name: 'Clothing', pos: [0, 2] },
        'Body Parts':       { color: 0x00BCD4, name: 'Body Parts', pos: [1, 2] },
        'Balls':            { color: 0xFFEB3B, name: 'Balls', pos: [2, 2] },
        'Actions':          { color: 0x8BC34A, name: 'Actions', pos: [3, 2] },
        'Shapes':           { color: 0xE91E63, name: 'Shapes', pos: [4, 2] },
        'Playground':       { color: 0x673AB7, name: 'Playground', pos: [0, 3] },
        'Holidays':         { color: 0xF44336, name: 'Holidays', pos: [1, 3] },
        'Public Places':    { color: 0x607D8B, name: 'Public Places', pos: [2, 3] },
        'Adjectives':       { color: 0x03A9F4, name: 'Adjectives', pos: [3, 3] },
        'Others':           { color: 0x795548, name: 'Others', pos: [4, 3] }
    }
};

// ===== Global State =====
let scene, camera, renderer, controls;
let vocabData = [];
let flowerMeshes = [];
let groundGroup, labelSprites = [];
let raycaster, mouse;
let hoveredObject = null;
let activeCategories = new Set();
let currentViewMode = 'flowers';
let clock, growthStartTime;

// DOM elements
let wordCard, cardCategory, cardWord, cardMeaning, cardHint;

// ===== Initialization =====
async function init() {
    // Get DOM references
    wordCard = document.getElementById('wordCard');
    cardCategory = document.getElementById('cardCategory');
    cardWord = document.getElementById('cardWord');
    cardMeaning = document.getElementById('cardMeaning');
    cardHint = document.getElementById('cardHint');

    // Load data
    try {
        const resp = await fetch('./vocabulary-data.json');
        vocabData = (await resp.json()).vocabulary;
    } catch (e) {
        console.warn('Fetch failed, using inline data fallback:', e.message);
        vocabData = __INLINE_VOCAB_DATA__;
        if (!vocabData || vocabData.length === 0) {
            console.error('No vocabulary data available!');
            return;
        }
    }

    // Init all categories as active
    Object.keys(CONFIG.categories).forEach(c => activeCategories.add(c));

    // Setup Three.js
    setupScene();
    createGround();
    createFlowersAndPlants();
    createCategoryLabels();
    setupInteraction();
    setupUI();

    // Update stats
    document.getElementById('flowerCount').textContent = vocabData.length;
    document.getElementById('topicCount').textContent = vocabData.length;
    document.getElementById('categoryCount').textContent = Object.keys(CONFIG.categories).length;

    // Start animation loop
    clock = new THREE.Clock();
    growthStartTime = clock.getElapsedTime() * 1000;
    animate();

    // Hide loading screen
    setTimeout(() => {
        document.getElementById('loadingScreen').classList.add('hidden');
    }, 1000);
}

function setupScene() {
    const container = document.getElementById('canvas-container');

    // Scene - 柔和的灰粉色背景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xE8D5D0);
    scene.fog = new THREE.Fog(0xE8D5D0, 80, 180);

    // Camera
    camera = new THREE.PerspectiveCamera(
        50,
        window.innerWidth / window.innerHeight,
        0.1,
        200
    );
    updateCameraPosition();

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 15;
    controls.maxDistance = 85;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.target.set(0, 1, 0);
    controls.update();

    // Lights - brighter and warmer for kids
    const ambientLight = new THREE.AmbientLight(0xFFFBF0, 0.75);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xFFFFE0, 1.1);
    mainLight.position.set(15, 25, 15);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 1;
    mainLight.shadow.camera.far = 70;
    mainLight.shadow.camera.left = -35;
    mainLight.shadow.camera.right = 35;
    mainLight.shadow.camera.top = 35;
    mainLight.shadow.camera.bottom = -35;
    mainLight.shadow.bias = -0.001;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xE0F0FF, 0.4);
    fillLight.position.set(-10, 15, -10);
    scene.add(fillLight);

    const hemiLight = new THREE.HemisphereLight(0xFFFBE0, 0xC8E6C9, 0.5);
    scene.add(hemiLight);

    // Raycaster
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Resize handler
    window.addEventListener('resize', onWindowResize);
}

function updateCameraPosition() {
    const r = CONFIG.cameraDistance;
    camera.position.x = r * Math.sin(CONFIG.cameraAngleY) * Math.cos(CONFIG.cameraAngleX);
    camera.position.y = r * Math.sin(CONFIG.cameraAngleX);
    camera.position.z = r * Math.cos(CONFIG.cameraAngleY) * Math.cos(CONFIG.cameraAngleX);
    camera.lookAt(0, 1, 0);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ===== Ground Creation =====
var grassGroup = new THREE.Group();

function createGround() {
    groundGroup = new THREE.Group();

    // Main ground plane - 更鲜艳的草坪绿色
    const groundGeo = new THREE.PlaneGeometry(
        CONFIG.gridSize * CONFIG.cellSize + 12,
        CONFIG.gridSize * CONFIG.cellSize + 12,
        80, 80
    );
    
    // Add height variation for natural terrain
    const positions = groundGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const distFromCenter = Math.sqrt(x*x + y*y) / (CONFIG.gridSize * CONFIG.cellSize / 2);
        positions.setZ(i, -0.05 + Math.random() * 0.04 + distFromCenter * -0.05);
    }
    groundGeo.computeVertexNormals();

    // 更鲜艳的草坪材质
    const groundMat = new THREE.MeshStandardMaterial({
        color: CONFIG.groundColor,
        roughness: 0.95,
        metalness: 0.01,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.05;
    groundMesh.receiveShadow = true;
    groundGroup.add(groundMesh);

    // Garden bed areas with colorful soil patches
    createGardenBeds();

    // Add grass texture dots for lush effect (after scene is ready)
    createGrassTexture();

    scene.add(groundGroup);
}

// 添加草丛纹理效果 - 茂密的草地
function createGrassTexture() {
    const grassCount = 1500;
    const halfGrid = CONFIG.gridSize * CONFIG.cellSize / 2 + 4;
    
    for (let i = 0; i < grassCount; i++) {
        const x = (Math.random() - 0.5) * halfGrid * 2;
        const z = (Math.random() - 0.5) * halfGrid * 2;
        
        const grassGeo = new THREE.ConeGeometry(0.02 + Math.random() * 0.025, 0.1 + Math.random() * 0.15, 4);
        const grassMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color().lerpColors(new THREE.Color(0x558B2F), new THREE.Color(0x7CB342), Math.random()),
            roughness: 0.85
        });
        const grass = new THREE.Mesh(grassGeo, grassMat);
        grass.position.set(x, 0.02 + Math.random() * 0.06, z);
        grass.rotation.y = Math.random() * Math.PI * 2;
        grass.rotation.x = (Math.random() - 0.5) * 0.2;
        grassGroup.add(grass);
    }
    scene.add(grassGroup);
}

// 地被植物 - 增加地面丰盛感
function createGroundCover() {
    const groundCover = new THREE.Group();
    const step = CONFIG.cellSize + CONFIG.pathWidth;
    
    // 遍历每个地块
    for (const [key, info] of Object.entries(CONFIG.categories)) {
        const cx = (info.pos[0] - 2) * step;
        const cz = (info.pos[1] - 1.5) * step;
        const halfSize = CONFIG.cellSize / 2 - 0.3;
        
        // 添加小草和地被植物
        for (let i = 0; i < 40; i++) {
            const x = cx + (Math.random() - 0.5) * halfSize * 2;
            const z = cz + (Math.random() - 0.5) * halfSize * 2;
            
            // 跳过池塘区域
            if (window.pondBounds && isInAnyPond(x, z, 0.5)) continue;
            
            const type = Math.random();
            let miniPlant;
            
            if (type < 0.6) {
                // 小草
                const grassGeo = new THREE.ConeGeometry(0.015 + Math.random() * 0.01, 0.08 + Math.random() * 0.06, 4);
                const grassColor = new THREE.Color().lerpColors(
                    new THREE.Color(0x6B8E4E),
                    new THREE.Color(0x8FBC6B),
                    Math.random()
                );
                const grassMat = new THREE.MeshStandardMaterial({
                    color: grassColor,
                    roughness: 0.8
                });
                miniPlant = new THREE.Mesh(grassGeo, grassMat);
                miniPlant.position.set(x, 0.04, z);
                miniPlant.rotation.y = Math.random() * Math.PI;
            } else {
                // 小花
                const flowerGeo = new THREE.SphereGeometry(0.04 + Math.random() * 0.03, 6, 5);
                const flowerColor = new THREE.Color().lerpColors(
                    new THREE.Color(info.color),
                    new THREE.Color(0xFFFFFF),
                    0.3 + Math.random() * 0.3
                );
                const flowerMat = new THREE.MeshStandardMaterial({
                    color: flowerColor,
                    roughness: 0.5,
                    emissive: flowerColor.clone().multiplyScalar(0.1)
                });
                miniPlant = new THREE.Mesh(flowerGeo, flowerMat);
                miniPlant.position.set(x, 0.08, z);
            }
            
            miniPlant.rotation.x = (Math.random() - 0.5) * 0.2;
            miniPlant.scale.y = 0.7 + Math.random() * 0.3;
            groundCover.add(miniPlant);
        }
    }
    
    scene.add(groundCover);
}

function createGridLines() {
    const lineMat = new THREE.LineBasicMaterial({ 
        color: CONFIG.gridLineColor, 
        transparent: true, 
        opacity: 0.4 
    });
    const halfGrid = (CONFIG.gridSize * CONFIG.cellSize) / 2;

    for (let i = -CONFIG.gridSize/2; i <= CONFIG.gridSize/2; i++) {
        const points1 = [
            new THREE.Vector3(-halfGrid, 0.01, i * CONFIG.cellSize),
            new THREE.Vector3(halfGrid, 0.01, i * CONFIG.cellSize)
        ];
        const geo1 = new THREE.BufferGeometry().setFromPoints(points1);
        groundGroup.add(new THREE.Line(geo1, lineMat));

        const points2 = [
            new THREE.Vector3(i * CONFIG.cellSize, 0.01, -halfGrid),
            new THREE.Vector3(i * CONFIG.cellSize, 0.01, halfGrid)
        ];
        const geo2 = new THREE.BufferGeometry().setFromPoints(points2);
        groundGroup.add(new THREE.Line(geo2, lineMat));
    }

    // Border
    const borderPoints = [
        new THREE.Vector3(-halfGrid, 0.02, -halfGrid),
        new THREE.Vector3(halfGrid, 0.02, -halfGrid),
        new THREE.Vector3(halfGrid, 0.02, halfGrid),
        new THREE.Vector3(-halfGrid, 0.02, halfGrid),
        new THREE.Vector3(-halfGrid, 0.02, -halfGrid)
    ];
    const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPoints);
    const borderMat = new THREE.LineBasicMaterial({
        color: 0x81C784,
        transparent: true,
        opacity: 0.6
    });
    groundGroup.add(new THREE.Line(borderGeo, borderMat));
}

function createGardenBeds() {
    const bedSize = CONFIG.cellSize; // 10米
    const cellSize = CONFIG.cellSize;
    const pathWidth = CONFIG.pathWidth; // 1米
    
    // 统一的灰粉色土壤 - 深一点点
    const soilColor = new THREE.Color(0xB89D97);
    
    for (const [catKey, catInfo] of Object.entries(CONFIG.categories)) {
        // 地块中心位置 - 与花朵位置对齐
        const cx = (catInfo.pos[0] - 2) * (cellSize + pathWidth);
        const cz = (catInfo.pos[1] - 1.5) * (cellSize + pathWidth);

        // 花园地块 - 统一灰粉色
        const bedGeo = new THREE.PlaneGeometry(bedSize, bedSize);
        const bedMat = new THREE.MeshStandardMaterial({
            color: soilColor,
            roughness: 0.92,
            metalness: 0.0,
        });
        const bed = new THREE.Mesh(bedGeo, bedMat);
        bed.rotation.x = -Math.PI / 2;
        bed.position.set(cx, 0.01, cz);
        bed.receiveShadow = true;
        groundGroup.add(bed);

        // 地块边界装饰石头 - 浅灰色
        const borderCount = 16;
        for (let i = 0; i < borderCount; i++) {
            const angle = (i / borderCount) * Math.PI * 2;
            const r = bedSize / 2 - 0.2;
            const stoneGeo = new THREE.SphereGeometry(0.1 + Math.random() * 0.06, 6, 5);
            const stoneColor = new THREE.Color().lerpColors(
                new THREE.Color(0xA09090),
                new THREE.Color(0xB8A8A8),
                Math.random()
            );
            const stoneMat = new THREE.MeshStandardMaterial({
                color: stoneColor,
                roughness: 0.85
            });
            const stone = new THREE.Mesh(stoneGeo, stoneMat);
            stone.position.set(
                cx + Math.cos(angle) * r,
                0.02,
                cz + Math.sin(angle) * r
            );
            stone.scale.y = 0.5;
            stone.castShadow = true;
            stone.receiveShadow = true;
            groundGroup.add(stone);
        }
    }
    
    // 创建小径
    createGardenPaths();
    
    // 创建池塘
    createPond();
}

// 创建多个池塘 - 不规则形状，用水渠连接
function createPond() {
    const step = CONFIG.cellSize + CONFIG.pathWidth;
    window.pondBounds = []; // 存储所有池塘边界
    
    // 池塘1 - 左上方，大池塘
    createSinglePond(
        (1 - 2) * step + 2, // x
        (2 - 1.5) * step - 1, // z
        5, // 宽度
        4, // 深度
        25, // 石头数量
        5 // 荷叶数量
    );
    
    // 池塘2 - 右下方，椭圆形
    createSinglePond(
        (3 - 2) * step + 1,
        (0 - 1.5) * step + 2,
        4,
        5.5,
        22,
        4
    );
    
    // 池塘3 - 中间偏上，圆形
    createSinglePond(
        (2 - 2) * step,
        (2 - 1.5) * step + 3,
        3.5,
        3.5,
        18,
        3
    );
    
    // 创建水渠连接池塘 - 使用池塘边界对象
    // 池塘1 -> 池塘2
    createWaterChannel(window.pondBounds[0], window.pondBounds[1]);
    
    // 池塘2 -> 池塘3
    createWaterChannel(window.pondBounds[1], window.pondBounds[2]);
}

// 检查点是否在任何池塘内
function isInAnyPond(x, z, margin = 0) {
    if (!window.pondBounds) return false;
    for (const pb of window.pondBounds) {
        const dx = x - pb.x;
        const dz = z - pb.z;
        if (Math.abs(dx) < pb.width/2 + margin && Math.abs(dz) < pb.depth/2 + margin) {
            return true;
        }
    }
    return false;
}

// 创建单个不规则椭圆形池塘
function createSinglePond(x, z, width, depth, stoneCount, lilyCount) {
    const irregularFactor = 0.15; // 不规则程度
    
    // 池塘底部 - 椭圆形（Shape 使用 XY 平面，旋转后 Y→Z）
    // ShapeGeometry 会居中，所以我们用相对于池塘中心的坐标
    const bottomShape = new THREE.Shape();
    const segments = 32;
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const rx = width / 2 + Math.sin(angle * 3) * irregularFactor * 0.3;
        const ry = depth / 2 + Math.cos(angle * 2) * irregularFactor * 0.3;
        const px = Math.cos(angle) * rx;
        const py = Math.sin(angle) * ry;
        if (i === 0) bottomShape.moveTo(px, py);
        else bottomShape.lineTo(px, py);
    }
    
    const bottomGeo = new THREE.ShapeGeometry(bottomShape);
    const bottomMat = new THREE.MeshStandardMaterial({
        color: 0x2E5A3A,
        roughness: 0.9
    });
    const bottom = new THREE.Mesh(bottomGeo, bottomMat);
    bottom.rotation.x = -Math.PI / 2; // Y→Z 旋转
    bottom.position.set(x, 0.02, z);   // 放在池塘世界坐标
    groundGroup.add(bottom);
    
    // 水面 - 椭圆形
    const waterShape = new THREE.Shape();
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const rx = width / 2 * 0.85 + Math.sin(angle * 3) * irregularFactor * 0.25;
        const ry = depth / 2 * 0.85 + Math.cos(angle * 2) * irregularFactor * 0.25;
        const px = Math.cos(angle) * rx;
        const py = Math.sin(angle) * ry;
        if (i === 0) waterShape.moveTo(px, py);
        else waterShape.lineTo(px, py);
    }
    
    const waterGeo = new THREE.ShapeGeometry(waterShape);
    const waterMat = new THREE.MeshStandardMaterial({
        color: 0x5DADE2,
        roughness: 0.15,
        metalness: 0.25,
        transparent: true,
        opacity: 0.88
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2; // Y→Z 旋转
    water.position.set(x, 0.03, z);   // 放在池塘世界坐标
    groundGroup.add(water);
    
    // 边缘石头 - 椭圆形分布（使用世界坐标，正确）
    for (let i = 0; i < stoneCount; i++) {
        const angle = (i / stoneCount) * Math.PI * 2;
        const rx = width / 2 + 0.2 + Math.sin(angle * 3) * irregularFactor * 0.5;
        const rz = depth / 2 + 0.2 + Math.cos(angle * 2) * irregularFactor * 0.5;
        
        const sx = x + Math.cos(angle) * rx;
        const sz = z + Math.sin(angle) * rz;
        
        const stoneGeo = new THREE.SphereGeometry(0.12 + Math.random() * 0.12, 6, 5);
        const stoneColor = new THREE.Color().lerpColors(
            new THREE.Color(0x78909C),
            new THREE.Color(0x607D8B),
            Math.random()
        );
        const stoneMat = new THREE.MeshStandardMaterial({
            color: stoneColor,
            roughness: 0.85
        });
        const stone = new THREE.Mesh(stoneGeo, stoneMat);
        stone.position.set(sx, 0.025, sz);
        stone.scale.y = 0.45 + Math.random() * 0.15;
        stone.rotation.y = Math.random() * Math.PI;
        stone.castShadow = true;
        stone.receiveShadow = true;
        groundGroup.add(stone);
    }
    
    // 荷叶和荷花 - 椭圆形分布，确保在水面范围内
    const waterRadiusX = width / 2 * 0.75;
    const waterRadiusZ = depth / 2 * 0.75;
    
    for (let i = 0; i < lilyCount; i++) {
        const angle = (i / lilyCount) * Math.PI * 2 + Math.random() * 0.5;
        // 荷叶在水面椭圆范围内
        const maxR = Math.min(waterRadiusX, waterRadiusZ) * 0.8;
        const minR = maxR * 0.3;
        const r = minR + Math.random() * (maxR - minR);
        const lx = x + Math.cos(angle) * r;
        const lz = z + Math.sin(angle) * r * (waterRadiusZ / waterRadiusX);
        
        // 荷叶 - 紧贴水面
        const lilyGeo = new THREE.CircleGeometry(0.22 + Math.random() * 0.12, 12);
        const lilyMat = new THREE.MeshStandardMaterial({
            color: 0x2E7D32,
            roughness: 0.7,
            side: THREE.DoubleSide
        });
        const lily = new THREE.Mesh(lilyGeo, lilyMat);
        lily.rotation.x = -Math.PI / 2;
        lily.rotation.z = Math.random() * Math.PI;
        // 荷叶正好在水面上方
        lily.position.set(lx, 0.035, lz);
        groundGroup.add(lily);
        
        // 荷花 - 从荷叶中间长出
        const flowerGeo = new THREE.SphereGeometry(0.08, 8, 6);
        flowerGeo.scale(0.6, 1, 0.4);
        const flowerColor = Math.random() > 0.5 ? 0xFF80AB : 0xFFB6C1;
        const flowerMat = new THREE.MeshStandardMaterial({
            color: flowerColor,
            roughness: 0.4
        });
        const flower = new THREE.Mesh(flowerGeo, flowerMat);
        // 荷花从荷叶上方长出
        flower.position.set(lx, 0.1, lz);
        flower.castShadow = true;
        groundGroup.add(flower);
    }
    
    // 记录池塘边界
    window.pondBounds.push({
        x: x,
        z: z,
        width: width,
        depth: depth
    });
}

// 创建连接池塘的水渠 - 从池塘边缘连接到边缘
function createWaterChannel(pond1, pond2) {
    const channelMat = new THREE.MeshStandardMaterial({
        color: 0x5DADE2,
        roughness: 0.2,
        metalness: 0.2,
        transparent: true,
        opacity: 0.85
    });
    
    // 计算两个池塘边缘连接点之间的角度
    const dx = pond2.x - pond1.x;
    const dz = pond2.z - pond1.z;
    const angle = Math.atan2(dz, dx); // 从 pond1 指向 pond2 的水平角度
    
    // 使用连接方向上的边缘距离
    const edge1R = Math.min(pond1.width, pond1.depth) / 2 * 0.75;
    const edge2R = Math.min(pond2.width, pond2.depth) / 2 * 0.75;
    
    // 池塘1边缘点（沿着 angle 方向）
    const x1 = pond1.x + Math.cos(angle) * edge1R;
    const z1 = pond1.z + Math.sin(angle) * edge1R;
    
    // 池塘2边缘点（沿着 -angle 方向）
    const x2 = pond2.x - Math.cos(angle) * edge2R;
    const z2 = pond2.z - Math.sin(angle) * edge2R;
    
    const cdx = x2 - x1;
    const cdz = z2 - z1;
    const length = Math.sqrt(cdx * cdx + cdz * cdz);
    
    // 水渠主体
    // PlaneGeometry 默认在 XY 平面，宽沿 local +X 方向
    // rotateX(-PI/2): XY → XZ，local +X 仍在 X 轴
    // rotateY(angle): local +X 绕 Y 轴旋转到 world (+cos(angle), 0, +sin(angle))
    // 这正是我们想要的水渠方向
    const channelGeo = new THREE.PlaneGeometry(0.7, length);
    const channel = new THREE.Mesh(channelGeo, channelMat);
    
    channel.rotation.x = -Math.PI / 2;  // XY → XZ（与地面平行）
    channel.rotation.y = angle;          // 对准连接方向
    channel.position.set((x1 + x2) / 2, 0.025, (z1 + z2) / 2);
    groundGroup.add(channel);
    
    // 水渠边缘小石头
    const stoneCount = Math.floor(length / 1.5);
    for (let i = 0; i < stoneCount; i++) {
        const t = (i + 0.5) / stoneCount;
        const cx = x1 + cdx * t;
        const cz = z1 + cdz * t;
        
        // 两侧各放一块石头（垂直于水渠方向）
        for (let side = -1; side <= 1; side += 2) {
            const perpAngle = Math.PI / 2 - angle;
            const perpX = Math.cos(perpAngle) * 0.45 * side;
            const perpZ = Math.sin(perpAngle) * 0.45 * side;
            
            const stoneGeo = new THREE.SphereGeometry(0.06 + Math.random() * 0.06, 5, 4);
            const stoneColor = new THREE.Color().lerpColors(
                new THREE.Color(0x90A4AE),
                new THREE.Color(0x78909C),
                Math.random()
            );
            const stoneMat = new THREE.MeshStandardMaterial({
                color: stoneColor,
                roughness: 0.88
            });
            const stone = new THREE.Mesh(stoneGeo, stoneMat);
            stone.position.set(cx + perpX, 0.018, cz + perpZ);
            stone.scale.y = 0.4;
            groundGroup.add(stone);
        }
    }
}

// 创建花园小径
function createGardenPaths() {
    // 小径颜色 - 柔和浅灰色
    const pathColor = 0xD4CCC8;
    const pathMat = new THREE.MeshStandardMaterial({
        color: pathColor,
        roughness: 0.9,
        metalness: 0.0
    });
    
    const cellSize = CONFIG.cellSize; // 10米
    const pathWidth = CONFIG.pathWidth; // 1米
    const step = cellSize + pathWidth; // 11米（花园+小径）
    
    // 水平小径 (行之间)
    for (let row = 0; row < 4; row++) {
        const z = (row - 1) * step + cellSize / 2 + pathWidth / 2;
        const pathLength = 5 * step + cellSize / 2;
        
        const pathGeo = new THREE.PlaneGeometry(pathLength, pathWidth);
        const path = new THREE.Mesh(pathGeo, pathMat);
        path.rotation.x = -Math.PI / 2;
        path.position.set(0, 0.012, z);
        path.receiveShadow = true;
        groundGroup.add(path);
    }
    
    // 垂直小径 (列之间)
    for (let col = 0; col < 5; col++) {
        const x = (col - 2) * step + cellSize / 2 + pathWidth / 2;
        const pathLength = 2 * step + cellSize / 2;
        
        const pathGeo = new THREE.PlaneGeometry(pathWidth, pathLength);
        const path = new THREE.Mesh(pathGeo, pathMat);
        path.rotation.x = -Math.PI / 2;
        path.position.set(x, 0.012, 0);
        path.receiveShadow = true;
        groundGroup.add(path);
    }
    
    // 在小径上添加一些柔和灰色石头装饰
    const stoneCount = 35;
    
    for (let i = 0; i < stoneCount; i++) {
        const isHorizontal = Math.random() > 0.5;
        let sx, sz;
        
        if (isHorizontal) {
            const row = Math.floor(Math.random() * 4);
            sz = (row - 1) * step + cellSize / 2 + pathWidth / 2 + (Math.random() - 0.5) * 0.2;
            sx = (Math.random() - 0.5) * 60;
        } else {
            const col = Math.floor(Math.random() * 5);
            sx = (col - 2) * step + cellSize / 2 + pathWidth / 2 + (Math.random() - 0.5) * 0.2;
            sz = (Math.random() - 0.5) * 50;
        }
        
        const stoneGeo = new THREE.SphereGeometry(0.04 + Math.random() * 0.08, 5, 4);
        const stoneColor = new THREE.Color().lerpColors(
            new THREE.Color(0xB0A0A0),
            new THREE.Color(0xC8BEB8),
            Math.random()
        );
        const stoneMat = new THREE.MeshStandardMaterial({
            color: stoneColor,
            roughness: 0.88
        });
        const stone = new THREE.Mesh(stoneGeo, stoneMat);
        stone.position.set(sx, 0.012, sz);
        stone.scale.y = 0.4;
        stone.receiveShadow = true;
        groundGroup.add(stone);
    }
}

// ===== Flower Generation - 更茂盛的花园 =====
function createFlowersAndPlants() {
    const groupedVocab = {};
    for (const item of vocabData) {
        if (!groupedVocab[item.category]) groupedVocab[item.category] = [];
        groupedVocab[item.category].push(item);
    }

    for (const [category, items] of Object.entries(groupedVocab)) {
        const catConfig = CONFIG.categories[category];
        if (!catConfig) continue;

        // 地块中心位置
        const centerX = (catConfig.pos[0] - 2) * (CONFIG.cellSize + CONFIG.pathWidth);
        const centerZ = (catConfig.pos[1] - 1.5) * (CONFIG.cellSize + CONFIG.pathWidth);
        
        const minR = CONFIG.flowerMinRadius;
        const maxR = CONFIG.flowerMaxRadius;

        // 添加额外的装饰性植物（没有词汇数据但增加丰盛感）
        const extraPlants = 8 + Math.floor(Math.random() * 5);
        
        // 为每个词汇创建花朵
        items.forEach((vocabItem, idx) => {
            let angle = idx * 2.39996 + (idx % 4) * 0.3;
            let radiusNorm = (idx + 0.5) / Math.max(items.length, 1);
            let radius = minR + radiusNorm * (maxR - minR) * (0.3 + Math.random() * 1.4);
            
            const border = 0.5;
            const maxAllowedR = maxR - border;
            radius = Math.min(radius, maxAllowedR);
            
            let x = centerX + Math.cos(angle) * radius;
            let z = centerZ + Math.sin(angle) * radius;
            
            // 池塘避让
            if (window.pondBounds && isInAnyPond(x, z, 0.5)) {
                // 找到最近的池塘并移开
                for (const pb of window.pondBounds) {
                    const dx = x - pb.x;
                    const dz = z - pb.z;
                    if (Math.abs(dx) < pb.width/2 + 0.5 && Math.abs(dz) < pb.depth/2 + 0.5) {
                        const pushAngle = Math.atan2(dz, dx);
                        const pushDist = Math.max(pb.width, pb.depth) / 2 + 1.5;
                        x = pb.x + Math.cos(pushAngle) * pushDist;
                        z = pb.z + Math.sin(pushAngle) * pushDist;
                        
                        const halfBed = CONFIG.cellSize / 2 - 0.5;
                        const relX = x - centerX;
                        const relZ = z - centerZ;
                        const dist = Math.sqrt(relX*relX + relZ*relZ);
                        if (dist > halfBed) {
                            x = centerX + (relX / dist) * halfBed;
                            z = centerZ + (relZ / dist) * halfBed;
                        }
                        break;
                    }
                }
            }

            const type = getFlowerTypeForCategory(category);
            const mesh = createFlower(type, catConfig.color, 70);
            mesh.userData.isFlower = true;

            const scale = CONFIG.flowerBaseScale + (Math.random() - 0.5) * CONFIG.flowerScaleRange;
            mesh.scale.setScalar(scale);
            mesh.rotation.y = Math.random() * Math.PI * 2;
            mesh.position.set(x, 0, z);
            
            const entry = {
                mesh: mesh,
                data: vocabItem,
                category: category,
                type: type,
                baseY: 0,
                phaseOffset: Math.random() * Math.PI * 2,
                targetScale: scale,
                isFlowerType: mesh.userData.isFlower
            };
            
            flowerMeshes.push(entry);
            scene.add(mesh);
            mesh.scale.setScalar(0.001);
        });
        
        // 添加额外的装饰性植物和灌木
        for (let i = 0; i < extraPlants; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 1 + Math.random() * (maxR - 1.5);
            const x = centerX + Math.cos(angle) * radius;
            const z = centerZ + Math.sin(angle) * radius;
            
            // 池塘避让
            if (window.pondBounds && isInAnyPond(x, z, 1)) continue;
            
            const plantType = ['fern', 'bush', 'grassClump', 'herb', 'lavender'][Math.floor(Math.random() * 5)];
            const mesh = createPlant(plantType, catConfig.color, 60);
            mesh.userData.isFlower = false;
            
            const scale = 0.6 + Math.random() * 0.6;
            mesh.scale.setScalar(scale);
            mesh.rotation.y = Math.random() * Math.PI * 2;
            mesh.position.set(x, 0, z);
            
            scene.add(mesh);
        }
    }
    
    // 添加地被植物覆盖地面
    createGroundCover();
}

// Flower types for kids - fun and colorful
function getFlowerTypeForCategory(category) {
    const types = {
        'Electronics': ['sunflower', 'daisy', 'tulip'],
        'Furniture': ['rose', 'peony', 'daisy'],
        'Toiletries': ['rose', 'carnation', 'peony'],
        'Tableware': ['daisy', 'bluebell', 'tulip'],
        'Plants': ['sunflower', 'rose', 'lavender'],
        'Vehicles': ['rose', 'carnation', 'zinnia'],
        'Weather': ['bluebell', 'hydrangea', 'iris'],
        'Animals': ['sunflower', 'daisy', 'marigold'],
        'Fruits & Veg': ['rose', 'peony', 'zinnia'],
        'Food': ['carnation', 'rose', 'chrysanthemum'],
        'Clothing': ['rose', 'peony', 'dahlia'],
        'Body Parts': ['lavender', 'lilac', 'iris'],
        'Balls': ['sunflower', 'daisy', 'marigold'],
        'Actions': ['lavender', 'lilac', 'bluebell'],
        'Shapes': ['daisy', 'sunflower', 'iris'],
        'Playground': ['rose', 'hydrangea', 'dahlia'],
        'Holidays': ['rose', 'carnation', 'chrysanthemum'],
        'Public Places': ['lavender', 'lilac', 'iris'],
        'Adjectives': ['bluebell', 'hydrangea', 'iris'],
        'Others': ['daisy', 'lavender', 'iris']
    };
    const arr = types[category] || ['daisy'];
    return arr[Math.floor(Math.random() * arr.length)];
}

function getPlantTypeForCategory(category) {
    const types = {
        'Electronics': ['fern', 'bush'],
        'Furniture': ['fern', 'herb'],
        'Toiletries': ['fern', 'succulent'],
        'Tableware': ['grassClump', 'herb'],
        'Plants': ['fern', 'bush', 'palm'],
        'Vehicles': ['bush', 'grassClump'],
        'Weather': ['bush', 'fern'],
        'Animals': ['fern', 'bush'],
        'Fruits & Veg': ['herb', 'fern'],
        'Food': ['herb', 'grassClump'],
        'Clothing': ['fern', 'succulent'],
        'Body Parts': ['grassClump', 'herb'],
        'Balls': ['bush', 'fern'],
        'Actions': ['grassClump', 'fern'],
        'Shapes': ['succulent', 'herb'],
        'Playground': ['bush', 'fern'],
        'Holidays': ['fern', 'bush'],
        'Public Places': ['grassClump', 'herb'],
        'Adjectives': ['succulent', 'fern'],
        'Others': ['grassClump', 'herb']
    };
    const arr = types[category] || ['fern'];
    return arr[Math.floor(Math.random() * arr.length)];
}

// Flower and Plant creation functions - 更茂盛的花朵
function createFlower(type, baseColor, heat) {
    const group = new THREE.Group();
    const color = new THREE.Color(baseColor);

    // 细长的茎（为原来的三分之一）
    const stemHeight = 2.0 + Math.random() * 1.2;
    const stemThickness = 0.01 + Math.random() * 0.007; // 更细的茎
    const shouldBend = Math.random() > 0.6; // 60%的花茎会弯曲
    
    if (shouldBend) {
        // 弯曲的茎 - 修复连接问题
        const bendAngle = (Math.random() - 0.5) * 0.4;
        const bendHeight = stemHeight * (0.35 + Math.random() * 0.35);
        
        const stemMat = new THREE.MeshStandardMaterial({ 
            color: 0x5D8A4A, 
            roughness: 0.7,
            metalness: 0.02
        });
        
        // 用单根连续圆柱实现弯曲效果（使用更多分段）
        const stemSegments = 12;
        const stemGeo = new THREE.CylinderGeometry(
            stemThickness * 0.9, 
            stemThickness * 1.3, 
            stemHeight, 
            6,
            stemSegments,
            false
        );
        
        // 重新计算顶点以形成平滑曲线
        const positions = stemGeo.attributes.position;
        for (let i = 0; i <= stemSegments; i++) {
            const t = i / stemSegments;
            const y = t * stemHeight;
            
            // 弯曲公式：只在 bendHeight 以上开始弯曲
            let bendFactor = 0;
            if (y > bendHeight * 0.3) {
                bendFactor = Math.sin((y - bendHeight * 0.3) / (stemHeight - bendHeight * 0.3) * Math.PI / 2);
            }
            
            const bendOffset = bendFactor * Math.sin(bendAngle) * (stemHeight - bendHeight);
            positions.setX(i, bendOffset);
            positions.setZ(i, 0);
        }
        stemGeo.computeVertexNormals();
        
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.y = 0;
        stem.castShadow = true;
        group.add(stem);
        
        // 叶子从茎上长出
        const leafCount = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < leafCount; i++) {
            const leaf = createLeaf(color, stemHeight);
            const leafY = stemHeight * (0.08 + i * 0.2);
            leaf.position.y = leafY;
            
            // 计算该位置的弯曲偏移
            let bendFactor = 0;
            if (leafY > bendHeight * 0.3) {
                bendFactor = Math.sin((leafY - bendHeight * 0.3) / (stemHeight - bendHeight * 0.3) * Math.PI / 2);
            }
            leaf.position.x = bendFactor * Math.sin(bendAngle) * (stemHeight - bendHeight);
            
            leaf.rotation.z = (Math.random() - 0.5) * 0.6 + 0.15;
            leaf.rotation.y = (i / leafCount) * Math.PI * 2 + Math.random() * 0.5;
            leaf.castShadow = true;
            group.add(leaf);
        }
        
        // 花头在茎顶端
        const flowerHead = createFlowerHead(type, color, heat);
        let finalBend = 0;
        if (stemHeight > bendHeight * 0.3) {
            finalBend = Math.sin((stemHeight - bendHeight * 0.3) / (stemHeight - bendHeight * 0.3) * Math.PI / 2);
        }
        flowerHead.position.set(finalBend * Math.sin(bendAngle) * (stemHeight - bendHeight), stemHeight, 0);
        flowerHead.rotation.z = bendAngle * 0.4;
        group.add(flowerHead);
        
        group.userData.stemHeight = stemHeight;
        group.userData.flowerHead = flowerHead;
    } else {
        // 直茎
        const stemGeo = new THREE.CylinderGeometry(stemThickness, stemThickness * 1.5, stemHeight, 6);
        const stemMat = new THREE.MeshStandardMaterial({ 
            color: 0x5D8A4A, 
            roughness: 0.7,
            metalness: 0.02
        });
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.y = stemHeight / 2;
        stem.castShadow = true;
        group.add(stem);

        // 茂盛的叶子
        const leafCount = 4 + Math.floor(Math.random() * 4);
        for (let i = 0; i < leafCount; i++) {
            const leaf = createLeaf(color, stemHeight);
            const leafY = stemHeight * (0.1 + i * 0.18);
            leaf.position.y = leafY;
            leaf.rotation.z = (Math.random() - 0.5) * 0.7 + 0.2;
            leaf.rotation.y = (i / leafCount) * Math.PI * 2 + Math.random() * 0.5;
            leaf.castShadow = true;
            group.add(leaf);
        }

        const flowerHead = createFlowerHead(type, color, heat);
        flowerHead.position.y = stemHeight;
        group.add(flowerHead);

        group.userData.stemHeight = stemHeight;
        group.userData.flowerHead = flowerHead;
    }
    
    return group;
}

function createLeaf(baseTint, stemHeight) {
    const shape = new THREE.Shape();
    // 叶子大小0.35-0.65
    const leafLength = 0.35 + Math.random() * 0.3;
    const leafWidth = 0.14 + Math.random() * 0.07;
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(leafWidth * 0.8, leafLength * 0.25, leafLength, 0);
    shape.quadraticCurveTo(leafWidth * 0.8, -leafLength * 0.25, 0, -0.05);
    shape.quadraticCurveTo(-leafWidth * 0.3, 0, 0, 0);

    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.006,
        bevelEnabled: false
    });
    const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().lerpColors(new THREE.Color(0x388E3C), baseTint, 0.3),
        roughness: 0.7,
        side: THREE.DoubleSide
    });
    return new THREE.Mesh(geo, mat);
}

function createFlowerHead(type, color, heat) {
    const headGroup = new THREE.Group();
    
    switch(type) {
        case 'rose': createRoseHead(headGroup, color, heat); break;
        case 'sunflower': createSunflowerHead(headGroup, color, heat); break;
        case 'lavender': createLavenderHead(headGroup, color, heat); break;
        case 'tulip': createTulipHead(headGroup, color, heat); break;
        case 'bluebell': createBluebellHead(headGroup, color, heat); break;
        case 'hydrangea': createHydrangeaHead(headGroup, color, heat); break;
        case 'iris': createIrisHead(headGroup, color, heat); break;
        case 'daisy': createDaisyHead(headGroup, color, heat); break;
        case 'peony': createPeonyHead(headGroup, color, heat); break;
        case 'carnation': createCarnationHead(headGroup, color, heat); break;
        case 'lilac': createLilacHead(headGroup, color, heat); break;
        case 'marigold': createMarigoldHead(headGroup, color, heat); break;
        case 'zinnia': createZinniaHead(headGroup, color, heat); break;
        case 'chrysanthemum': createChrysanthemumHead(headGroup, color, heat); break;
        case 'dahlia': createDahliaHead(headGroup, color, heat); break;
        default: createDaisyHead(headGroup, color, heat);
    }
    
    return headGroup;
}

// Simplified flower head builders - 更大的花头
function createRoseHead(group, color, heat) {
    const petalCount = 16 + Math.floor(heat / 8);
    const layers = 4;
    
    for (let layer = 0; layer < layers; layer++) {
        const layerPetals = petalCount - layer * 3;
        const layerScale = 1 - layer * 0.18;
        const layerY = layer * 0.1;
        
        for (let i = 0; i < layerPetals; i++) {
            const angle = (i / layerPetals) * Math.PI * 2 + layer * 0.3;
            const petalGeo = new THREE.SphereGeometry(0.18 * layerScale, 8, 6);
            petalGeo.scale(0.6, 1.2, 0.4);
            
            const petalColor = color.clone();
            petalColor.offsetHSL(0, 0, (layer * 0.05) - 0.03);
            
            const petalMat = new THREE.MeshStandardMaterial({
                color: petalColor,
                roughness: 0.35,
                metalness: 0.1,
                emissive: petalColor.clone().multiplyScalar(0.12)
            });
            const petal = new THREE.Mesh(petalGeo, petalMat);
            
            petal.position.set(
                Math.cos(angle) * 0.1 * layer,
                layerY,
                Math.sin(angle) * 0.1 * layer
            );
            petal.lookAt(0, layerY + 0.5, 0);
            petal.castShadow = true;
            group.add(petal);
        }
    }
    
    const centerGeo = new THREE.SphereGeometry(0.12, 10, 8);
    const centerMat = new THREE.MeshStandardMaterial({
        color: 0xFFD54F,
        roughness: 0.45,
        emissive: 0xFFD54F,
        emissiveIntensity: 0.3
    });
    const center = new THREE.Mesh(centerGeo, centerMat);
    center.position.y = layers * 0.1;
    group.add(center);
}

function createSunflowerHead(group, color, heat) {
    const petalCount = 18;
    
    for (let i = 0; i < petalCount; i++) {
        const angle = (i / petalCount) * Math.PI * 2;
        const petalGeo = new THREE.ConeGeometry(0.05, 0.45, 6);
        petalGeo.translate(0, 0.22, 0);
        
        const petalMat = new THREE.MeshStandardMaterial({
            color: 0xFFD54F,
            roughness: 0.45,
            emissive: 0xFFD54F,
            emissiveIntensity: 0.15
        });
        const petal = new THREE.Mesh(petalGeo, petalMat);
        petal.position.set(Math.cos(angle) * 0.2, 0, Math.sin(angle) * 0.2);
        petal.rotation.z = Math.PI / 2 - (Math.random() - 0.5) * 0.3;
        petal.rotation.y = angle;
        petal.castShadow = true;
        group.add(petal);
    }
    
    const diskGeo = new THREE.CylinderGeometry(0.18, 0.15, 0.12, 24);
    const diskMat = new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 0.85 });
    const disk = new THREE.Mesh(diskGeo, diskMat);
    disk.position.y = 0.15;
    disk.castShadow = true;
    group.add(disk);
}

function createLavenderHead(group, color, heat) {
    const stalkCount = 6 + Math.floor(heat / 20);
    
    for (let s = 0; s < stalkCount; s++) {
        const height = 0.25 + Math.random() * 0.2;
        const x = (s - stalkCount/2) * 0.035 + (Math.random()-0.5) * 0.02;
        const z = (Math.random() - 0.5) * 0.03;
        
        const stalkGeo = new THREE.CylinderGeometry(0.006, 0.012, height, 5);
        const stalkMat = new THREE.MeshStandardMaterial({ color: 0x689F38, roughness: 0.8 });
        const stalk = new THREE.Mesh(stalkGeo, stalkMat);
        stalk.position.set(x, height/2, z);
        group.add(stalk);
        
        const floretCount = 5 + Math.floor(height * 10);
        for (let f = 0; f < floretCount; f++) {
            const t = f / floretCount;
            const fy = t * height * 0.7 + height * 0.1;
            const fr = 0.02 * (1 - t * 0.3);
            
            const floretGeo = new THREE.SphereGeometry(fr, 5, 4);
            const floretColor = color.clone().offsetHSL(0, 0, (Math.random()-0.5)*0.06);
            const floretMat = new THREE.MeshStandardMaterial({
                color: floretColor,
                roughness: 0.6,
                emissive: floretColor.clone().multiplyScalar(0.1)
            });
            const floret = new THREE.Mesh(floretGeo, floretMat);
            floret.position.set(x + (Math.random()-0.5)*0.01, fy, z + (Math.random()-0.5)*0.01);
            group.add(floret);
        }
    }
}

function createTulipHead(group, color, heat) {
    const petalCount = 6;
    for (let i = 0; i < petalCount; i++) {
        const angle = (i / petalCount) * Math.PI * 2;
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.quadraticCurveTo(0.1, 0.06, 0.08, 0.28);
        shape.quadraticCurveTo(0.05, 0.42, 0, 0.45);
        shape.quadraticCurveTo(-0.05, 0.42, -0.08, 0.28);
        shape.quadraticCurveTo(-0.1, 0.06, 0, 0);
        
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: false });
        const mat = new THREE.MeshStandardMaterial({
            color: color.clone().offsetHSL(0.02*i, 0, (i%2)*0.04-0.02),
            roughness: 0.3,
            side: THREE.DoubleSide,
            emissive: color.clone().multiplyScalar(0.08)
        });
        const petal = new THREE.Mesh(geo, mat);
        petal.position.set(Math.cos(angle)*0.025, 0, Math.sin(angle)*0.025);
        petal.rotation.y = angle;
        petal.rotation.x = (i % 2 === 0 ? 0.15 : -0.15);
        petal.castShadow = true;
        group.add(petal);
    }
}

function createBluebellHead(group, color, heat) {
    const bellCount = 4 + Math.floor(heat / 25);
    for (let b = 0; b < bellCount; b++) {
        const angle = (b / bellCount) * Math.PI * 2;
        const bellGeo = new THREE.SphereGeometry(0.08, 7, 5);
        bellGeo.scale(0.8, 1.3, 0.8);
        
        const bellColor = color.clone().offsetHSL(0, 0.04*b, 0);
        const mat = new THREE.MeshStandardMaterial({
            color: bellColor,
            roughness: 0.35,
            emissive: bellColor.clone().multiplyScalar(0.15),
            transparent: true,
            opacity: 0.9
        });
        const bell = new THREE.Mesh(bellGeo, mat);
        const r = 0.05 + (b % 2) * 0.03;
        bell.position.set(Math.cos(angle)*r, 0.06 + b*0.025, Math.sin(angle)*r);
        bell.rotation.x = -0.25;
        group.add(bell);
    }
}

function createHydrangeaHead(group, color, heat) {
    const clusterCount = 30 + Math.floor(heat / 3);
    for (let c = 0; c < clusterCount; c++) {
        const phi = Math.acos(1 - 2*(c+0.5)/clusterCount);
        const theta = Math.PI * (1+Math.sqrt(5)) * c;
        
        const r = 0.22 + Math.random() * 0.06;
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta) + 0.15;
        const z = r * Math.cos(phi);
        
        const size = 0.03 + Math.random() * 0.02;
        const floretGeo = new THREE.SphereGeometry(size, 5, 4);
        floretGeo.scale(1.1, 0.5, 1.1);
        
        const floretColor = color.clone().offsetHSL((Math.random()-0.5)*0.05, (Math.random()-0.5)*0.08, (Math.random()-0.5)*0.06);
        const mat = new THREE.MeshStandardMaterial({
            color: floretColor,
            roughness: 0.5,
            emissive: floretColor.clone().multiplyScalar(0.06)
        });
        const floret = new THREE.Mesh(floretGeo, mat);
        floret.position.set(x, y, z);
        group.add(floret);
    }
}

function createIrisHead(group, color, heat) {
    for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2 + Math.PI / 6;
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.bezierCurveTo(0.05, 0.04, 0.07, 0.15, 0, 0.25);
        shape.bezierCurveTo(-0.07, 0.15, -0.05, 0.04, 0, 0);
        
        const geo = new THREE.ShapeGeometry(shape);
        const mat = new THREE.MeshStandardMaterial({
            color: color.clone(),
            roughness: 0.3,
            side: THREE.DoubleSide,
            emissive: color.clone().multiplyScalar(0.08)
        });
        const petal = new THREE.Mesh(geo, mat);
        petal.position.set(Math.cos(angle)*0.025, 0, Math.sin(angle)*0.025);
        petal.rotation.y = angle;
        petal.rotation.x = -0.35;
        group.add(petal);
    }
    
    for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2;
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.bezierCurveTo(0.07, -0.02, 0.08, -0.15, 0.015, -0.22);
        shape.bezierCurveTo(-0.05, -0.15, -0.07, -0.02, 0, 0);
        
        const geo = new THREE.ShapeGeometry(shape);
        const darkerColor = color.clone().offsetHSL(0, 0.08, -0.08);
        const mat = new THREE.MeshStandardMaterial({
            color: darkerColor,
            roughness: 0.35,
            side: THREE.DoubleSide
        });
        const petal = new THREE.Mesh(geo, mat);
        petal.position.set(Math.cos(angle)*0.05, 0.04, Math.sin(angle)*0.05);
        petal.rotation.y = angle;
        petal.rotation.x = 0.5;
        group.add(petal);
    }
}

function createDaisyHead(group, color, heat) {
    const petalCount = 14 + Math.floor(heat / 10);
    for (let i = 0; i < petalCount; i++) {
        const angle = (i / petalCount) * Math.PI * 2;
        const petalGeo = new THREE.ConeGeometry(0.035, 0.3, 4);
        petalGeo.translate(0, 0.15, 0);
        const mat = new THREE.MeshStandardMaterial({
            color: 0xFFFFFF,
            roughness: 0.35,
            emissive: 0xFFFFEE,
            emissiveIntensity: 0.12
        });
        const petal = new THREE.Mesh(petalGeo, mat);
        petal.position.set(Math.cos(angle)*0.12, 0, Math.sin(angle)*0.12);
        petal.rotation.z = Math.PI/2;
        petal.rotation.y = angle;
        petal.castShadow = true;
        group.add(petal);
    }
    const centerGeo = new THREE.SphereGeometry(0.12, 12, 10);
    const centerMat = new THREE.MeshStandardMaterial({
        color: 0xFFD54F,
        roughness: 0.45,
        emissive: 0xFFD54F,
        emissiveIntensity: 0.25
    });
    const center = new THREE.Mesh(centerGeo, centerMat);
    center.position.y = 0.06;
    center.castShadow = true;
    group.add(center);
}

function createPeonyHead(group, color, heat) {
    const totalPetals = 16 + Math.floor(heat / 7);
    for (let p = 0; p < totalPetals; p++) {
        const layer = Math.floor(p / 6);
        const angle = (p / totalPetals) * Math.PI * 3.5 + layer * 0.4;
        const scale = (1 - layer * 0.18) * (0.1 + Math.random() * 0.05);
        const y = layer * 0.05;
        
        const petalGeo = new THREE.SphereGeometry(scale, 7, 5);
        petalGeo.scale(0.5, 1.1, 0.35);
        
        const pc = color.clone().offsetHSL(layer*0.015, 0, layer*0.02 - 0.01);
        const mat = new THREE.MeshStandardMaterial({
            color: pc,
            roughness: 0.35,
            emissive: pc.clone().multiplyScalar(0.06)
        });
        const petal = new THREE.Mesh(petalGeo, mat);
        petal.position.set(Math.cos(angle) * 0.05 * (layer + 1), y, Math.sin(angle) * 0.05 * (layer + 1));
        petal.lookAt(0, y + 0.5, 0);
        group.add(petal);
    }
}

function createCarnationHead(group, color, heat) {
    const petalCount = 14 + Math.floor(heat/8);
    for (let p = 0; p < petalCount; p++) {
        const angle = (p/petalCount) * Math.PI * 2;
        const layer = p % 3;
        const scale = 0.11 - layer * 0.025;
        const y = layer * 0.04;
        
        const pts = [];
        for (let j=0; j<=6; j++) {
            const t=j/6;
            const rx=Math.cos(t*Math.PI*2.5)*0.018*scale*4;
            pts.push(new THREE.Vector2(rx, t*scale*1.8));
        }
        const shape = new THREE.Shape(pts);
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false });
        
        const pc = color.clone().offsetHSL(0, -layer*0.02, layer*0.015);
        const mat = new THREE.MeshStandardMaterial({ color: pc, roughness: 0.45, side:THREE.DoubleSide });
        const petal = new THREE.Mesh(geo, mat);
        petal.position.set(Math.cos(angle)*(0.025+layer*0.025), y, Math.sin(angle)*(0.025+layer*0.025));
        petal.rotation.y = angle;
        petal.rotation.x = -0.15 + (p%2)*0.12;
        group.add(petal);
    }
}

function createLilacHead(group, color, heat) {
    const count = 20 + Math.floor(heat/4);
    for (let i=0; i<count; i++) {
        const theta = i * 137.5 * Math.PI/180;
        const phi = Math.acos(1-2*(i+0.5)/(count+count*0.25));
        const r = 0.12 + Math.random()*0.09;
        
        const x = r*Math.sin(phi)*Math.cos(theta);
        const y = r*Math.sin(phi)*Math.sin(theta)+0.12;
        const z = r*Math.cos(phi);
        
        const geo = new THREE.ConeGeometry(0.015, 0.05, 5);
        const pc = color.clone().offsetHSL((Math.random()-0.5)*0.04, (Math.random()-0.5)*0.06, 0);
        const mat = new THREE.MeshStandardMaterial({
            color: pc, roughness: 0.45, emissive: pc.clone().multiplyScalar(0.1)
        });
        const floret = new THREE.Mesh(geo, mat);
        floret.position.set(x,y,z);
        floret.rotation.x = Math.random()*0.4;
        group.add(floret);
    }
}

function createMarigoldHead(group, color, heat) {
    const rings = 3;
    for (let ring=0; ring<rings; ring++) {
        const n = 8 - ring*2;
        for(let i=0;i<n;i++){
            const angle=(i/n)*Math.PI*2+ring*0.3;
            const r=0.05+ring*0.06;
            
            const shape=new THREE.Shape();
            shape.moveTo(0,0);
            shape.quadraticCurveTo(0.04,0.05,0.03,0.12-ring*0.015);
            shape.quadraticCurveTo(0,0.1,-0.03,0.12-ring*0.015);
            shape.quadraticCurveTo(-0.04,0.05,0,0);
            
            const geo=new THREE.ExtrudeGeometry(shape,{depth:0.005,bevelEnabled:false});
            const c=new THREE.Color(ring<2?0xFF8F00:0xFFC107);
            const mat=new THREE.MeshStandardMaterial({color:c,roughness:0.45,side:THREE.DoubleSide});
            const petal=new THREE.Mesh(geo,mat);
            petal.position.set(Math.cos(angle)*r*0.25,ring*0.03,Math.sin(angle)*r*0.25);
            petal.rotation.y=angle;
            petal.rotation.x=-0.25+(ring%2)*0.15;
            group.add(petal);
        }
    }
}

function createZinniaHead(group, color, heat) {
    for (let ring=0; ring<4; ring++) {
        const n = 6+ring*3;
        for(let i=0;i<n;i++){
            const angle=(i/n)*Math.PI*2+ring*0.35;
            const len=0.16-ring*0.02;
            const w=0.02-ring*0.003;
            
            const geo=new THREE.ConeGeometry(w,len,4);
            geo.translate(0,len/2,0);
            const c=color.clone().offsetHSL(ring*0.025,(ring%2)*0.04,ring*-0.015);
            const mat=new THREE.MeshStandardMaterial({color:c,roughness:0.4});
            const petal=new THREE.Mesh(geo,mat);
            petal.position.set(Math.cos(angle)*(0.035+ring*0.035),0,Math.sin(angle)*(0.035+ring*0.035));
            petal.rotation.z=Math.PI/2;
            petal.rotation.y=angle;
            group.add(petal);
        }
    }
    const cGeo=new THREE.CylinderGeometry(0.05,0.04,0.06,14);
    const cMat=new THREE.MeshStandardMaterial({color:0x5D4037,roughness:0.8});
    const center=new THREE.Mesh(cGeo,cMat);
    center.position.y=0.1;
    group.add(center);
}

function createChrysanthemumHead(group, color, heat) {
    const tubeCount = 45 + Math.floor(heat/3);
    const layers = 3;
    for (let l=0; l<layers; l++) {
        const n = Math.floor(tubeCount/layers) - l*4;
        for (let i=0; i<n; i++) {
            const angle = (i/n)*Math.PI*2*l + l*0.18 + Math.random()*0.08;
            const len = 0.16 - l*0.03 + Math.random()*0.05;
            
            const geo = new THREE.CylinderGeometry(0.006, 0.012, len, 5);
            geo.translate(0, len/2, 0);
            const c = color.clone().offsetHSL(l*0.015, 0, l*-0.01);
            const mat = new THREE.MeshStandardMaterial({color: c, roughness: 0.45});
            const tube = new THREE.Mesh(geo, mat);
            tube.position.set(Math.cos(angle)*(0.015+l*0.035), l*0.03, Math.sin(angle)*(0.015+l*0.035));
            tube.rotation.z = Math.PI/2;
            tube.rotation.y = angle;
            group.add(tube);
        }
    }
    const btnGeo = new THREE.SphereGeometry(0.06, 10, 8);
    const btnMat = new THREE.MeshStandardMaterial({color: 0xFFD54F, roughness: 0.55, emissive:0xFFD54F, emissiveIntensity:0.12});
    const btn = new THREE.Mesh(btnGeo, btnMat);
    btn.position.y = 0.06;
    group.add(btn);
}

function createDahliaHead(group, color, heat) {
    const totalLayers = 4;
    for (let layer=0; layer<totalLayers; layer++) {
        const n = 10 - layer*2;
        for (let i=0; i<n; i++) {
            const angle = (i/n)*Math.PI*2 + layer*0.35;
            const size = 0.13 - layer*0.02;
            
            const shape = new THREE.Shape();
            shape.moveTo(0,0);
            shape.quadraticCurveTo(size*0.35, size*0.25, size*0.12, size*0.85);
            shape.quadraticCurveTo(0, size*0.95, -size*0.12, size*0.85);
            shape.quadraticCurveTo(-size*0.35, size*0.25, 0, 0);
            
            const geo = new THREE.ExtrudeGeometry(shape, {depth:0.005, bevelEnabled:false});
            const c = color.clone().offsetHSL(layer*0.012, (layer%2)*0.04-0.02, layer*0.01-0.008);
            const mat = new THREE.MeshStandardMaterial({color:c, roughness:0.38, side:THREE.DoubleSide, emissive:c.clone().multiplyScalar(0.05)});
            const petal = new THREE.Mesh(geo, mat);
            const pr = 0.025 + layer*0.03;
            petal.position.set(Math.cos(angle)*pr, layer*0.04, Math.sin(angle)*pr);
            petal.rotation.y = angle;
            petal.rotation.x = -0.12 + (layer%2)*0.2;
            group.add(petal);
        }
    }
}

// ===== Plant Generation =====
function createPlant(type, baseColor, heat) {
    const group = new THREE.Group();
    const color = new THREE.Color(baseColor);
    const height = 0.5 + Math.random() * 0.4;

    switch(type) {
        case 'fern': createFern(group, color, height); break;
        case 'palm': createPalm(group, color, height); break;
        case 'bush': createBush(group, color, height); break;
        case 'grassClump': createGrassClump(group, color, height); break;
        case 'herb': createHerb(group, color, height); break;
        case 'succulent': createSucculent(group, color, height); break;
        default: createFern(group, color, height);
    }

    return group;
}

function createFern(group, color, h) {
    const frondCount = 4 + Math.floor(Math.random()*3);
    for (let f=0; f<frondCount; f++) {
        const frondGroup = new THREE.Group();
        const leafletCount = 6 + Math.floor(Math.random()*5);
        
        for (let l=0; l<leafletCount; l++) {
            const t = l / leafletCount;
            const leafletSize = 0.06 * (1 - t*0.4);
            const leafletGeo = new THREE.SphereGeometry(leafletSize, 5, 4);
            leafletGeo.scale(1, 0.3, 2);
            
            const lc = color.clone().lerp(new THREE.Color(0x388E3C), 0.35+t*0.15);
            const mat = new THREE.MeshStandardMaterial({color:lc, roughness:0.72});
            const leaflet = new THREE.Mesh(leafletGeo, mat);
            leaflet.position.set(0, t*h*0.7, 0);
            leaflet.rotation.y = (l%2===0?1:-1) * (0.4 + t*0.25);
            frondGroup.add(leaflet);
        }
        
        const stemGeo = new THREE.CylinderGeometry(0.006, 0.015, h*0.75, 5);
        const stemMat = new THREE.MeshStandardMaterial({color:0x4CAF50, roughness:0.78});
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.y = h*0.37;
        frondGroup.add(stem);
        
        frondGroup.rotation.z = (f - frondCount/2) * 0.3 + (Math.random()-0.5)*0.15;
        frondGroup.rotation.y = f * 0.45;
        frondGroup.position.y = 0.04;
        group.add(frondGroup);
    }
}

function createPalm(group, color, h) {
    const trunkGeo = new THREE.CylinderGeometry(0.05, 0.08, h*0.55, 7);
    const trunkMat = new THREE.MeshStandardMaterial({color:0x8D6E63, roughness:0.88});
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = h*0.27;
    trunk.castShadow = true;
    group.add(trunk);
    
    const frondCount = 6;
    for (let f=0; f<frondCount; f++) {
        const frondGroup = new THREE.Group();
        const segCount = 10;
        for (let s=0; s<segCount; s++) {
            const t = s/segCount;
            const leafGeo = new THREE.BoxGeometry(0.015, 0.25-t*0.12, 0.06);
            const lc = new THREE.Color().lerpColors(color, new THREE.Color(0x2E7D32), t);
            const mat = new THREE.MeshStandardMaterial({color:lc, roughness:0.68});
            const leaf = new THREE.Mesh(leafGeo, mat);
            leaf.position.set(0, t*h*0.45, 0);
            leaf.rotation.y = (s%2===0?0.35:-0.35);
            leaf.rotation.z = 0.18;
            frondGroup.add(leaf);
        }
        frondGroup.position.y = h*0.55;
        frondGroup.rotation.z = -0.25 + (f/frondCount)*0.12;
        frondGroup.rotation.y = (f/frondCount)*Math.PI*2;
        group.add(frondGroup);
    }
}

function createBush(group, color, h) {
    // 更茂盛的灌木
    const sphereCount = 7 + Math.floor(Math.random()*5);
    const baseColor = new THREE.Color(0x3E7D3E);
    
    for (let s=0; s<sphereCount; s++) {
        const r = 0.15 + Math.random() * 0.2;
        const geo = new THREE.SphereGeometry(r, 8, 6);
        const c = baseColor.clone().lerp(color, 0.2 + Math.random() * 0.2);
        const mat = new THREE.MeshStandardMaterial({
            color: c, 
            roughness: 0.75,
            emissive: c.clone().multiplyScalar(0.05)
        });
        const sphere = new THREE.Mesh(geo, mat);
        sphere.position.set(
            (Math.random()-0.5)*h*0.6,
            r * 0.8 + Math.random()*h*0.3,
            (Math.random()-0.5)*h*0.6
        );
        sphere.castShadow = true;
        group.add(sphere);
    }
    
    // 添加点缀的小花
    const flowerCount = 3 + Math.floor(Math.random() * 4);
    for (let f=0; f<flowerCount; f++) {
        const flowerGeo = new THREE.SphereGeometry(0.04 + Math.random() * 0.03, 6, 5);
        const flowerMat = new THREE.MeshStandardMaterial({
            color: color.clone().lerp(new THREE.Color(0xFFFFFF), 0.5),
            roughness: 0.5,
            emissive: color.clone().multiplyScalar(0.15)
        });
        const flower = new THREE.Mesh(flowerGeo, flowerMat);
        flower.position.set(
            (Math.random()-0.5)*h*0.4,
            h * 0.3 + Math.random()*h*0.2,
            (Math.random()-0.5)*h*0.4
        );
        group.add(flower);
    }
}

function createGrassClump(group, color, h) {
    const bladeCount = 10 + Math.floor(Math.random()*8);
    for (let b=0; b<bladeCount; b++) {
        const bh = 0.15 + Math.random()*h*0.4;
        const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(0,0,0),
            new THREE.Vector3((Math.random()-0.5)*0.08, bh*0.55, (Math.random()-0.5)*0.08),
            new THREE.Vector3((Math.random()-0.5)*0.12, bh, (Math.random()-0.5)*0.12)
        );
        const geo = new THREE.TubeGeometry(curve, 5, 0.005, 3, false);
        const c = color.clone().lerp(new THREE.Color(0x4CAF50), Math.random()*0.25);
        const mat = new THREE.MeshStandardMaterial({color:c, roughness:0.78});
        const blade = new THREE.Mesh(geo, mat);
        blade.position.set((Math.random()-0.5)*0.12, 0, (Math.random()-0.5)*0.12);
        group.add(blade);
    }
}

function createHerb(group, color, h) {
    const stemCount = 3 + Math.floor(Math.random()*2);
    for (let s=0; s<stemCount; s++) {
        const sh = h * (0.4 + Math.random()*0.4);
        const stemGeo = new THREE.CylinderGeometry(0.008, 0.02, sh, 5);
        const stemMat = new THREE.MeshStandardMaterial({color:0x4CAF50, roughness:0.72});
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.set((s-stemCount/2)*0.05, sh/2, (Math.random()-0.5)*0.04);
        stem.rotation.z = (Math.random()-0.5)*0.12;
        group.add(stem);
        
        for (let l=0; l<3; l++) {
            const leafGeo = new THREE.SphereGeometry(0.025, 4, 3);
            leafGeo.scale(1.4, 0.35, 1);
            const lc = color.clone().lerp(new THREE.Color(0x66BB6A), 0.25);
            const mat = new THREE.MeshStandardMaterial({color:lc, roughness:0.68});
            const leaf = new THREE.Mesh(leafGeo, mat);
            leaf.position.set(stem.position.x + (l%2==0?0.03:-0.03), l*sh*0.18+0.08, stem.position.z);
            leaf.rotation.z = (l%2==0?0.45:-0.45);
            group.add(leaf);
        }
    }
}

function createSucculent(group, color, h) {
    const leafCount = 8 + Math.floor(Math.random()*4);
    for (let i=0; i<leafCount; i++) {
        const angle = (i/leafCount)*Math.PI*2;
        const leafGeo = new THREE.SphereGeometry(0.06, 7, 5);
        leafGeo.scale(0.55, 1.8, 0.35);
        const c = color.clone().lerp(new THREE.Color(0x66BB6A), 0.25).offsetHSL(i*0.015, 0, (i%2)*0.025);
        const mat = new THREE.MeshStandardMaterial({color:c, roughness:0.45, metalness:0.05});
        const leaf = new THREE.Mesh(leafGeo, mat);
        leaf.position.set(Math.cos(angle)*0.03, 0.03 + i*0.01, Math.sin(angle)*0.03);
        leaf.rotation.y = angle;
        leaf.rotation.x = -0.25 + (i%3)*0.08;
        group.add(leaf);
    }
}

// ===== Category Labels - 改为木头小旗子插在地上 =====
let signPostGroup = new THREE.Group();

function createCategoryLabels() {
    const step = CONFIG.cellSize + CONFIG.pathWidth;
    const bedHalf = CONFIG.cellSize / 2 - 0.8; // 距离边缘的距离
    
    for (const [key, info] of Object.entries(CONFIG.categories)) {
        const signPost = createWoodenSignPost(info.name, info.color);
        
        const centerX = (info.pos[0] - 2) * step;
        const centerZ = (info.pos[1] - 1.5) * step;
        
        // 放在地块的左上角
        const cx = centerX - bedHalf;
        const cz = centerZ - bedHalf;
        
        signPost.position.set(cx, 0, cz);
        signPost.rotation.y = Math.random() * 0.2 - 0.1;
        signPost.userData.categoryKey = key;
        
        signPostGroup.add(signPost);
        labelSprites.push(signPost);
    }
    scene.add(signPostGroup);
}

// 创建木头小旗子 - 双面都有字
function createWoodenSignPost(text, colorInt) {
    const group = new THREE.Group();
    
    // 旗杆 - 木头颜色，插在地上
    const poleHeight = 1.8;
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, poleHeight, 8);
    const poleMat = new THREE.MeshStandardMaterial({
        color: 0x8B5A2B,
        roughness: 0.85,
        metalness: 0.0
    });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = poleHeight / 2;
    pole.castShadow = true;
    group.add(pole);
    
    // 顶部金色球
    const topGeo = new THREE.SphereGeometry(0.07, 8, 6);
    const topMat = new THREE.MeshStandardMaterial({
        color: 0xFFD700,
        roughness: 0.3,
        metalness: 0.5
    });
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.y = poleHeight + 0.07;
    top.castShadow = true;
    group.add(top);
    
    // 牌子 - 双面都有字
    const signWidth = 1.2;
    const signHeight = 1.0;  // 旗子高度
    
    // 创建正面文字画布
    const canvas1 = document.createElement('canvas');
    canvas1.width = 256;
    canvas1.height = 128;
    const ctx1 = canvas1.getContext('2d');
    
    ctx1.fillStyle = '#DEB887';
    ctx1.beginPath();
    ctx1.roundRect(8, 8, 240, 112, 12);
    ctx1.fill();
    
    ctx1.strokeStyle = '#C4A574';
    ctx1.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
        ctx1.beginPath();
        ctx1.moveTo(10, 20 + i * 18);
        ctx1.lineTo(246, 25 + i * 18);
        ctx1.stroke();
    }
    
    ctx1.strokeStyle = '#8B4513';
    ctx1.lineWidth = 4;
    ctx1.beginPath();
    ctx1.roundRect(8, 8, 240, 112, 12);
    ctx1.stroke();
    
    // 黑色文字
    ctx1.fillStyle = '#000000';
    ctx1.font = 'bold 32px "Comic Sans MS", "Arial", sans-serif';
    ctx1.textAlign = 'center';
    ctx1.textBaseline = 'middle';
    ctx1.fillText(text, 128, 64);
    
    const texture1 = new THREE.CanvasTexture(canvas1);
    texture1.minFilter = THREE.LinearFilter;
    
    // 创建背面文字画布
    const canvas2 = document.createElement('canvas');
    canvas2.width = 256;
    canvas2.height = 128;
    const ctx2 = canvas2.getContext('2d');
    
    ctx2.fillStyle = '#DEB887';
    ctx2.beginPath();
    ctx2.roundRect(8, 8, 240, 112, 12);
    ctx2.fill();
    
    ctx2.strokeStyle = '#C4A574';
    ctx2.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
        ctx2.beginPath();
        ctx2.moveTo(10, 20 + i * 18);
        ctx2.lineTo(246, 25 + i * 18);
        ctx2.stroke();
    }
    
    ctx2.strokeStyle = '#8B4513';
    ctx2.lineWidth = 4;
    ctx2.beginPath();
    ctx2.roundRect(8, 8, 240, 112, 12);
    ctx2.stroke();
    
    // 黑色文字
    ctx2.fillStyle = '#000000';
    ctx2.font = 'bold 32px "Comic Sans MS", "Arial", sans-serif';
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';
    ctx2.fillText(text, 128, 64);
    
    const texture2 = new THREE.CanvasTexture(canvas2);
    texture2.minFilter = THREE.LinearFilter;
    
    // 木牌 - 垂直于地面，木杆和横档都在旗子平面内
    // PlaneGeometry 默认在 XY 平面，宽沿 X 轴，高沿 Y 轴
    // 横档连接在木桩顶端，旗子从横档向下延伸
    const signGeo = new THREE.PlaneGeometry(signWidth, signHeight);
    const signMat1 = new THREE.MeshStandardMaterial({
        map: texture1,
        roughness: 0.8
    });
    const sign1 = new THREE.Mesh(signGeo, signMat1);
    // 旗子顶部与横档对齐（木桩顶端），向下延伸
    // 中心位置 = 顶部 + (width/2, -height/2)
    sign1.position.set(signWidth / 2, poleHeight - signHeight / 2, 0.01);
    sign1.rotation.y = 0;  // 面向 +Z 方向
    sign1.castShadow = true;
    group.add(sign1);
    
    // 背面 - 面向 -Z 方向（显示在旗子后面）
    const signMat2 = new THREE.MeshStandardMaterial({
        map: texture2,
        roughness: 0.8
    });
    const sign2 = new THREE.Mesh(signGeo, signMat2);
    sign2.position.set(signWidth / 2, poleHeight - signHeight / 2, -0.01);
    sign2.rotation.y = Math.PI;  // 面向 -Z 方向
    group.add(sign2);
    
    // 横档装饰 - 连接木牌和杆子（沿 X 轴方向）
    // 横档在木桩顶端
    const barGeo = new THREE.CylinderGeometry(0.04, 0.04, signWidth / 2, 6);
    const barMat = new THREE.MeshStandardMaterial({
        color: 0x8B5A2B,
        roughness: 0.85
    });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.set(signWidth / 4, poleHeight, 0);
    bar.rotation.z = Math.PI / 2;  // 沿 X 轴方向
    bar.rotation.z = Math.PI / 2;
    bar.castShadow = true;
    group.add(bar);
    
    return group;
}

// ===== Interaction System =====
function setupInteraction() {
    const canvas = renderer.domElement;
    
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('click', onClick);
}

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    
    const meshes = flowerMeshes.map(e => e.mesh);
    const intersects = raycaster.intersectObjects(meshes, true);
    
    if (intersects.length > 0) {
        let hitObj = intersects[0].object;
        while (hitObj.parent && !flowerMeshes.find(e => e.mesh === hitObj)) {
            hitObj = hitObj.parent;
        }
        
        const entry = flowerMeshes.find(e => e.mesh === hitObj);
        if (entry && hitObj !== hoveredObject) {
            hoveredObject = hitObj;
            showWordCard(entry, event.clientX, event.clientY);
            document.body.style.cursor = 'pointer';
        } else if (entry && hoveredObject === hitObj) {
            positionWordCard(event.clientX, event.clientY);
        }
    } else {
        if (hoveredObject) {
            hoveredObject = null;
            hideWordCard();
            document.body.style.cursor = 'default';
        }
    }
}

function onClick(event) {
    if (hoveredObject) {
        const entry = flowerMeshes.find(e => e.mesh === hoveredObject);
        if (entry) {
            // Simple speak functionality
            if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(entry.data.title);
                utterance.lang = 'en-US';
                utterance.rate = 0.8;
                speechSynthesis.speak(utterance);
            }
        }
    }
}

// ===== Word Card UI =====
function showWordCard(entry, screenX, screenY) {
    const data = entry.data;
    
    const catClass = getCategoryCSSClass(data.category);
    cardCategory.className = 'card-category-tag ' + catClass;
    cardCategory.textContent = data.category;
    
    cardWord.textContent = data.title;
    cardMeaning.textContent = data.summary || '';
    
    positionWordCard(screenX, screenY);
    wordCard.classList.add('visible');
}

function positionWordCard(screenX, screenY) {
    const padding = 20;
    const cardWidth = 300;
    const cardHeight = 240;
    
    let x = screenX + padding;
    let y = screenY + padding;
    
    if (x + cardWidth > window.innerWidth - padding) {
        x = screenX - cardWidth - padding;
    }
    if (y + cardHeight > window.innerHeight - padding) {
        y = screenY - cardHeight - padding;
    }
    
    wordCard.style.left = x + 'px';
    wordCard.style.top = y + 'px';
}

function hideWordCard() {
    wordCard.classList.remove('visible');
}

function getCategoryCSSClass(category) {
    // Map English category names to CSS classes
    const map = {
        'Electronics': 'cat-Electronics',
        'Furniture': 'cat-Furniture',
        'Toiletries': 'cat-Toiletries',
        'Tableware': 'cat-Tableware',
        'Plants': 'cat-Plants',
        'Vehicles': 'cat-Vehicles',
        'Weather': 'cat-Weather',
        'Animals': 'cat-Animals',
        'Fruits & Veg': 'cat-Fruits',
        'Food': 'cat-Food',
        'Clothing': 'cat-Clothing',
        'Body Parts': 'cat-BodyParts',
        'Balls': 'cat-Balls',
        'Actions': 'cat-Actions',
        'Shapes': 'cat-Shapes',
        'Playground': 'cat-Playground',
        'Holidays': 'cat-Holidays',
        'Public Places': 'cat-PublicPlaces',
        'Adjectives': 'cat-Adjectives',
        'Others': 'cat-Others'
    };
    return map[category] || '';
}

// ===== UI Setup =====
function setupUI() {
    const filtersContainer = document.getElementById('categoryFilters');
    filtersContainer.innerHTML = '';
    
    for (const [key, info] of Object.entries(CONFIG.categories)) {
        const chip = document.createElement('span');
        chip.className = `category-chip ${getCategoryCSSClass(key)} active`;
        chip.textContent = info.name;
        chip.dataset.category = key;
        chip.addEventListener('click', () => toggleCategoryFilter(key, chip));
        filtersContainer.appendChild(chip);
    }
    
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        applySearchFilter(query);
    });
    
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setViewMode(btn.dataset.view);
        });
    });
    
    // 设置展开词汇按钮
    setupVocabListPanel();
}

// ===== 展开词汇列表面板 =====
let isVocabPanelOpen = false;

function setupVocabListPanel() {
    const toggleBtn = document.getElementById('vocabListToggle');
    const panel = document.getElementById('vocabListPanel');
    const closeBtn = document.getElementById('vocabListClose');
    
    toggleBtn.addEventListener('click', () => {
        isVocabPanelOpen = !isVocabPanelOpen;
        panel.classList.toggle('open', isVocabPanelOpen);
        toggleBtn.classList.toggle('active', isVocabPanelOpen);
        if (isVocabPanelOpen) {
            renderVocabList();
        }
    });
    
    closeBtn.addEventListener('click', () => {
        isVocabPanelOpen = false;
        panel.classList.remove('open');
        toggleBtn.classList.remove('active');
    });
    
    // ESC关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isVocabPanelOpen) {
            isVocabPanelOpen = false;
            panel.classList.remove('open');
            toggleBtn.classList.remove('active');
        }
    });
}

function renderVocabList() {
    const container = document.getElementById('vocabListContent');
    container.innerHTML = '';
    
    // 更新总单词数显示
    const totalCountEl = document.getElementById('totalWordCount');
    if (totalCountEl) {
        totalCountEl.textContent = vocabData.length;
    }
    
    // 按分类组织词汇
    const grouped = {};
    vocabData.forEach(item => {
        if (!grouped[item.category]) grouped[item.category] = [];
        grouped[item.category].push(item);
    });
    
    // 渲染每个分类
    Object.entries(grouped).forEach(([category, items]) => {
        const catConfig = CONFIG.categories[category];
        const catColor = catConfig ? catConfig.color : 0x888888;
        const catName = catConfig ? catConfig.name : category;
        
        const section = document.createElement('div');
        section.className = 'vocab-section';
        
        const header = document.createElement('div');
        header.className = 'vocab-section-header';
        header.innerHTML = `<span class="vocab-dot" style="background:#${new THREE.Color(catColor).getHexString()}"></span>${catName} (${items.length})`;
        section.appendChild(header);
        
        const grid = document.createElement('div');
        grid.className = 'vocab-word-grid';
        
        items.forEach(item => {
            const wordEl = document.createElement('div');
            wordEl.className = 'vocab-word-item';
            wordEl.innerHTML = `
                <span class="vocab-word-en">${item.title}</span>
                <span class="vocab-word-cn">${item.summary}</span>
            `;
            wordEl.addEventListener('click', () => {
                if ('speechSynthesis' in window) {
                    const utterance = new SpeechSynthesisUtterance(item.title);
                    utterance.lang = 'en-US';
                    utterance.rate = 0.8;
                    speechSynthesis.speak(utterance);
                }
                wordEl.classList.add('highlight');
                setTimeout(() => wordEl.classList.remove('highlight'), 300);
            });
            grid.appendChild(wordEl);
        });
        
        section.appendChild(grid);
        container.appendChild(section);
    });
}

function toggleCategoryFilter(categoryKey, chipEl) {
    if (activeCategories.has(categoryKey)) {
        if (activeCategories.size > 1) {
            activeCategories.delete(categoryKey);
            chipEl.classList.remove('active');
            chipEl.classList.add('dimmed');
        }
    } else {
        activeCategories.add(categoryKey);
        chipEl.classList.remove('dimmed');
        chipEl.classList.add('active');
    }
    applyCategoryFilter();
}

function applyCategoryFilter() {
    flowerMeshes.forEach(entry => {
        const visible = activeCategories.has(entry.category);
        const targetOpacity = visible ? 1 : 0.1;
        animateOpacity(entry.mesh, targetOpacity);
    });

    // 木头小旗子通过 visibility 控制，不使用 opacity
    labelSprites.forEach(sprite => {
        const key = sprite.userData.categoryKey;
        const visible = activeCategories.has(key);
        sprite.visible = visible;
    });
}

function applySearchFilter(query) {
    flowerMeshes.forEach(entry => {
        const match = !query || 
            entry.data.title.toLowerCase().includes(query) ||
            entry.data.category.toLowerCase().includes(query) ||
            (entry.data.summary && entry.data.summary.toLowerCase().includes(query));
        
        const targetOpacity = match && activeCategories.has(entry.category) ? 1 : 0.08;
        animateOpacity(entry.mesh, targetOpacity);
    });
}

function setViewMode(mode) {
    currentViewMode = mode;
    flowerMeshes.forEach(entry => {
        const isFlowerType = entry.isFlowerType;
        let shouldShow = true;
        
        if (mode === 'flowers') {
            shouldShow = isFlowerType;
        } else if (mode === 'plants') {
            shouldShow = !isFlowerType;
        }
        
        const targetScale = shouldShow ? entry.targetScale : 0.001;
        animateScale(entry.mesh, targetScale);
    });
}

function animateOpacity(obj, targetOpacity) {
    obj.traverse(child => {
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(m => { m.transparent = true; m.opacity = targetOpacity; });
            } else {
                child.material.transparent = true;
                child.material.opacity = targetOpacity;
            }
        }
    });
}

function animateScale(obj, targetScale) {
    obj.userData._targetScale = targetScale;
}

// ===== Animation Loop - 更强的飘摇效果 =====
function animate() {
    requestAnimationFrame(animate);
    
    const elapsed = clock.getElapsedTime();
    const timeMs = elapsed * 1000;
    const growthProgress = Math.min(1, (timeMs - growthStartTime) / CONFIG.growthDuration);
    
    const easedGrowth = 1 - Math.pow(1 - growthProgress, 3);
    
    flowerMeshes.forEach(entry => {
        const mesh = entry.mesh;
        
        let targetScale = entry.targetScale;
        
        if (currentViewMode === 'flowers' && !entry.isFlowerType) targetScale = 0.001;
        else if (currentViewMode === 'plants' && entry.isFlowerType) targetScale = 0.001;
        
        if (mesh.userData._targetScale !== undefined) {
            targetScale = mesh.userData._targetScale;
        }
        
        const currentScale = mesh.scale.x;
        const newScale = currentScale + (targetScale * easedGrowth - currentScale) * 0.07;
        mesh.scale.setScalar(Math.max(0.001, newScale));
        
        // 增强飘摇效果 - 花朵随风飘摇
        if (growthProgress > 0.2) {
            const swayAmount = CONFIG.swayAmplitude;
            const speed = CONFIG.swaySpeed;
            const phase = entry.phaseOffset;
            
            // 多轴飘摇，更自然
            mesh.rotation.x = Math.sin(elapsed * speed * 1.2 + phase) * swayAmount;
            mesh.rotation.z = Math.cos(elapsed * speed * 0.8 + phase * 1.3) * swayAmount;
            mesh.rotation.y = Math.sin(elapsed * speed * 0.5 + phase * 0.7) * swayAmount * 0.3;
            
            // 轻微上下摆动
            mesh.position.y = Math.sin(elapsed * speed * 1.5 + phase) * 0.03;
        }
    });
    
    // 木头小旗子保持静止，不晃动
    
    controls.update();
    renderer.render(scene, camera);
}

// ===== Inline Data Fallback =====
const __INLINE_VOCAB_DATA__ = [
    {"id":1,"title":"air conditioner","summary":"makes room cool","category":"Electronics","source":"Electronics","heat":85,"date":"2026","url":"#"},
    {"id":2,"title":"washing machine","summary":"cleans clothes","category":"Electronics","source":"Electronics","heat":80,"date":"2026","url":"#"},
    {"id":3,"title":"clock","summary":"shows time","category":"Electronics","source":"Electronics","heat":75,"date":"2026","url":"#"},
    {"id":4,"title":"fridge","summary":"keeps food cold","category":"Electronics","source":"Electronics","heat":78,"date":"2026","url":"#"},
    {"id":5,"title":"TV","summary":"watch shows","category":"Electronics","source":"Electronics","heat":90,"date":"2026","url":"#"},
    {"id":6,"title":"light","summary":"makes it bright","category":"Electronics","source":"Electronics","heat":72,"date":"2026","url":"#"},
    {"id":7,"title":"mobile phone","summary":"call and text","category":"Electronics","source":"Electronics","heat":95,"date":"2026","url":"#"},
    {"id":8,"title":"hairdryer","summary":"dries wet hair","category":"Electronics","source":"Electronics","heat":68,"date":"2026","url":"#"},
    {"id":9,"title":"watch","summary":"wear on wrist","category":"Electronics","source":"Electronics","heat":65,"date":"2026","url":"#"},
    {"id":10,"title":"table","summary":"put things on","category":"Furniture","source":"Furniture","heat":82,"date":"2026","url":"#"},
    {"id":11,"title":"chair","summary":"sit on it","category":"Furniture","source":"Furniture","heat":85,"date":"2026","url":"#"},
    {"id":12,"title":"sofa","summary":"soft seat for many","category":"Furniture","source":"Furniture","heat":80,"date":"2026","url":"#"},
    {"id":13,"title":"window","summary":"see outside","category":"Furniture","source":"Furniture","heat":75,"date":"2026","url":"#"},
    {"id":14,"title":"cup","summary":"drink from it","category":"Furniture","source":"Furniture","heat":78,"date":"2026","url":"#"},
    {"id":15,"title":"door","summary":"go in and out","category":"Furniture","source":"Furniture","heat":70,"date":"2026","url":"#"},
    {"id":16,"title":"trashcan","summary":"throw trash here","category":"Furniture","source":"Furniture","heat":65,"date":"2026","url":"#"},
    {"id":17,"title":"curtain","summary":"cover the window","category":"Furniture","source":"Furniture","heat":68,"date":"2026","url":"#"},
    {"id":18,"title":"pillow","summary":"sleep with it","category":"Furniture","source":"Furniture","heat":72,"date":"2026","url":"#"},
    {"id":19,"title":"quilt","summary":"warm blanket","category":"Furniture","source":"Furniture","heat":70,"date":"2026","url":"#"},
    {"id":20,"title":"sheet","summary":"on the bed","category":"Furniture","source":"Furniture","heat":68,"date":"2026","url":"#"},
    {"id":21,"title":"box","summary":"hold things","category":"Furniture","source":"Furniture","heat":75,"date":"2026","url":"#"},
    {"id":22,"title":"bottle","summary":"carry liquid","category":"Furniture","source":"Furniture","heat":78,"date":"2026","url":"#"},
    {"id":23,"title":"hanger","summary":"hang clothes","category":"Furniture","source":"Furniture","heat":62,"date":"2026","url":"#"},
    {"id":24,"title":"mirror","summary":"see your face","category":"Furniture","source":"Furniture","heat":70,"date":"2026","url":"#"},
    {"id":25,"title":"tap","summary":"water comes out","category":"Furniture","source":"Furniture","heat":65,"date":"2026","url":"#"},
    {"id":26,"title":"sink","summary":"wash hands","category":"Furniture","source":"Furniture","heat":68,"date":"2026","url":"#"},
    {"id":27,"title":"toilet","summary":"use the bathroom","category":"Furniture","source":"Furniture","heat":72,"date":"2026","url":"#"},
    {"id":28,"title":"toothbrush","summary":"clean teeth","category":"Furniture","source":"Furniture","heat":78,"date":"2026","url":"#"},
    {"id":29,"title":"toilet paper","summary":"use after toilet","category":"Furniture","source":"Furniture","heat":74,"date":"2026","url":"#"},
    {"id":30,"title":"comb","summary":"fix hair","category":"Toiletries","source":"Toiletries","heat":70,"date":"2026","url":"#"},
    {"id":31,"title":"soap","summary":"make clean","category":"Toiletries","source":"Toiletries","heat":75,"date":"2026","url":"#"},
    {"id":32,"title":"spoon","summary":"soup and cereal","category":"Tableware","source":"Tableware","heat":82,"date":"2026","url":"#"},
    {"id":33,"title":"fork","summary":"pick up food","category":"Tableware","source":"Tableware","heat":80,"date":"2026","url":"#"},
    {"id":34,"title":"knife","summary":"cut food","category":"Tableware","source":"Tableware","heat":78,"date":"2026","url":"#"},
    {"id":35,"title":"flower","summary":"pretty and colorful","category":"Plants","source":"Plants","heat":90,"date":"2026","url":"#"},
    {"id":36,"title":"tree","summary":"tall with leaves","category":"Plants","source":"Plants","heat":88,"date":"2026","url":"#"},
    {"id":37,"title":"grass","summary":"green and soft","category":"Plants","source":"Plants","heat":85,"date":"2026","url":"#"},
    {"id":38,"title":"leaf","summary":"part of a plant","category":"Plants","source":"Plants","heat":82,"date":"2026","url":"#"},
    {"id":39,"title":"car","summary":"drive on road","category":"Vehicles","source":"Vehicles","heat":95,"date":"2026","url":"#"},
    {"id":40,"title":"bus","summary":"many people ride","category":"Vehicles","source":"Vehicles","heat":88,"date":"2026","url":"#"},
    {"id":41,"title":"train","summary":"runs on tracks","category":"Vehicles","source":"Vehicles","heat":85,"date":"2026","url":"#"},
    {"id":42,"title":"airplane","summary":"fly in the sky","category":"Vehicles","source":"Vehicles","heat":92,"date":"2026","url":"#"},
    {"id":43,"title":"ship","summary":"sail on water","category":"Vehicles","source":"Vehicles","heat":80,"date":"2026","url":"#"},
    {"id":44,"title":"bike","summary":"ride with legs","category":"Vehicles","source":"Vehicles","heat":86,"date":"2026","url":"#"},
    {"id":45,"title":"boat","summary":"float on water","category":"Vehicles","source":"Vehicles","heat":78,"date":"2026","url":"#"},
    {"id":46,"title":"taxi","summary":"pay to ride","category":"Vehicles","source":"Vehicles","heat":75,"date":"2026","url":"#"},
    {"id":47,"title":"truck","summary":"carry heavy things","category":"Vehicles","source":"Vehicles","heat":72,"date":"2026","url":"#"},
    {"id":48,"title":"ambulance","summary":"help sick people","category":"Vehicles","source":"Vehicles","heat":70,"date":"2026","url":"#"},
    {"id":49,"title":"fire engine","summary":"put out fires","category":"Vehicles","source":"Vehicles","heat":78,"date":"2026","url":"#"},
    {"id":50,"title":"police car","summary":"catch bad guys","category":"Vehicles","source":"Vehicles","heat":76,"date":"2026","url":"#"},
    {"id":51,"title":"subway","summary":"train under city","category":"Vehicles","source":"Vehicles","heat":82,"date":"2026","url":"#"},
    {"id":52,"title":"helicopter","summary":"fly with propeller","category":"Vehicles","source":"Vehicles","heat":85,"date":"2026","url":"#"},
    {"id":53,"title":"rocket","summary":"fly to space","category":"Vehicles","source":"Vehicles","heat":88,"date":"2026","url":"#"},
    {"id":54,"title":"balloon","summary":"float in air","category":"Vehicles","source":"Vehicles","heat":90,"date":"2026","url":"#"},
    {"id":55,"title":"sun","summary":"bright and warm","category":"Weather","source":"Weather","heat":92,"date":"2026","url":"#"},
    {"id":56,"title":"moon","summary":"shines at night","category":"Weather","source":"Weather","heat":88,"date":"2026","url":"#"},
    {"id":57,"title":"star","summary":"sparkle at night","category":"Weather","source":"Weather","heat":85,"date":"2026","url":"#"},
    {"id":58,"title":"rain","summary":"water from sky","category":"Weather","source":"Weather","heat":80,"date":"2026","url":"#"},
    {"id":59,"title":"snow","summary":"cold and white","category":"Weather","source":"Weather","heat":78,"date":"2026","url":"#"},
    {"id":60,"title":"cloud","summary":"float in the sky","category":"Weather","source":"Weather","heat":82,"date":"2026","url":"#"},
    {"id":61,"title":"wind","summary":"air moves fast","category":"Weather","source":"Weather","heat":75,"date":"2026","url":"#"},
    {"id":62,"title":"rainbow","summary":"colorful arc","category":"Weather","source":"Weather","heat":95,"date":"2026","url":"#"},
    {"id":63,"title":"sky","summary":"up above us","category":"Weather","source":"Weather","heat":78,"date":"2026","url":"#"},
    {"id":64,"title":"mountain","summary":"tall and rocky","category":"Weather","source":"Weather","heat":76,"date":"2026","url":"#"},
    {"id":65,"title":"river","summary":"water flows","category":"Weather","source":"Weather","heat":74,"date":"2026","url":"#"},
    {"id":66,"title":"dog","summary":"best friend","category":"Animals","source":"Animals","heat":95,"date":"2026","url":"#"},
    {"id":67,"title":"cat","summary":"likes to meow","category":"Animals","source":"Animals","heat":92,"date":"2026","url":"#"},
    {"id":68,"title":"bird","summary":"fly in sky","category":"Animals","source":"Animals","heat":88,"date":"2026","url":"#"},
    {"id":69,"title":"fish","summary":"swim in water","category":"Animals","source":"Animals","heat":85,"date":"2026","url":"#"},
    {"id":70,"title":"rabbit","summary":"hop and jump","category":"Animals","source":"Animals","heat":90,"date":"2026","url":"#"},
    {"id":71,"title":"bear","summary":"big and furry","category":"Animals","source":"Animals","heat":82,"date":"2026","url":"#"},
    {"id":72,"title":"elephant","summary":"big with trunk","category":"Animals","source":"Animals","heat":86,"date":"2026","url":"#"},
    {"id":73,"title":"lion","summary":"king of jungle","category":"Animals","source":"Animals","heat":84,"date":"2026","url":"#"},
    {"id":74,"title":"monkey","summary":"likes bananas","category":"Animals","source":"Animals","heat":82,"date":"2026","url":"#"},
    {"id":75,"title":"tiger","summary":"stripy and strong","category":"Animals","source":"Animals","heat":80,"date":"2026","url":"#"},
    {"id":76,"title":"zebra","summary":"black and white","category":"Animals","source":"Animals","heat":76,"date":"2026","url":"#"},
    {"id":77,"title":"giraffe","summary":"long neck","category":"Animals","source":"Animals","heat":78,"date":"2026","url":"#"},
    {"id":78,"title":"duck","summary":"says quack","category":"Animals","source":"Animals","heat":82,"date":"2026","url":"#"},
    {"id":79,"title":"chicken","summary":"says cluck","category":"Animals","source":"Animals","heat":78,"date":"2026","url":"#"},
    {"id":80,"title":"pig","summary":"pink and cute","category":"Animals","source":"Animals","heat":74,"date":"2026","url":"#"},
    {"id":81,"title":"cow","summary":"gives milk","category":"Animals","source":"Animals","heat":72,"date":"2026","url":"#"},
    {"id":82,"title":"horse","summary":"fast runner","category":"Animals","source":"Animals","heat":78,"date":"2026","url":"#"},
    {"id":83,"title":"sheep","summary":"fluffy wool","category":"Animals","source":"Animals","heat":76,"date":"2026","url":"#"},
    {"id":84,"title":"butterfly","summary":"pretty wings","category":"Animals","source":"Animals","heat":90,"date":"2026","url":"#"},
    {"id":85,"title":"bee","summary":"makes honey","category":"Animals","source":"Animals","heat":82,"date":"2026","url":"#"},
    {"id":86,"title":"ant","summary":"very small","category":"Animals","source":"Animals","heat":70,"date":"2026","url":"#"},
    {"id":87,"title":"snake","summary":"long and slithers","category":"Animals","source":"Animals","heat":68,"date":"2026","url":"#"},
    {"id":88,"title":"turtle","summary":"slow and shell","category":"Animals","source":"Animals","heat":75,"date":"2026","url":"#"},
    {"id":89,"title":"apple","summary":"red and sweet","category":"Fruits & Veg","source":"Fruits & Veg","heat":90,"date":"2026","url":"#"},
    {"id":90,"title":"banana","summary":"yellow and long","category":"Fruits & Veg","source":"Fruits & Veg","heat":88,"date":"2026","url":"#"},
    {"id":91,"title":"orange","summary":"round and juicy","category":"Fruits & Veg","source":"Fruits & Veg","heat":85,"date":"2026","url":"#"},
    {"id":92,"title":"grape","summary":"grow in bunches","category":"Fruits & Veg","source":"Fruits & Veg","heat":82,"date":"2026","url":"#"},
    {"id":93,"title":"watermelon","summary":"big and juicy","category":"Fruits & Veg","source":"Fruits & Veg","heat":88,"date":"2026","url":"#"},
    {"id":94,"title":"strawberry","summary":"red with seeds","category":"Fruits & Veg","source":"Fruits & Veg","heat":86,"date":"2026","url":"#"},
    {"id":95,"title":"peach","summary":"fuzzy and sweet","category":"Fruits & Veg","source":"Fruits & Veg","heat":80,"date":"2026","url":"#"},
    {"id":96,"title":"pineapple","summary":"spiky and sweet","category":"Fruits & Veg","source":"Fruits & Veg","heat":78,"date":"2026","url":"#"},
    {"id":97,"title":"carrot","summary":"orange and crunchy","category":"Fruits & Veg","source":"Fruits & Veg","heat":75,"date":"2026","url":"#"},
    {"id":98,"title":"tomato","summary":"red and round","category":"Fruits & Veg","source":"Fruits & Veg","heat":76,"date":"2026","url":"#"},
    {"id":99,"title":"potato","summary":"brown and filling","category":"Fruits & Veg","source":"Fruits & Veg","heat":72,"date":"2026","url":"#"},
    {"id":100,"title":"onion","summary":"makes you cry","category":"Fruits & Veg","source":"Fruits & Veg","heat":70,"date":"2026","url":"#"},
    {"id":101,"title":"broccoli","summary":"green trees","category":"Fruits & Veg","source":"Fruits & Veg","heat":74,"date":"2026","url":"#"},
    {"id":102,"title":"corn","summary":"yellow kernels","category":"Fruits & Veg","source":"Fruits & Veg","heat":78,"date":"2026","url":"#"},
    {"id":103,"title":"cucumber","summary":"green and cool","category":"Fruits & Veg","source":"Fruits & Veg","heat":72,"date":"2026","url":"#"},
    {"id":104,"title":"eggplant","summary":"purple and shiny","category":"Fruits & Veg","source":"Fruits & Veg","heat":68,"date":"2026","url":"#"},
    {"id":105,"title":"mango","summary":"sweet tropical","category":"Fruits & Veg","source":"Fruits & Veg","heat":82,"date":"2026","url":"#"},
    {"id":106,"title":"rice","summary":"white grains","category":"Food","source":"Food","heat":85,"date":"2026","url":"#"},
    {"id":107,"title":"noodle","summary":"long and soft","category":"Food","source":"Food","heat":82,"date":"2026","url":"#"},
    {"id":108,"title":"bread","summary":"make toast","category":"Food","source":"Food","heat":88,"date":"2026","url":"#"},
    {"id":109,"title":"cake","summary":"sweet birthday","category":"Food","source":"Food","heat":92,"date":"2026","url":"#"},
    {"id":110,"title":"cookie","summary":"sweet and round","category":"Food","source":"Food","heat":86,"date":"2026","url":"#"},
    {"id":111,"title":"shirt","summary":"wear on body","category":"Clothing","source":"Clothing","heat":82,"date":"2026","url":"#"},
    {"id":112,"title":"pants","summary":"cover legs","category":"Clothing","source":"Clothing","heat":80,"date":"2026","url":"#"},
    {"id":113,"title":"dress","summary":"pretty for girls","category":"Clothing","source":"Clothing","heat":88,"date":"2026","url":"#"},
    {"id":114,"title":"hat","summary":"wear on head","category":"Clothing","source":"Clothing","heat":84,"date":"2026","url":"#"},
    {"id":115,"title":"shoe","summary":"protect feet","category":"Clothing","source":"Clothing","heat":86,"date":"2026","url":"#"},
    {"id":116,"title":"sock","summary":"warm feet","category":"Clothing","source":"Clothing","heat":78,"date":"2026","url":"#"},
    {"id":117,"title":"head","summary":"top of body","category":"Body Parts","source":"Body Parts","heat":85,"date":"2026","url":"#"},
    {"id":118,"title":"eye","summary":"see with it","category":"Body Parts","source":"Body Parts","heat":88,"date":"2026","url":"#"},
    {"id":119,"title":"nose","summary":"smell and breathe","category":"Body Parts","source":"Body Parts","heat":82,"date":"2026","url":"#"},
    {"id":120,"title":"mouth","summary":"eat and talk","category":"Body Parts","source":"Body Parts","heat":84,"date":"2026","url":"#"},
    {"id":121,"title":"ear","summary":"hear with it","category":"Body Parts","source":"Body Parts","heat":80,"date":"2026","url":"#"},
    {"id":122,"title":"hand","summary":"hold things","category":"Body Parts","source":"Body Parts","heat":86,"date":"2026","url":"#"},
    {"id":123,"title":"foot","summary":"walk with it","category":"Body Parts","source":"Body Parts","heat":78,"date":"2026","url":"#"},
    {"id":124,"title":"finger","summary":"point and grab","category":"Body Parts","source":"Body Parts","heat":82,"date":"2026","url":"#"},
    {"id":125,"title":"ball","summary":"round and bounce","category":"Balls","source":"Balls","heat":90,"date":"2026","url":"#"},
    {"id":126,"title":"basketball","summary":"bounce and shoot","category":"Balls","source":"Balls","heat":88,"date":"2026","url":"#"},
    {"id":127,"title":"football","summary":"kick and run","category":"Balls","source":"Balls","heat":85,"date":"2026","url":"#"},
    {"id":128,"title":"jump","summary":"go up high","category":"Actions","source":"Actions","heat":88,"date":"2026","url":"#"},
    {"id":129,"title":"run","summary":"go fast","category":"Actions","source":"Actions","heat":85,"date":"2026","url":"#"},
    {"id":130,"title":"walk","summary":"go slowly","category":"Actions","source":"Actions","heat":82,"date":"2026","url":"#"},
    {"id":131,"title":"eat","summary":"put food in mouth","category":"Actions","source":"Actions","heat":86,"date":"2026","url":"#"},
    {"id":132,"title":"drink","summary":"put water in mouth","category":"Actions","source":"Actions","heat":84,"date":"2026","url":"#"},
    {"id":133,"title":"sleep","summary":"rest at night","category":"Actions","source":"Actions","heat":80,"date":"2026","url":"#"},
    {"id":134,"title":"play","summary":"have fun","category":"Actions","source":"Actions","heat":90,"date":"2026","url":"#"},
    {"id":135,"title":"sing","summary":"make music","category":"Actions","source":"Actions","heat":82,"date":"2026","url":"#"},
    {"id":136,"title":"circle","summary":"round shape","category":"Shapes","source":"Shapes","heat":85,"date":"2026","url":"#"},
    {"id":137,"title":"square","summary":"four sides","category":"Shapes","source":"Shapes","heat":82,"date":"2026","url":"#"},
    {"id":138,"title":"triangle","summary":"three sides","category":"Shapes","source":"Shapes","heat":80,"date":"2026","url":"#"},
    {"id":139,"title":"star","summary":"five points","category":"Shapes","source":"Shapes","heat":88,"date":"2026","url":"#"},
    {"id":140,"title":"swing","summary":"back and forth","category":"Playground","source":"Playground","heat":88,"date":"2026","url":"#"},
    {"id":141,"title":"slide","summary":"go down fast","category":"Playground","source":"Playground","heat":90,"date":"2026","url":"#"},
    {"id":142,"title":"sandbox","summary":"play with sand","category":"Playground","source":"Playground","heat":85,"date":"2026","url":"#"},
    {"id":143,"title":"seesaw","summary":"up and down","category":"Playground","source":"Playground","heat":82,"date":"2026","url":"#"},
    {"id":144,"title":"ladder","summary":"climb up","category":"Playground","source":"Playground","heat":78,"date":"2026","url":"#"},
    {"id":145,"title":"pool","summary":"swim in water","category":"Playground","source":"Playground","heat":86,"date":"2026","url":"#"},
    {"id":146,"title":"Christmas","summary":"December holiday","category":"Holidays","source":"Holidays","heat":95,"date":"2026","url":"#"},
    {"id":147,"title":"birthday","summary":"celebrate you","category":"Holidays","source":"Holidays","heat":92,"date":"2026","url":"#"},
    {"id":148,"title":"Halloween","summary":"October fun","category":"Holidays","source":"Holidays","heat":88,"date":"2026","url":"#"},
    {"id":149,"title":"hospital","summary":"get better","category":"Public Places","source":"Public Places","heat":85,"date":"2026","url":"#"},
    {"id":150,"title":"school","summary":"learn things","category":"Public Places","source":"Public Places","heat":88,"date":"2026","url":"#"},
    {"id":151,"title":"big","summary":"very large","category":"Adjectives","source":"Adjectives","heat":85,"date":"2026","url":"#"},
    {"id":152,"title":"small","summary":"very little","category":"Adjectives","source":"Adjectives","heat":82,"date":"2026","url":"#"},
    {"id":153,"title":"happy","summary":"feel good","category":"Others","source":"Others","heat":90,"date":"2026","url":"#"},
    {"id":154,"title":"sad","summary":"feel unhappy","category":"Others","source":"Others","heat":80,"date":"2026","url":"#"}
];

// ===== Start =====
init().catch(err => {
    console.error('Failed to initialize Kids English Garden:', err);
    document.getElementById('loadingScreen').innerHTML = `
        <div style="text-align:center;color:#FF6B6B;">
            <div style="font-size:48px;margin-bottom:16px;">🌸</div>
            <div class="loading-text">加载失败</div>
            <div class="loading-subtext" style="margin-top:8px;">${err.message}</div>
        </div>
    `;
});
