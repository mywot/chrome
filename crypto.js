/*
	crypto.js
	Copyright © 2009 - 2013  WOT Services Oy <info@mywot.com>

	This file is part of WOT.

	WOT is free software: you can redistribute it and/or modify it
	under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	WOT is distributed in the hope that it will be useful, but WITHOUT
	ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
	or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
	License for more details.

	You should have received a copy of the GNU General Public License
	along with WOT. If not, see <http://www.gnu.org/licenses/>.
*/

$.extend(wot, { crypto: {
	counter: Date.now(),

	getnonce: function(seed)
	{
		/* must be unique, not necessarily unpredictable */
		var data = "nonce:" + wot.version +
						":" + window.navigator.language +
						":" + this.counter++ +
						":" + Date.now() +
						":" + Math.random() +
						":" + ((wot.witness || {}).id || "") +
						":" + (seed || "");

		return this.bintohex(this.sha1.sha1str(data));
	},

	decrypt: function(data, nonce, index)
	{
		try {
			if (data && nonce) {
				var key = (wot.witness || {}).key;

				if (index == undefined || index < 0) {
					index = "";
				} else {
					index = "-" + index;
				}

				if (key) {
					return this.bintostr(this.arc4.crypt(
							this.arc4.create(this.sha1.hmacsha1hex(key,
								"response-" + nonce + index)),
							this.strtobin(atob(data))));
				}
			}
		} catch (e) {
			console.log("crypto.decrypt: failed with " + e + "\n");
		}

		return null;
	},

	encrypt: function(data, nonce)
	{
		try {
			if (data && nonce) {
				var key = (wot.witness || {}).key;

				if (key) {
					return btoa(this.bintostr(this.arc4.crypt(
							this.arc4.create(this.sha1.hmacsha1hex(key, nonce)),
							this.strtobin(data))));
				}
			}
		} catch (e) {
			console.log("crypto.encrypt: failed with " + e + "\n");
		}

		return null;
	},

	authenticate: function(data)
	{
		try {
			var key = (wot.witness || {}).key;

			if (key) {
				return this.bintohex(this.sha1.hmacsha1hex(key, data));
			}
		} catch (e) {
			console.log("crypto.authenticate: failed with " + e + "\n");
		}

		return null;
	},

	arc4: {
		create: function(key)
		{
			var i, j = 0, k = 0, l;
			var ctx = {};

			ctx.s = [];
			ctx.x = 1;
			ctx.y = 0;

			for (i = 0; i < 256; ++i) {
				ctx.s[i] = i;
			}

			for (i = 0; i < 256; ++i) {
				l = ctx.s[i];
				j = (j + key[k] + l) & 0xFF;
				ctx.s[i] = ctx.s[j];
				ctx.s[j] = l;

				if (++k >= key.length) {
					k = 0;
				}
			}

			return ctx;
		},

		crypt: function(ctx, input)
		{
			var i, j, k;
			var output = [];

			for (i = 0; i < input.length; ++i) {
				j = ctx.s[ctx.x];
				ctx.y = (ctx.y + j) & 0xFF;
				k = ctx.s[ctx.y];
				ctx.s[ctx.x] = k;
				ctx.s[ctx.y] = j;
				ctx.x = (ctx.x + 1) & 0xFF;
				output[i] = (input[i] ^ ctx.s[(j + k) & 0xFF]) & 0xFF;
			}

			return output;
		}
	},

	sha1: {
		hmacsha1hex: function(hexkey, str)
		{
			var key = wot.crypto.hextobin(hexkey);

			if (key.length > 20) {
				key = wot.crypto.sha1bin(key);
			}

			var ipad = Array(64), opad = Array(64);

			for (var i = 0; i < 20; ++i) {
				ipad[i] = key[i] ^ 0x36;
				opad[i] = key[i] ^ 0x5C;
			}
			for (var j = 20; j < 64; ++j) {
				ipad[j] = 0x36;
				opad[j] = 0x5C;
			}

			var inner = this.sha1bin(ipad.concat(wot.crypto.strtobin(str)));
			return this.sha1bin(opad.concat(inner));
		},

		sha1bin: function(bin)
		{
			return this.sha1str(wot.crypto.bintostr(bin));
		},

		sha1hex: function(hex)
		{
			return this.sha1str(wot.crypto.hextostr(hex));
		},

		/* A JavaScript implementation of the Secure Hash Algorithm, SHA-1,
			as defined in FIPS PUB 180-1
			Version 2.1a Copyright Paul Johnston 2000 - 2002.
			Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
			Distributed under the BSD License
			See http://pajhome.org.uk/crypt/md5 for details. */

		sha1str: function(str)
		{
			var ft = function(t, b, c, d)
			{
				if (t < 20) {
					return (b & c) | ((~b) & d);
				}
				if (t >= 40 && t < 60) {
					return (b & c) | (b & d) | (c & d);
				}
				return b ^ c ^ d;
			};

			var kt = function(t)
			{
				if (t < 20) {
					return 1518500249;
				}
				if (t < 40) {
					return 1859775393;
				}
				if (t < 60) {
					return -1894007588;
				}
				return -899497514;
			};

			var add = function(x, y)
			{
				var lsw = (x & 0xFFFF) + (y & 0xFFFF);
				var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
				return (msw << 16) | (lsw & 0xFFFF);
			};

			var rol = function(num, cnt)
			{
				return (num << cnt) | (num >>> (32 - cnt));
			};

			var len = str.length * 8;
			var bin = [];
			var mask = (1 << 8) - 1;

			for (var i = 0; i < len; i += 8) {
				bin[i >> 5] |= (str.charCodeAt(i / 8) & mask) << (24 - i % 32);
			}

			bin[len >> 5] |= 0x80 << (24 - len % 32);
			bin[((len + 64 >> 9) << 4) + 15] = len;

			var w = Array(80);
			var a =  1732584193;
			var b = -271733879;
			var c = -1732584194;
			var d =  271733878;
			var e = -1009589776;

			for (var i = 0; i < bin.length; i += 16) {
				var olda = a;
				var oldb = b;
				var oldc = c;
				var oldd = d;
				var olde = e;

				for (var j = 0; j < 80; j++) {
					if (j < 16) {
						w[j] = bin[i + j];
					} else {
						w[j] = rol(w[j -  3] ^ w[j -  8] ^
								   w[j - 14] ^ w[j - 16], 1);
					}

					var t = add(add(rol(a, 5), ft(j, b, c, d)),
								add(add(e, w[j]), kt(j)));

					e = d;
					d = c;
					c = rol(b, 30);
					b = a;
					a = t;
				}

				a = add(a, olda);
				b = add(b, oldb);
				c = add(c, oldc);
				d = add(d, oldd);
				e = add(e, olde);
			}

			bin = [ a, b, c, d, e ];
			str = "";

			for (var i = 0; i < bin.length * 32; i += 8) {
				str += String.fromCharCode((bin[i >> 5] >>> (24 - i % 32)) & mask);
			}

			return wot.crypto.strtobin(str);
		}
	},

	strtobin: function(str)
	{
		var bin = [];

		for (var i = 0; i < str.length; ++i) {
			bin[i] = str.charCodeAt(i) & 0xFF;
		}

		return bin;
	},

	bintostr: function(bin)
	{
		var str = "";

		for (var i = 0; i < bin.length; ++i) {
			str += String.fromCharCode(bin[i] & 0xFF);
		}

		return str;
	},

	hextobin: function(str)
	{
		var asciitonibble = function(c)
		{
			var code_a = 'a'.charCodeAt(0);

			if (c >= code_a) {
				return (c - code_a + 10);
			} else {
				return (c - '0'.charCodeAt(0));
			}
		}

		var bin = [];

		for (var i = 0; i < str.length / 2; ++i) {
			bin[i] = asciitonibble(str.charCodeAt(2 * i    )) <<  4 |
					 asciitonibble(str.charCodeAt(2 * i + 1)) & 0xF;
		}

		return bin;
	},

	bintohex: function(bin)
	{
		const HEX = "0123456789abcdef";
		var str = "";

		for (var i = 0; i < bin.length; ++i) {
			str += HEX.charAt((bin[i] >> 4) & 0xF);
			str += HEX.charAt( bin[i]       & 0xF);
		}

		return str;
	}
}});
