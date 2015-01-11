/*
 * MelonJS Game Engine
 * Copyright (C) 2011 - 2014 Olivier Biot, Jason Oster, Aaron McLeod
 * http://www.melonjs.org
 */
(function () {

    // Handy constants
    var FLOAT_SIZE = Float32Array.BYTES_PER_ELEMENT;

    // Stream Buffer constants
    var VERTEX_SIZE = 2;
    var REGION_SIZE = 2;
    var STREAM_SIZE = VERTEX_SIZE + REGION_SIZE;
    var STREAM_OFFSET = STREAM_SIZE * FLOAT_SIZE;

    var VERTEX_ELEMENT = 0;
    var REGION_ELEMENT = VERTEX_ELEMENT + VERTEX_SIZE;

    var VERTEX_OFFSET = VERTEX_ELEMENT * FLOAT_SIZE;
    var REGION_OFFSET = REGION_ELEMENT * FLOAT_SIZE;

    // Static Buffer constants
    var COLOR_SIZE = 4;
    var TEXTURE_SIZE = 1;
    var STATIC_SIZE = COLOR_SIZE + TEXTURE_SIZE;
    var STATIC_OFFSET = STATIC_SIZE * FLOAT_SIZE;

    var COLOR_ELEMENT = 0;
    var TEXTURE_ELEMENT = COLOR_ELEMENT + COLOR_SIZE;

    var COLOR_OFFSET = COLOR_ELEMENT * FLOAT_SIZE;
    var TEXTURE_OFFSET = TEXTURE_ELEMENT * FLOAT_SIZE;

    // Buffer Element constants
    var ELEMENTS_PER_QUAD = 4;
    var INDICES_PER_QUAD = 6;

    // Maximum number of quads
    var MAX_LENGTH = 16000;

    /**
     * A WebGL texture Compositor object. This class handles all of the WebGL state<br>
     * Pushes texture regions into WebGL buffers, automatically flushes to GPU
     * @extends Object
     * @namespace me.WebGLRenderer.Compositor
     * @memberOf me
     * @constructor
     * @param {WebGLContext} gl Destination WebGL Context
     * @param {me.Matrix2d} matrix Global transformation matrix
     * @param {me.Color} color Global color
     */
    me.WebGLRenderer.Compositor = Object.extend(
    /** @scope me.WebGLRenderer.Compositor.prototype */
    {
        /**
         * @ignore
         */
        init : function (gl, matrix, color) {
            /**
             * The number of quads held in the batch
             * @name length
             * @memberOf me.WebGLRenderer.Compositor
             * @type Number
             * @readonly
             */
            this.length = 0;

            // Hash map of texture units
            this.units = [];

            // Vector pool
            this.v = [
                new me.Vector2d(),
                new me.Vector2d(),
                new me.Vector2d(),
                new me.Vector2d()
            ];

            // WebGL context
            this.gl = gl;

            // Global transformation matrix
            this.matrix = matrix;

            // Global color
            this.color = color;

            // Uniform projection matrix
            this.uMatrix = new me.Matrix2d();

            // Load and create shader program
            this.shader = this.createShader();

            // Stream/static buffer size
            this.sbSize = 256;

            // WebGL Static Buffer
            this.cb = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.cb);
            gl.bufferData(
                gl.ARRAY_BUFFER,
                MAX_LENGTH * STATIC_OFFSET * ELEMENTS_PER_QUAD,
                gl.STATIC_DRAW
            );

            // Quad Static buffer
            this.static = new Float32Array(
                this.sbSize * STATIC_SIZE * ELEMENTS_PER_QUAD
            );
            this.staticUint32 = new Uint32Array(this.static.buffer);
            this.staticHash = new Uint32Array(this.sbSize);

            // Bind attribute pointers for static buffer
            gl.vertexAttribPointer(
                this.shader.attributes.aColor,
                COLOR_SIZE,
                gl.FLOAT,
                false,
                STATIC_OFFSET,
                COLOR_OFFSET
            );
            gl.vertexAttribPointer(
                this.shader.attributes.aTexture,
                TEXTURE_SIZE,
                gl.FLOAT,
                false,
                STATIC_OFFSET,
                TEXTURE_OFFSET
            );

            // WebGL Stream buffer
            this.sb = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.sb);
            gl.bufferData(
                gl.ARRAY_BUFFER,
                MAX_LENGTH * STREAM_OFFSET * ELEMENTS_PER_QUAD,
                gl.STREAM_DRAW
            );

            // Quad Stream buffer
            this.stream = new Float32Array(
                this.sbSize * STREAM_SIZE * ELEMENTS_PER_QUAD
            );

            // Bind attribute pointers for stream buffer
            gl.vertexAttribPointer(
                this.shader.attributes.aVertex,
                VERTEX_SIZE,
                gl.FLOAT,
                false,
                STREAM_OFFSET,
                VERTEX_OFFSET
            );
            gl.vertexAttribPointer(
                this.shader.attributes.aRegion,
                REGION_SIZE,
                gl.FLOAT,
                false,
                STREAM_OFFSET,
                REGION_OFFSET
            );

            // Index buffer
            this.ib = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ib);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.createIB(), gl.STATIC_DRAW);

            this.reset();
            this.setProjection(gl.canvas.width, gl.canvas.height);

            // Initialize clear color and blend function
            gl.clearColor(0.0, 0.0, 0.0, 1.0);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        },

        /**
         * @ignore
         */
        createShader : function () {
            // WebGL shader program
            return me.video.shader.createShader(
                this.gl,
                [
                    "aVertex",
                    "aColor",
                    "aTexture",
                    "aRegion",
                ],
                {
                    "uMatrix"   : "mat3",
                    "uSampler"  : "sampler2D",
                }
            );
        },

        /**
         * Sets the projection matrix with the given size
         * @name setProjection
         * @memberOf me.WebGLRenderer.Compositor
         * @function
         * @param {Number} w WebGL Canvas width
         * @param {Number} h WebGL Canvas height
         */
        setProjection : function (w, h) {
            this.gl.viewport(0, 0, w, h);
            this.uMatrix.set(
                2 / w,  0,      0,
                0,      -2 / h, 0,
                -1,     1,      1
            );
            this.shader.uniforms.uMatrix = this.uMatrix.val;
        },

        /**
         * @ignore
         */
        uploadTexture : function (unit, texture, w, h, b) {
            if (!this.units[unit]) {
                this.units[unit] = true;
                this.shader.createTexture(this.gl, unit, texture.texture, w, h, b);
            }
        },

        /**
         * @ignore
         */
        reset : function () {
            this.streamIdx = 0;
            this.staticIdx = 0;
            this.staticStart = -1;
            this.staticEnd = -1;
            this.length = 0;

            var samplers = [];

            var units = this.gl.getParameter(this.gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
            for (var i = 0; i < units; i++) {
                this.units[i] = false;
                samplers[i] = i;
            }

            this.shader.uniforms.uSampler = samplers;
        },

        /**
         * @ignore
         */
        createIB : function () {
            var indices = [
                0, 1, 2,
                2, 1, 3
            ];

            // ~128KB index buffer
            var data = new Array(MAX_LENGTH * INDICES_PER_QUAD);
            for (var i = 0; i < data.length; i++) {
                data[i] = indices[i % INDICES_PER_QUAD] +
                    ~~(i / INDICES_PER_QUAD) * ELEMENTS_PER_QUAD;
            }

            return new Uint16Array(data);
        },

        /**
         * @ignore
         */
        resizeSB : function () {
            var buffer;

            this.sbSize <<= 1;

            buffer = new Float32Array(this.sbSize);
            buffer.set(this.stream);
            this.stream = buffer;

            buffer = new Float32Array(this.sbSize);
            buffer.set(this.static);
            this.static = buffer;

            buffer = new Uint32Array(this.sbSize);
            buffer.set(this.staticHash);
            this.staticHash = buffer;
        },

        /**
         * Add a texture region
         * @name add
         * @memberOf me.WebGLRenderer.Compositor
         * @function
         * @param {me.video.renderer.Texture} texture Source texture
         * @param {Number} sx Source x-coordinate
         * @param {Number} sy Source y-coordinate
         * @param {Number} sw Source width
         * @param {Number} sh Source height
         * @param {Number} dx Destination x-coordinate
         * @param {Number} dy Destination y-coordinate
         * @param {Number} dw Destination width
         * @param {Number} dh Destination height
         */
        add : function (texture, sx, sy, sw, sh, dx, dy, dw, dh) {
            var idx0, idx1, idx2, idx3;

            if (this.length >= MAX_LENGTH) {
                this.flush();
            }
            if (this.length >= this.sbSize) {
                this.resizeSB();
            }

            // TODO: Replace the function signature with:
            // add(texture, region, x, y, w, h)
            // This can only be done after TextureAtlas is used on tilesets
            var region,
                x = dx,
                y = dy,
                w = dw,
                h = dh;

            if (arguments.length === 6) {
                h = dx;
                w = sh;
                y = sw;
                x = sy;
                region = texture.getRegion(sx);
            }
            else {
                // TODO: Remove this cache lookup and the assignment in Texture
                var key = sx + "," + sy + "," + sw + "," + sh;
                region = texture.getRegion(key);
                if (typeof(region) === "undefined") {
                    // TODO: Require proper atlas regions instead of caching arbitrary regions
                    region = texture._insertRegion(key, sx, sy, sw, sh);
                }
            }

            var m = this.matrix;

            // Upload the texture if necessary
            var unit = me.video.renderer.cache.getUnit(texture);
            this.uploadTexture(unit, texture);

            // Transform vertices
            var v0 = m.vectorMultiply(this.v[0].set(x, y));
            var v1 = m.vectorMultiply(this.v[1].set(x + w, y));
            var v2 = m.vectorMultiply(this.v[2].set(x, y + h));
            var v3 = m.vectorMultiply(this.v[3].set(x + w, y + h));


            /* Fill the Stream Buffer */

            // Array index computation
            idx0 = this.streamIdx + STREAM_SIZE * 0;
            idx1 = this.streamIdx + STREAM_SIZE * 1;
            idx2 = this.streamIdx + STREAM_SIZE * 2;
            idx3 = this.streamIdx + STREAM_SIZE * 3;

            // Fill vertex buffer
            // FIXME: Pack each vertex vector into single float
            this.stream[idx0 + VERTEX_ELEMENT + 0] = v0.x;
            this.stream[idx0 + VERTEX_ELEMENT + 1] = v0.y;
            this.stream[idx1 + VERTEX_ELEMENT + 0] = v1.x;
            this.stream[idx1 + VERTEX_ELEMENT + 1] = v1.y;
            this.stream[idx2 + VERTEX_ELEMENT + 0] = v2.x;
            this.stream[idx2 + VERTEX_ELEMENT + 1] = v2.y;
            this.stream[idx3 + VERTEX_ELEMENT + 0] = v3.x;
            this.stream[idx3 + VERTEX_ELEMENT + 1] = v3.y;

            // Fill texture coordinates buffer
            // FIXME: Pack each texture coordinate into single floats
            var stMap = region.stMap;
            this.stream[idx0 + REGION_ELEMENT + 0] = stMap[0];
            this.stream[idx0 + REGION_ELEMENT + 1] = stMap[1];
            this.stream[idx1 + REGION_ELEMENT + 0] = stMap[2];
            this.stream[idx1 + REGION_ELEMENT + 1] = stMap[1];
            this.stream[idx2 + REGION_ELEMENT + 0] = stMap[0];
            this.stream[idx2 + REGION_ELEMENT + 1] = stMap[3];
            this.stream[idx3 + REGION_ELEMENT + 0] = stMap[2];
            this.stream[idx3 + REGION_ELEMENT + 1] = stMap[3];


            /* Fill the Static Buffer */

            // Array index computation
            idx0 = this.staticIdx + STATIC_SIZE * 0;
            idx1 = this.staticIdx + STATIC_SIZE * 1;
            idx2 = this.staticIdx + STATIC_SIZE * 2;
            idx3 = this.staticIdx + STATIC_SIZE * 3;

            // Fill color buffer
            // FIXME: Pack color vector into single float
            var color = this.color.toGL();
            this.static.set(color, idx0 + COLOR_ELEMENT);
            this.static.set(color, idx1 + COLOR_ELEMENT);
            this.static.set(color, idx2 + COLOR_ELEMENT);
            this.static.set(color, idx3 + COLOR_ELEMENT);

            // Fill texture index buffer
            // FIXME: Can the texture index be packed into another element?
            this.static[idx0 + TEXTURE_ELEMENT] =
            this.static[idx1 + TEXTURE_ELEMENT] =
            this.static[idx2 + TEXTURE_ELEMENT] =
            this.static[idx3 + TEXTURE_ELEMENT] = unit;


            // Check if the Static Buffer slot has changed
            var hash = me.utils.XXH32(
                this.staticUint32,
                this.staticIdx,
                STATIC_SIZE * ELEMENTS_PER_QUAD,
                0
            );
            if (this.staticHash[this.length] !== hash) {
                this.staticHash[this.length] = hash;

                // Queue the Static Buffer slot for uploading to the GPU
                if (this.staticStart < 0) {
                    this.staticStart = this.staticIdx;
                }
                this.staticEnd = this.staticIdx + STATIC_SIZE * ELEMENTS_PER_QUAD;
            }


            // Increment counters
            this.streamIdx += STREAM_SIZE * ELEMENTS_PER_QUAD;
            this.staticIdx += STATIC_SIZE * ELEMENTS_PER_QUAD;
            this.length++;
        },

        /**
         * Flush batched texture operations to the GPU
         * @name flush
         * @memberOf me.WebGLRenderer.Compositor
         * @function
         */
        flush : function () {
            if (this.length) {
                var gl = this.gl;

                if (this.staticStart >= 0) {
                    // Update the Static Buffer
                    gl.bindBuffer(gl.ARRAY_BUFFER, this.cb);
                    gl.bufferSubData(
                        gl.ARRAY_BUFFER,
                        this.staticStart * FLOAT_SIZE,
                        this.static.subarray(this.staticStart, this.staticEnd)
                    );
                    gl.bindBuffer(gl.ARRAY_BUFFER, this.sb);
                }

                // Update the Stream Buffer
                var len = this.length * STREAM_SIZE * ELEMENTS_PER_QUAD;
                gl.bufferData(
                    gl.ARRAY_BUFFER,
                    this.stream.subarray(0, len),
                    gl.STREAM_DRAW
                );

                // Draw the stream buffer
                gl.drawElements(
                    gl.TRIANGLES,
                    this.length * INDICES_PER_QUAD,
                    gl.UNSIGNED_SHORT,
                    0
                );

                this.streamIdx = 0;
                this.staticIdx = 0;
                this.staticStart = -1;
                this.length = 0;
            }
        },

        /**
         * Clear the frame buffer, flushes the composite operations and calls
         * gl.clear()
         * @name clear
         * @memberOf me.WebGLRenderer.Compositor
         * @function
         */
        clear : function () {
            this.flush();
            this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        }
    });
})();
