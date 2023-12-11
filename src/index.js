const gl = document.createElement("canvas").getContext("webgl2");
const preKernel = (inputs) => {
    const uniforms = inputs.map((_, i) => `uniform sampler2D data${i};\n`).join("");
    return `#version 300 es
    precision highp float;
    in vec2 uv;
    uniform int w;
    ${uniforms}
    out float out_data;

    float read(in sampler2D data, int idx) {
        return texture(data, vec2(float(float(int(idx)%textureSize(data, 0).x) + 0.5f)/float(textureSize(data, 0).x), float(float(int(idx)/textureSize(data, 0).x) + 0.5f)/float(textureSize(data, 0).y))).r;
    }`
}

const postKernel = (inputs) => {
    const inputData = inputs.map((_, i) => `data${i},`).join("");
    return `void main() {
        int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f);
        out_data = compute(${inputData} idx0);
    }
    `
}

const createShaderProgram = (code) => {
    const vertexShader = loadShader(gl.VERTEX_SHADER, '#version 300 es\nin vec2 in_position;in vec2 in_uv;out vec2 uv;void main(){gl_Position=vec4(in_position,0.0,1.0);uv=in_uv;}');
    const fragmentShader = loadShader(gl.FRAGMENT_SHADER, code);
    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.log(`Unable to initialize the shader program: ${gl.getProgramInfoLog(shaderProgram)}`);
        return null;
    }

    return shaderProgram;
}

const loadShader = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.log(`An error occurred compiling the shaders: ${gl.getShaderInfoLog(shader)}`);
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

const setupVertexData = (program, vertices) => {
    let vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    let vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'in_position');
    const uvLocation = gl.getAttribLocation(program, 'in_uv');

    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 4 * 4, 0);

    gl.enableVertexAttribArray(uvLocation);
    gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 4 * 4, 2 * 4);

    gl.bindVertexArray(null);

    return vao;
}

const runProgram = (program, inputs, output) => {
    console.log(inputs);
    console.log(output);
    let framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, output.tex, 0);
    gl.useProgram(program);

    gl.uniform1i(gl.getUniformLocation(program, "w"), output.width);  
    const vao = setupVertexData(program, [-1, 1, 0, 1, -1, -1, 0, 0, 1, 1, 1, 1, 1, -1, 1, 0]);
    gl.bindVertexArray(vao);

    for (let i = 0; i < inputs.length; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, inputs[i].tex);
        gl.uniform1i(gl.getUniformLocation(program, 'data' + i), i);
    }

    gl.viewport(0, 0, output.width, output.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    for (let i = 0; i < inputs.length; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }
}

const limitTextureDims = (size, threshold) => {
    if (size <= threshold) { return [size, 1] };

    for (let i = 2; i < threshold + 1; i++) {
        if ((size % i == 0) && (Math.floor(size / i) <= threshold)) {
        return [Math.floor(size / i), i];
        }
    }

    return [size, 1];
}

const readTextureData = (texture) => {
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture.tex, 0);

    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('Framebuffer not complete');
    }

    let data = new Float32Array(texture.width * texture.height);
    gl.readPixels(0, 0, texture.width, texture.height, gl.RED, gl.FLOAT, data);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(framebuffer);

    return data;
}

const createTexture = (buf) => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const texSize = limitTextureDims(buf.length, gl.getParameter(gl.MAX_TEXTURE_SIZE));
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, texSize[0], texSize[1], 0, gl.RED, gl.FLOAT, buf);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { tex: texture, width: texSize[0], height: texSize[1] };
}

export const glKernel = {
    compute: (code, inputBufs, outputBuf) => {
        const ext = gl.getExtension('EXT_color_buffer_float');
        console.log(preKernel(inputBufs) + code.code + postKernel(inputBufs).replace("compute", code.entry));
        const program = createShaderProgram(preKernel(inputBufs) + code.code + postKernel(inputBufs).replace("compute", code.entry));
        const inputs = inputBufs.map((buf) => createTexture(buf));
        const output = createTexture(outputBuf)
        runProgram(program, inputs, output);
        outputBuf.set(readTextureData(output), 0);
    }
}
