/*
 * MelonJS Game Engine
 * Copyright (C) 2011 - 2013, Olivier BIOT
 * http://www.melonjs.org
 *
 */
(function () {
    /**
     * XXH32 constants
     * @ignore
     */
    var XXH32_PRIMES = new Uint32Array([
        2654435761,
        2246822519,
        3266489917,
        668265263,
        374761393
    ]);

    /**
     * Base64 decoding
     * @see <a href="http://www.webtoolkit.info/">http://www.webtoolkit.info/</A>
     * @ignore
     */
    var Base64 = (function () {
        // hold public stuff in our singleton
        var singleton = {};

        // private property
        var _keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

        // public method for decoding
        singleton.decode = function (input) {

            // make sure our input string has the right format
            input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");

            if (me.device.nativeBase64) {
                // use native decoder
                return window.atob(input);
            }
            else {
                // use cross-browser decoding
                var output = [], chr1, chr2, chr3, enc1, enc2, enc3, enc4, i = 0;

                while (i < input.length) {
                    enc1 = _keyStr.indexOf(input.charAt(i++));
                    enc2 = _keyStr.indexOf(input.charAt(i++));
                    enc3 = _keyStr.indexOf(input.charAt(i++));
                    enc4 = _keyStr.indexOf(input.charAt(i++));

                    chr1 = (enc1 << 2) | (enc2 >> 4);
                    chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
                    chr3 = ((enc3 & 3) << 6) | enc4;

                    output.push(String.fromCharCode(chr1));

                    if (enc3 !== 64) {
                        output.push(String.fromCharCode(chr2));
                    }
                    if (enc4 !== 64) {
                        output.push(String.fromCharCode(chr3));
                    }
                }

                output = output.join("");
                return output;
            }
        };

        // public method for encoding
        singleton.encode = function (input) {

            // make sure our input string has the right format
            input = input.replace(/\r\n/g, "\n");

            if (me.device.nativeBase64) {
                // use native encoder
                return window.btoa(input);
            }
            else {
                // use cross-browser encoding
                var output = [], chr1, chr2, chr3, enc1, enc2, enc3, enc4, i = 0;


                while (i < input.length) {
                    chr1 = input.charCodeAt(i++);
                    chr2 = input.charCodeAt(i++);
                    chr3 = input.charCodeAt(i++);

                    enc1 = chr1 >> 2;
                    enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
                    enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
                    enc4 = chr3 & 63;

                    if (isNaN(chr2)) {
                        enc3 = enc4 = 64;
                    } else if (isNaN(chr3)) {
                        enc4 = 64;
                    }

                    output.push(_keyStr.charAt(enc1));
                    output.push(_keyStr.charAt(enc2));
                    output.push(_keyStr.charAt(enc3));
                    output.push(_keyStr.charAt(enc4));
                }

                output = output.join("");
                return output;
            }
        };

        return singleton;

    })();

    /**
     * a collection of utility functions<br>
     * there is no constructor function for me.utils
     * @namespace me.utils
     * @memberOf me
     */
    me.utils = (function () {
        // hold public stuff in our singleton
        var api = {};

        /*
         * PRIVATE STUFF
         */

        // guid default value
        var GUID_base  = "";
        var GUID_index = 0;

        // regexp to deal with file name & path
        var removepath = /^.*(\\|\/|\:)/;
        var removeext = /\.[^\.]*$/;

        /*
         * PUBLIC STUFF
         */

        /**
         * Decode a base64 encoded string into a binary string
         * @public
         * @function
         * @memberOf me.utils
         * @name decodeBase64
         * @param {String} input Base64 encoded data
         * @return {String} Binary string
         */
        api.decodeBase64 = function (input) {
            return Base64.decode(input);
        };

        /**
         * Encode binary string into a base64 string
         * @public
         * @function
         * @memberOf me.utils
         * @name encodeBase64
         * @param {String} input Binary string
         * @return {String} Base64 encoded data
         */
        api.encodeBase64 = function (input) {
            return Base64.encode(input);
        };

        /**
         * Decode a base64 encoded string into a byte array
         * @public
         * @function
         * @memberOf me.utils
         * @name decodeBase64AsArray
         * @param {String} input Base64 encoded data
         * @param {Number} [bytes] number of bytes per array entry
         * @return {Number[]} Array of bytes
         */
        api.decodeBase64AsArray = function (input, bytes) {
            bytes = bytes || 1;

            var dec = Base64.decode(input), i, j, len;
            var ar = new Uint32Array(dec.length / bytes);

            for (i = 0, len = dec.length / bytes; i < len; i++) {
                ar[i] = 0;
                for (j = bytes - 1; j >= 0; --j) {
                    ar[i] += dec.charCodeAt((i * bytes) + j) << (j << 3);
                }
            }
            return ar;
        };

        /**
         * decompress zlib/gzip data (NOT IMPLEMENTED)
         * @public
         * @function
         * @memberOf me.utils
         * @name decompress
         * @param  {Number[]} data Array of bytes
         * @param  {String} format compressed data format ("gzip","zlib")
         * @return {Number[]} Array of bytes
         */
        api.decompress = function () {
            throw new me.Error("GZIP/ZLIB compressed TMX Tile Map not supported!");
        };

        /**
         * Decode a CSV encoded array into a binary array
         * @public
         * @function
         * @memberOf me.utils
         * @name decodeCSV
         * @param  {String} input CSV formatted data
         * @param  {Number} limit row split limit
         * @return {Number[]} Int Array
         */
        api.decodeCSV = function (input, limit) {
            input = input.trim().split("\n");

            var result = [];
            for (var i = 0; i < input.length; i++) {
                var entries = input[i].split(",", limit);
                for (var e = 0; e < entries.length; e++) {
                    result.push(+entries[e]);
                }
            }
            return result;
        };

        /**
         * return the base name of the file without path info.<br>
         * @public
         * @function
         * @memberOf me.utils
         * @name getBasename
         * @param  {String} path path containing the filename
         * @return {String} the base name without path information.
         */
        api.getBasename = function (path) {
            return path.replace(removepath, "").replace(removeext, "");
        };

        /**
         * return the extension of the file in the given path <br>
         * @public
         * @function
         * @memberOf me.utils
         * @name getFileExtension
         * @param  {String} path path containing the filename
         * @return {String} filename extension.
         */
        api.getFileExtension = function (path) {
            return path.substring(path.lastIndexOf(".") + 1, path.length);
        };

        /**
         * Get image pixels
         * @public
         * @function
         * @memberOf me.utils
         * @name getPixels
         * @param {Image|Canvas} image Image to read
         * @return {ImageData} Canvas ImageData object
         */
        api.getPixels = function (arg) {
            if (arg instanceof HTMLImageElement) {
                var _context = me.CanvasRenderer.getContext2d(
                    me.video.createCanvas(arg.width, arg.height)
                );
                _context.drawImage(arg, 0, 0);
                return _context.getImageData(0, 0, arg.width, arg.height);
            }
            else {
                // canvas !
                return arg.getContext("2d").getImageData(0, 0, arg.width, arg.height);
            }
        };

        /**
         * reset the GUID Base Name
         * the idea here being to have a unique ID
         * per level / object
         * @ignore
         */
        api.resetGUID = function (base) {
            // also ensure it's only 8bit ASCII characters
            GUID_base  = base.toString().toUpperCase().toHex();
            GUID_index = 0;
        };

        /**
         * create and return a very simple GUID
         * Game Unique ID
         * @ignore
         */
        api.createGUID = function () {
            return GUID_base + "-" + (GUID_index++);
        };

        /**
         * Rotate left
         * @ignore
         */
        function rotl(v, i, r) {
            return ((v[i] = (v[i] << r) | (v[i] >>> (32 - r))));
        }

        /**
         * XXH32 vectors
         * @ignore
         */
        var v = new Uint32Array(5);

        /**
         * Implementation of a fast hash algorithm: XXH32
         * @see https://code.google.com/p/xxhash/
         * @public
         * @function
         * @memberOf me.utils
         * @name XXH32
         * @param {Uint32Array} input Input data
         * @param {Number} [offset=0] Input offset
         * @param {Number} [length=input.length] Input length
         * @param {Number} [seed=0] Used to alter the hash predictably
         */
        api.XXH32 = function (input, i, len, seed) {
            var end = i + len;

            i = i || 0;
            len = len || input.length;
            seed = seed || 0;

            if (len >= 4) {
                var limit = end - 4;

                v[1] = seed + XXH32_PRIMES[0] + XXH32_PRIMES[1];
                v[2] = seed + XXH32_PRIMES[1];
                v[3] = seed;
                v[4] = seed - XXH32_PRIMES[0];

                do {
                    v[1] += input[i] * XXH32_PRIMES[1];
                    rotl(v, 1, 13);
                    v[1] *= XXH32_PRIMES[0];
                    i++;

                    v[2] += input[i] * XXH32_PRIMES[1];
                    rotl(v, 2, 13);
                    v[2] *= XXH32_PRIMES[0];
                    i++;

                    v[3] += input[i] * XXH32_PRIMES[1];
                    rotl(v, 3, 13);
                    v[3] *= XXH32_PRIMES[0];
                    i++;

                    v[4] += input[i] * XXH32_PRIMES[1];
                    rotl(v, 4, 13);
                    v[4] *= XXH32_PRIMES[0];
                    i++;
                } while (i <= limit);

                v[0] = rotl(v, 1, 1) + rotl(v, 2, 7) + rotl(v, 3, 12) + rotl(v, 4, 18);
            }
            else {
                v[0] = seed + XXH32_PRIMES[4];
            }

            v[0] += len;

            while (i < end) {
                v[0] += input[i] * XXH32_PRIMES[2];
                v[0] = rotl(v, 0, 17) * XXH32_PRIMES[3];
                i++;
            }

            v[0] ^= v[0] >>> 15;
            v[0] *= XXH32_PRIMES[1];
            v[0] ^= v[0] >>> 13;
            v[0] *= XXH32_PRIMES[2];
            v[0] ^= v[0] >>> 16;

            return v[0];
        };

        /**
         * apply friction to a force
         * @ignore
         * @TODO Move this somewhere else
         */
        api.applyFriction = function (v, f) {
            return (
                (v + f < 0) ? v + (f * me.timer.tick) :
                (v - f > 0) ? v - (f * me.timer.tick) : 0
            );
        };

        // return our object
        return api;
    })();
})();
