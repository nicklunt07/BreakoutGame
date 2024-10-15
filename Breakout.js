/**
 * Adapted from TriCol.js
 * 
 * Simple Breakout Game
 * 
 * Nick Lunt
 */

async function Main() {
    let shaderWGSL = `
    struct VertexOutput {
        @builtin(position) Position : vec4f,
        @location(0) fragColor      : vec3f,
    };
    @vertex
    fn vsmain(@location(0) position: vec2f, 
            @location(1) color   : vec3f) -> VertexOutput {
        var output: VertexOutput;
        output.Position = vec4f(position, 0.0, 1.0);
        output.fragColor = color;
        return output;
    }

    @fragment
    fn psmain(@location(0) color: vec3<f32>) -> @location(0) vec4<f32> {
        return vec4<f32>(color, 1.0);
    }
   `;

    const boxColors = [
        new Float32Array([1, 0.439, 0.69]),  // pink
        new Float32Array([0.541, 0.808, 0]) // green
    ]

    // Create adapter, device, and context
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice();

    const canvas = document.querySelector("canvas");
    const context = canvas.getContext('webgpu');

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    const shaderModule = device.createShaderModule({
        label: "Shape shader",
        code: shaderWGSL
    });

    const format = navigator.gpu.getPreferredCanvasFormat();

    context.configure({
        device,
        format,
        alphaMode: 'opaque'
    });

    let pipeline;
    createPipelineConfig();

    function createRect(cx, cy, width, height, color) {
        halfWidth = width / 2;
        halfHeight = height / 2;

        rectVerts = new Float32Array([
            // x                 y                      triangle 1
            cx + halfWidth, cy + halfHeight, ...color, // top right corner
            cx + halfWidth, cy - halfHeight, ...color, // bottom right corner
            cx - halfWidth, cy - halfHeight, ...color, // bottom left corner
            // triangle 2
            cx + halfWidth, cy + halfHeight, ...color, // top right corner
            cx - halfWidth, cy + halfHeight, ...color, // top left corner
            cx - halfWidth, cy - halfHeight, ...color  // bottom left corner
        ])

        return rectVerts;
    }

    function createPipelineConfig() {
        let vertexBufferLayout = [
            {
                arrayStride: 5 * 4,  // x, y, r, g, b (5 atts * 4 bytes each)
                attributes: [
                    { shaderLocation: 0, offset: 0, format: 'float32x2' },
                    { shaderLocation: 1, offset: 2 * 4, format: 'float32x3' }
                ]
            }
        ];

        let pipelineDescriptor = {
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: "vsmain",
                buffers: vertexBufferLayout
            },
            fragment: {
                module: shaderModule,
                entryPoint: "psmain",
                targets: [{
                    format: navigator.gpu.getPreferredCanvasFormat()
                }]
            },
            primitive: {
                topology: "triangle-list"
                //topology: "line-strip" //can make a nother pipeline with line strip if we want to make line strips
            },
        };
        pipeline = device.createRenderPipeline(pipelineDescriptor); // Create the pipline
    }

    const VBOs = [];

    // Paddle
    let xPaddle = 0.0;
    let yPaddle = -0.85;
    let paddleVerts = createRect(xPaddle, yPaddle, 0.4, 0.05, [0.906, 0.984, 1]);
    const paddleVBO = device.createBuffer({
        size: paddleVerts.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(paddleVBO, 0, paddleVerts);
    VBOs.push(paddleVBO);

    // ball
    let xBall = 0.0;
    let yBall = 0.0;
    let ballVerts = createRect(xBall, yBall, 0.04, 0.04, [1, 1, 1]);
    const ballVBO = device.createBuffer({
        size: ballVerts.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(ballVBO, 0, ballVerts);
    VBOs.push(ballVBO);

    // breakout boxes
    let boxes = [];
    let xBox = -0.8;
    let yBox = 0.85;
    numBoxes = 10;
    colNum = 1;
    for (let i = 0; i < numBoxes; i++) { // loop creating boxes
        let boxVerts = createRect(xBox, yBox, 0.35, 0.1, boxColors[colNum++ % 2]); // alternate box colors
        const boxVBO = device.createBuffer({
            size: boxVerts.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(boxVBO, 0, boxVerts);
        VBOs.push(boxVBO);
        boxes.push(boxVerts);
        xBox += 0.4;
        if (i == 4) { // create second row
            xBox = -0.8;
            yBox = 0.7;
        }
    }

    window.addEventListener("keydown", dealWithKeyboard, false);

    let ballMoveX = 0.0;
    let ballMoveY = -0.01;

    let fails = 0;

    function frame() {

        // Ball movement
        xBall += ballMoveX;
        yBall += ballMoveY;

        if (ballPaddleCollision()) {
            // reverse ball
            ballMoveY *= -1;
        }

        if (ballBoxCollision()) {
            // send ball away
            ballMoveY *= -1;
        }

        if (xBall - 0.02 < -1 || xBall + 0.02 > 1) {
            ballMoveX *= -1; // left or right walls
        }
        if (yBall + 0.02 > 1) {
            ballMoveY *= -1; // top wall
        }

        // Reset ball
        if (yBall - 0.02 < -1) {
            xBall = 0.0;
            yBall = 0.0;
            ballMoveX = 0.0;
            ballMoveY = -0.01;
            fails++;
        }

        moveBall(xBall, yBall);
        // stop game and tell player how many fails they had
        if(numBoxes == 0){
            alert("You won with " + fails + " fails!")
        }

        const commandEncoder = device.createCommandEncoder();
        const renderPassDescriptor = { // GPURenderPassDescriptor 
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                loadOp: "clear", clearValue: [0.0, 0.0, 0.0, 1], // clear screen to blue
                storeOp: 'store'
            }]
        };
        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(pipeline);

        passEncoder.setVertexBuffer(0, VBOs[0]);
        passEncoder.draw(paddleVerts.byteLength / 20);

        passEncoder.setVertexBuffer(0, VBOs[1]); // ball VBO = 1
        passEncoder.draw(ballVerts.byteLength / 20);

        for (let i = 0; i < numBoxes; i++) {
            passEncoder.setVertexBuffer(0, VBOs[i + 2]);
            passEncoder.draw(boxes[0].byteLength / 20); // x, y, R, G, B = 20 Bytes
        }

        passEncoder.end();
        device.queue.submit([commandEncoder.finish()]);

        requestAnimationFrame(frame);
    }

    function movePaddle(xPaddle, yPaddle) {
        let paddleVerts = createRect(xPaddle, yPaddle, 0.4, 0.05, [0.906, 0.984, 1]);
        const paddleVBO = device.createBuffer({
            size: paddleVerts.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(paddleVBO, 0, paddleVerts);
        VBOs[0] = paddleVBO;
    }

    function moveBall(xBall, yBall) {
        let ballVerts = createRect(xBall, yBall, 0.04, 0.04, [1, 1, 1]);
        const ballVBO = device.createBuffer({
            size: ballVerts.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(ballVBO, 0, ballVerts);
        VBOs[1] = ballVBO;
    }

    function ballPaddleCollision() {
        const ballWidth = 0.02;
        const paddleWidth = 0.2;
        const paddleHeight = 0.025
        let collide = (
            xBall + ballWidth > xPaddle - paddleWidth &&
            xBall - ballWidth < xPaddle + paddleWidth &&
            yBall + ballWidth > yPaddle - paddleHeight &&
            yBall - ballWidth < yPaddle + paddleHeight);
        // directs ball based on hit position
        if (collide) {  // logic with help from ChatGPT
            let hitPosition = (xBall - xPaddle) / paddleWidth
            ballMoveX = hitPosition * 0.02;
        }
        return collide;
    }

    function ballBoxCollision() {
        const ballWidth = 0.02;
        let collide; // check all boxes in boxes array     could probably be made more efficient than checking all 10 boxes
        for (let i = 0; i < numBoxes; i++) { // vertices in indices 0,1, 5,6 10,11, 15,16, 20,21, 25,26
            currBoxVerts = boxes[i];       // rect positions      TR   BR   BL     TR      TL    BL
            collide = (
                xBall + ballWidth > currBoxVerts[10] &&   // greater than = to the right, less than = to the left
                xBall - ballWidth < currBoxVerts[0] &&
                yBall + ballWidth > currBoxVerts[6] &&  // greater than = above, vice versa
                yBall - ballWidth < currBoxVerts[1]);
            if (collide) {
                boxes.splice(i, 1);  // box removal logic from ChatGPT...I was setting boxes and VBOs to [] and getting errors
                VBOs.splice(i + 2, 1);  // and the splice method fixed it
                numBoxes--;
                return collide;
            }
        }
        return collide;
    }

    function dealWithKeyboard(e) {
        switch (e.keyCode) {
            case 37: // left arrow move left
                {
                    xPaddle -= 0.04;
                    movePaddle(xPaddle, yPaddle);
                };
                break;
            case 39: // right arrow move right
                {
                    xPaddle += 0.04;
                    movePaddle(xPaddle, yPaddle);
                };
                break;
        }
    }
    frame();
}

Main();