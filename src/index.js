const gl = document.createElement("canvas").getContext("webgl2");

const createShaderProgram = (code) => {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, '#version 300 es\nin vec2 in_position;in vec2 in_uv;out vec2 uv;void main(){gl_Position=vec4(in_position,0.0,1.0);uv=in_uv;}');
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, code);
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

const runProgram = (kernelName, program, textures) => {
    let framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textures[0].tex, 0);
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, "w"), textures[0].width);  

    const vao = setupVertexData(gl, program, [-1, 1, 0, 1, -1, -1, 0, 0, 1, 1, 1, 1, 1, -1, 1, 0]);
    gl.bindVertexArray(vao);
    // Texture 0 is the framebuffer texture, so we skip that
    for (let i = 1; i < textures.length; i++) {
        gl.activeTexture(gl.TEXTURE0 + i-1);
        gl.bindTexture(gl.TEXTURE_2D, textures[i].tex);
        gl.uniform1i(gl.getUniformLocation(program, 'data' + i), i-1);
    }

    gl.viewport(0, 0, textures[0].width, textures[0].height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    for (let i = 1; i < textures.length; i++) {
        gl.activeTexture(gl.TEXTURE0 + i-1);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    console.log("Finished running: " + kernelName);
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

const updateTextureData = (texture, data, isHalf) => {
    gl.bindTexture(gl.TEXTURE_2D, texture.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texture.width, texture.height, gl.RED, (isHalf) ? gl.HALF_FLOAT : gl.FLOAT, data);
    gl.bindTexture(gl.TEXTURE_2D, null);
}

const readTextureData = (gl, texture) => {
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

const createTexture = (gl, size, isHalf, tensorBuffer) => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const internalFormat = gl.RGBA;
    const texSize = limitTextureDims(size, gl.getParameter(gl.MAX_TEXTURE_SIZE));
    let weights;

    if (tensorBuffer != null) {
        if (!isHalf)
        weights = new Float32Array(tensorBuffer.buffer, tensorBuffer.byteOffset, tensorBuffer.byteLength / Float32Array.BYTES_PER_ELEMENT);
        else 
        weights = new Uint16Array(tensorBuffer.buffer, tensorBuffer.byteOffset, tensorBuffer.byteLength / Uint16Array.BYTES_PER_ELEMENT);
    } else {
        if (!isHalf)
        weights = new Float32Array(size).fill(0.0);
        else
        weights = new Uint16Array(size).fill(0.0);
    }

    gl.texImage2D(gl.TEXTURE_2D, 0, (isHalf) ? gl.R16F : gl.R32F, texSize[0], texSize[1], 0, gl.RED, (isHalf) ? gl.HALF_FLOAT : gl.FLOAT, weights);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { tex: texture, width: texSize[0], height: texSize[1] };
}
