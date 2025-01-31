'use strict';

async function main() {
    // Get A WebGL context
    /** @type {HTMLCanvasElement} */
    const canvas = document.querySelector("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) {
        return;
    }

    // Tell the twgl to match position with a_position etc..
    twgl.setAttributePrefix("a_");

    const vs = `
    attribute vec4 a_position;
    attribute vec3 a_normal;
    attribute vec2 a_texcoord;
    attribute vec4 a_color;

    uniform mat4 u_projection;
    uniform mat4 u_view;
    uniform mat4 u_world;
    uniform vec3 u_viewWorldPosition;
    uniform vec3 u_scale;

    varying vec3 v_normal;
    varying vec3 v_surfaceToView;
    varying vec2 v_texcoord;
    varying vec4 v_color;

    void main() {
        vec4 scaledPosition = vec4(a_position.xyz * u_scale, 1.0);
        vec4 worldPosition = u_world * scaledPosition;
        gl_Position = u_projection * u_view * worldPosition;
        v_surfaceToView = u_viewWorldPosition - worldPosition.xyz;
        v_normal = mat3(u_world) * a_normal;
        v_texcoord = a_texcoord;
        v_color = a_color;
    }
    `;

    const fs = `
    precision highp float;

    varying vec3 v_normal;
    varying vec3 v_surfaceToView;
    varying vec2 v_texcoord;
    varying vec4 v_color;

    uniform sampler2D u_texture;
    uniform vec3 diffuse;
    uniform vec3 ambient;
    uniform vec3 emissive;
    uniform vec3 specular;
    uniform float shininess;
    uniform float opacity;
    uniform vec3 u_lightDirection;
    uniform vec3 u_ambientLight;

    void main () {
        vec3 normal = normalize(v_normal);

        vec3 surfaceToViewDirection = normalize(v_surfaceToView);
        vec3 halfVector = normalize(u_lightDirection + surfaceToViewDirection);

        float fakeLight = dot(u_lightDirection, normal) * .5 + .5;
        float specularLight = clamp(dot(normal, halfVector), 0.0, 1.0);

        vec3 effectiveDiffuse = diffuse * v_color.rgb;
        float effectiveOpacity = opacity * v_color.a;

        vec4 texColor = texture2D(u_texture, v_texcoord);

        gl_FragColor = vec4(
            emissive +
            ambient * u_ambientLight +
            effectiveDiffuse * fakeLight * texColor.rgb +
            specular * pow(specularLight, shininess),
            effectiveOpacity);
    }
    `;

    // compiles and links the shaders, looks up attribute and uniform locations
    const meshProgramInfo = twgl.createProgramInfo(gl, [vs, fs]);

    const treeFileName = 'assets/DeadTree.obj';
    const treeMtlFileName = 'assets/DeadTree.mtl';
    const treeTextureFile = 'assets/areia.jpg';

    const rockFileName = 'assets/DeadTree.obj';
    const rockMtlFileName = 'assets/rock.mtl';
    const rockTextureFile = 'assets/grass.jpg';

    const cactoFileName = 'assets/DeadTree.obj';
    const cactoMtlFileName = 'assets/DeadTree.mtl';
    const cactoTextureFile = 'assets/stripe.jpg';

    const plantFileName = 'assets/DeadTree.obj';
    const plantMtlFileName = 'assets/Plant_5.mtl';
    const plantTextureFile = 'assets/grass.png';

    async function loadFile(file) {
        const response = await fetch(file);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.text();
    }

    async function loadObjAndMtl(objFile, mtlFile, textureFile) {
        const [objText, mtlText] = await Promise.all([
            loadFile(objFile),
            loadFile(mtlFile),
        ]);

        const obj = parseOBJ(objText);
        const materials = parseMTL(mtlText);

        const parts = obj.geometries.map(({ material, data }) => {
            if (data.color) {
                if (data.position.length === data.color.length) {
                    data.color = { numComponents: 3, data: data.color };
                }
            } else {
                data.color = { value: [1, 1, 1, 1] };
            }

            const bufferInfo = twgl.createBufferInfoFromArrays(gl, data);
            return {
                material: materials[material],
                bufferInfo,
            };
        });

        const texture = twgl.createTexture(gl, {
            src: textureFile,
            mag: gl.NEAREST,
            min: gl.LINEAR,
        });

        return { parts, texture };
    }

    const [treeData, rockData, cactoData, plantData] = await Promise.all([
        loadObjAndMtl(treeFileName, treeMtlFileName, treeTextureFile),
        loadObjAndMtl(rockFileName, rockMtlFileName, rockTextureFile),
        loadObjAndMtl(cactoFileName, cactoMtlFileName, cactoTextureFile),
        loadObjAndMtl(plantFileName, plantMtlFileName, plantTextureFile),
    ]);

    const floorVertices = {
        position: [
            -50, 0, -50,
            50, 0, -50,
            -50, 0, 50,
            50, 0, 50,
        ],
        normal: [
            0, 1, 0,
            0, 1, 0,
            0, 1, 0,
            0, 1, 0,
        ],
        texcoord: [
            0, 0,
            1, 0,
            0, 1,
            1, 1,
        ],
        indices: [
            0, 1, 2,
            2, 1, 3,
        ],
    };

    const floorBufferInfo = twgl.createBufferInfoFromArrays(gl, floorVertices);

    const floorTexture = twgl.createTexture(gl, {
        src: 'assets/areia.jpg', 
        mag: gl.NEAREST,
        min: gl.LINEAR,
    });
    // funcao zoom para camera
    let zoomLevel = 3;
    canvas.addEventListener('wheel', (event) => {
         event.preventDefault();
         zoomLevel *= event.deltaY > 0 ? 1.8 : 0.9;
         zoomLevel = Math.min(Math.max(zoomLevel, 1), 10);
    });

    // Função para gerar posições aleatórias
    function getRandomPositions(count, range) {
        const positions = [];
        for (let i = 0; i < count; i++) {
            positions.push([
                (Math.random() - 0.5) * range,
                0,
                (Math.random() - 0.5) * range
            ]);
        }
        return positions;
    }

    // Gerar posições aleatórias para os objetos
    let treeCount = 0;
    let rockCount = 0;
    let cactoCount = 0;
    let plantCount = 1;
    let cactoScale = 1;
   
    const treePositions = getRandomPositions(treeCount, 50); 
    const cactoPositions = getRandomPositions(cactoCount, 50);
    const plantPositions = getRandomPositions(plantCount, 50);
    const rockPositions = getRandomPositions(rockCount, 50);

    function degToRad(deg) {
        return deg * Math.PI / 180;
    }
    function saveSceneToJSON() {
        const sceneData = {
            treeCount: treeCount,
            rockCount: rockCount,
            cactoCount: cactoCount,
            plantCount: plantCount,
            treePositions: treePositions,       
            rockPositions: rockPositions,   
            cactoPositions: cactoPositions, 
            plantPositions: plantPositions,
        };
    
        // Cria um arquivo JSON
        const jsonString = JSON.stringify(sceneData, null, 2);
        
        // Cria um link temporário para baixar o JSON
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "scene.json";  // Nome do arquivo para download
        link.click();
        URL.revokeObjectURL(url);  // Libera o URL após o uso
    }
    function loadSceneFromJSON(file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const sceneData = JSON.parse(event.target.result);
    
            // Atualiza os valores globais
            treeCount = sceneData.treeCount || 0;
            rockCount = sceneData.rockCount || 0;
            cactoCount = sceneData.cactoCount || 0;
            plantCount = sceneData.plantCount || 0;

            treePositions.splice(0, treePositions.length, ...sceneData.treePositions || []);
            rockPositions.splice(0, rockPositions.length, ...sceneData.rockPositions || []);
            cactoPositions.splice(0, cactoPositions.length, ...sceneData.cactoPositions || []);
            plantPositions.splice(0, plantPositions.length, ...sceneData.plantPositions || []);

    
            // Atualiza os sliders
            document.getElementById("increaseTree").value = treeCount;
            document.getElementById("increaseRock").value = rockCount;
            document.getElementById("increaseCacto").value = cactoCount;
            document.getElementById("increasePlant").value = plantCount;

            // Re-renderiza a cena
            render();
        };
    
        reader.readAsText(file);
    }
    
    
    

// Lista para armazenar as posições dos modelos
let models = [];
let selectedModelIndex = null;


// Referências aos elementos do DOM
const modelSelector = document.getElementById("modelSelector");
const translateX = document.getElementById("translateX");
const translateY = document.getElementById("translateY");
const translateZ = document.getElementById("translateZ");

const translateXValue = document.getElementById("translateXValue");
const translateYValue = document.getElementById("translateYValue");
const translateZValue = document.getElementById("translateZValue");


// Atualiza o menu suspenso de seleção de modelos
function updateModelSelector() {
    modelSelector.innerHTML = '<option value="">-- Nenhum Modelo Selecionado --</option>';
    models.forEach((model, index) => {
        const option = document.createElement("option");
        option.value = index;
        option.textContent = `Modelo ${index + 1} (${model.type})`;
        modelSelector.appendChild(option);
    });
}

// Seleciona automaticamente um modelo
function selectModel(index) {
    selectedModelIndex = index;
    modelSelector.value = index;
    updateSliders();
}

// Atualiza os sliders com as posições do modelo selecionado
function updateSliders() {
    if (selectedModelIndex !== null) {
        const model = models[selectedModelIndex];
        translateX.value = model.x;
        translateY.value = model.y;
        translateZ.value = model.z;

        translateXValue.textContent = model.x;
        translateYValue.textContent = model.y;
        translateZValue.textContent = model.z; 
    }
}
    // Aplica as transformações ao modelo selecionado
    function applyTransformations() {
        if (selectedModelIndex !== null && models[selectedModelIndex]) {
            const model = models[selectedModelIndex];

            // Atualiza os valores de posição com base nos sliders
            model.x = parseFloat(translateX.value);
            model.y = parseFloat(translateY.value);
            model.z = parseFloat(translateZ.value);
            render();
        }
    }
    // Função para adicionar modelos à lista e selecionar automaticamente
    function addModel(modelType) {
        const newPosition = { type: modelType, x: 0, y: 0, z: 0 };
        models.push(newPosition);
        updateModelSelector();
        selectModel(models.length - 1);
        console.log(`Modelo ${modelType} adicionado:`, newPosition);
    }
 
    modelSelector.addEventListener("change", (event) => {
        selectedModelIndex = event.target.value ? parseInt(event.target.value) : null;
        updateSliders();
    });
    document.querySelectorAll('input[type="range"]').forEach(slider => {
        const valueDisplay = document.getElementById(slider.id + 'Value');
        slider.addEventListener('input', () => {
            valueDisplay.textContent = slider.value;
            applyTransformations();
        });
    });
    document.getElementById("increaseTree").addEventListener("click", function() {
        treeCount += 1;
        treePositions.push([(Math.random() - 0.5) * 200, 0, (Math.random() - 0.5) * 200]);
        addModel("Árvore"); 
        render();
    });
    document.getElementById("increaseRock").addEventListener("click", function() {
        rockCount += 1;
        rockPositions.push([(Math.random() - 0.5) * 200, 0, (Math.random() - 0.5) * 200]);
        addModel("Rocha");
        render();
    });
    
    document.getElementById("increaseCacto").addEventListener("click", function() {
        cactoCount += 1;
        cactoPositions.push([(Math.random() - 0.5) * 200, 0, (Math.random() - 0.5) * 200]); 
        addModel("Cacto");
        render();
    });
    
    document.getElementById("increasePlant").addEventListener("click", function() {
        plantCount += 1;
        plantPositions.push([(Math.random() - 0.5) * 200, 0, (Math.random() - 0.5) * 200]);
        addModel("Planta");
        render();
    });
    
    
    // Evento para salvar a cena em JSON
    document.getElementById("saveButton").addEventListener("click", function() {
        saveSceneToJSON();
    });
    

            // Evento para carregar a cena a partir de um arquivo JSON
    document.getElementById("loadButton").addEventListener("change", function(event) {
        const file = event.target.files[0];
        if (file) {
            loadSceneFromJSON(file);
        }
    });

    function render() {
        twgl.resizeCanvasToDisplaySize(gl.canvas);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        // Limpa o canvas e adiciona céu azul
        gl.clearColor(0.5, 0.7, 1.0, 1.0); 
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); 
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.enable(gl.DEPTH_TEST);

        const fieldOfViewRadians = degToRad(60);
        const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
        const projection = m4.perspective(fieldOfViewRadians, aspect, 0.1, 2000);

        const up = [0, 1, 0];
        const cameraPosition = [0, 50, 200 / zoomLevel];
        const target = [0, 0, 0];
        const cameraMatrix = m4.lookAt(cameraPosition, target, up);
        const viewMatrix = m4.inverse(cameraMatrix);

        const sharedUniforms = {
            u_lightDirection: m4.normalize([-1, 3, 5]),
            u_view: viewMatrix,
            u_projection: projection,
            u_viewWorldPosition: cameraPosition,
        };

        gl.useProgram(meshProgramInfo.program);
        twgl.setUniforms(meshProgramInfo, sharedUniforms);

        // Draw the floor
        let floorWorldMatrix = m4.translation(0, 0, 0);
        twgl.setBuffersAndAttributes(gl, meshProgramInfo, floorBufferInfo);
        twgl.setUniforms(meshProgramInfo, {
            u_world: floorWorldMatrix,
            u_texture: floorTexture,
            diffuse: [1, 1, 1],
            ambient: [0.1, 0.1, 0.1],
            emissive: [0, 0, 0],
            specular: [0.3, 0.3, 0.3],
            shininess: 30,
            opacity: 1,
        });
        twgl.drawBufferInfo(gl, floorBufferInfo);

        function renderObjects(objects) {
            objects.forEach(({ positions, objectData, texture }) => {
                positions.forEach((position, index) => {
                    let worldMatrix
                    if (models[index]) {
                        // Atualiza com a posição do modelo selecionado
                        worldMatrix = m4.translation(models[index].x, models[index].y, models[index].z);
                    } else {
                        worldMatrix = m4.translation(position[0], position[1], position[2]);
                    }

                    if (objectData === cactoData) {
                        const scale = [cactoScale, cactoScale, cactoScale]; // aumenta tamanho do cacto
                        twgl.setUniforms(meshProgramInfo, {
                            u_scale: scale,
                        });
                    } else {
                        twgl.setUniforms(meshProgramInfo, {
                            u_scale: [1, 1, 1], // Garante que outros objetos usem escala 1 por padrão
                        });
                    }

                    twgl.setUniforms(meshProgramInfo, {
                        u_world: worldMatrix,
                        u_texture: texture,
                    });

                    for (const { bufferInfo, material } of objectData.parts) {
                        twgl.setBuffersAndAttributes(gl, meshProgramInfo, bufferInfo);
                        twgl.setUniforms(meshProgramInfo, {
                            u_world: worldMatrix,
                        }, material),
                        twgl.drawBufferInfo(gl, bufferInfo);
                    }
                });
            });
        }
        const objectsToRender = [
            { positions: treePositions.slice(0, treeCount), objectData: treeData, texture: treeData.texture },
            { positions: rockPositions.slice(0, rockCount), objectData: rockData, texture: rockData.texture },
            { positions: cactoPositions.slice(0, cactoCount), objectData: cactoData, texture: cactoData.texture },
            { positions: plantPositions.slice(0, plantCount), objectData: plantData, texture: plantData.texture },
        ];

        renderObjects(objectsToRender);

        requestAnimationFrame(render);
    
        }

render();
}
main();
