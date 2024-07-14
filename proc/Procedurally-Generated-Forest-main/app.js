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

            varying vec3 v_normal;
            varying vec3 v_surfaceToView;
            varying vec2 v_texcoord;
            varying vec4 v_color;

            void main() {
                vec4 worldPosition = u_world * a_position;
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

            const treeFileName = 'assets/fatTree.obj';  
            const treeMtlFileName = 'assets/fatTree.mtl';
            const treeTextureFile = 'assets/TreeTex.png';
            
            const rockFileName = 'assets/Rock.obj';
            const rockMtlFileName = 'assets/Rock.mtl';
            const rockTextureFile = 'assets/rock.png';
            
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

                const parts = obj.geometries.map(({material, data}) => {
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

            const [treeData, rockData] = await Promise.all([
                loadObjAndMtl(treeFileName, treeMtlFileName, treeTextureFile),
                loadObjAndMtl(rockFileName, rockMtlFileName, rockTextureFile),
            ]);

            const floorVertices = {
                position: [
                    -100, 0, -100,
                    100, 0, -100,
                    -100, 0, 100,
                    100, 0, 100,
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
                src: 'assets/grass.jpg', // Caminho para a textura do chão
                mag: gl.NEAREST,
                min: gl.LINEAR,
            });

            let zoomLevel = 1.0;
            canvas.addEventListener('wheel', (event) => {
                event.preventDefault();
                zoomLevel *= event.deltaY > 0 ? 1.1 : 0.9;
                zoomLevel = Math.min(Math.max(zoomLevel, 0.1), 10);
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
            const treePositions = getRandomPositions(30, 200); // 30 árvores
            const rockPositions = getRandomPositions(20, 200); // 20 rochas

            function degToRad(deg) {
                return deg * Math.PI / 180;
            }

            function render() {
                twgl.resizeCanvasToDisplaySize(gl.canvas);
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

                // Draw the trees
                for (const position of treePositions) {
                    let treeWorldMatrix = m4.translation(position[0], position[1], position[2]);
                    twgl.setUniforms(meshProgramInfo, {
                        u_world: treeWorldMatrix,
                        u_texture: treeData.texture, // Usar a textura da árvore
                    });

                    for (const { bufferInfo, material } of treeData.parts) {
                        twgl.setBuffersAndAttributes(gl, meshProgramInfo, bufferInfo);
                        twgl.setUniforms(meshProgramInfo, {
                            u_world: treeWorldMatrix,
                        }, material);
                        twgl.drawBufferInfo(gl, bufferInfo);
                    }
                }

                // Draw the rocks
                for (const position of rockPositions) {
                    let rockWorldMatrix = m4.translation(position[0], position[1], position[2]);
                    twgl.setUniforms(meshProgramInfo, {
                        u_world: rockWorldMatrix,
                        u_texture: rockData.texture, // Usar a textura da rocha
                    });

                    for (const { bufferInfo, material } of rockData.parts) {
                        twgl.setBuffersAndAttributes(gl, meshProgramInfo, bufferInfo);
                        twgl.setUniforms(meshProgramInfo, {
                            u_world: rockWorldMatrix,
                        }, material);
                        twgl.drawBufferInfo(gl, bufferInfo);
                    }
                }

                requestAnimationFrame(render);
            }

            requestAnimationFrame(render);
        }

        main();