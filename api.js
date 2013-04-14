/*
	api.js
	Copyright © 2009, 2010, 2011  WOT Services Oy <info@mywot.com>

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

$.extend(wot, { api: {
	info: {
		maxhosts: 100,
		maxparamlength: 4096,
		server: "api.mywot.com",
		secure: true,
        prefetch_link: false,   // if true, /link API will fetch user's testimonies
		updateformat: 4,
		updateinterval: 3 * 3600 * 1000,
		cookieinterval: 86340 * 1000,
		version: "0.4",
		timeout: 15 * 1000,
		errortimeout: 60 * 1000,
		retrytimeout: {
			link:	        2 * 1000,
			query:		   30 * 1000,
			register:	   30 * 1000,
			reload:	   5 * 60 * 1000,
			submit:	   5 * 60 * 1000,
			update:	  15 * 60 * 1000
		},
		maxlinkretries: 3,
		maxregisterretries: 5
	},

	state: {},
	cookieupdated: 0,

	call: function(apiname, options, params, onerror, onsuccess)
	{
		try {
			var nonce = wot.crypto.getnonce(apiname);

			params = params || {};

			$.extend(params, {
				id:		 (wot.witness || {}).id,
				nonce:   nonce,
				partner: wot.partner,
				lang:	 wot.i18n("lang"),
				version: wot.platform + "-" + wot.version
			});

			options = options || {};

			if (options.encryption) {
				$.extend(params, {
					target: wot.crypto.encrypt(params.target, nonce),
					hosts:  wot.crypto.encrypt(params.hosts,  nonce),
					url:    wot.crypto.encrypt(params.url,  nonce)
				});
			}

			var components = [];

			for (var i in params) {
				if (params[i] != null) {
					components.push(i + "=" + encodeURIComponent(params[i]));
				}
			}

			var path = "/" + this.info.version + "/" + apiname + "?" +
							components.join("&");

			if (options.authentication) {
				var auth = wot.crypto.authenticate(path);

				if (!auth || !components.length) {
					return false;
				}

				path += "&auth=" + auth;
			}

			var url = ((this.info.secure && options.secure) ?
							"https://" : "http://") + this.info.server + path;

			wot.log("api.call: url = " + url + "\n");

			$.ajax({
				dataType: "xml",
				timeout: wot.api.info.timeout,
				url: url,

				error: function(request, status, error)
				{
					console.log("api.call.error: url = " + url + ", status = " +
						status + "\n");

					if (typeof(onerror) == "function") {
						onerror(request, status, error);
					}
				},

				success: function(data, status)
				{
					wot.log("api.call.success: url = " + url + ", status = " +
						status + "\n");

					if (typeof(onsuccess) == "function") {
						onsuccess(data, status, nonce);
					}
				}
			});

			return true;
		} catch (e) {
			console.log("api.call: failed with " + e + "\n");
		}

		return false;
	},

	isregistered: function()
	{
		try {
			wot.witness = wot.witness || {
				id:  wot.prefs.get("witness_id"),
				key: wot.prefs.get("witness_key")
			};

			var re  = /^[a-f0-9]{40}$/;
			var rv = (re.test(wot.witness.id) && re.test(wot.witness.key));

			wot.log("api.isregistered: " + rv + ", id = " + wot.witness.id + "\n");
			return rv;
		} catch (e) {
			console.log("api.isregistered: failed with " + e + "\n");
		}

		return false;
	},

	retry: function(apiname, params, customtimeout)
	{
		var timeout = customtimeout || this.info.retrytimeout[apiname];

		if (timeout) {
			window.setTimeout(function() {
					wot.api[apiname].apply(wot.api, params || []);
				}, timeout);
		}
	},

	error: function(message)
	{
		console.log(message);

		var nonce = wot.crypto.getnonce("error");

		var params = {
			id:		 (wot.witness || {}).id,
			nonce:   nonce,
			partner: wot.partner,
			lang:	 wot.i18n("lang"),
			version: wot.platform + "-" + wot.version,
			message: message
		};

		var components = [];

		for (var i in params) {
			if (params[i] != null) {
				components.push(i + "=" + encodeURIComponent(params[i]));
			}
		}

		var url = "http://" + this.info.server + "/error?" +
					components.join("&");

		$.ajax({ url: url });
	},

	setids: function(tag, data)
	{
		try {
			var elems = data.getElementsByTagName(tag);

			if (!elems || !elems.length) {
				this.error("api.setids: missing tag " + tag);
				return false;
			}

			var id  = elems[0].getAttribute("id");
			var key = elems[0].getAttribute("key");

			if (!id || !key) {
				this.error("api.setids: missing attribute");
				return false;
			}

			var re  = /^[a-f0-9]{40}$/;

			if (!re.test(id) || !re.test(key)) {
				this.error("api.setids: invalid data");
				return false;
			}

			wot.witness = { id: id, key: key };

			wot.prefs.set("witness_id", id);
			wot.prefs.set("witness_key", key);

			wot.log("api.setids: id = " + id + "\n");
			return true;
		} catch (e) {
			this.error("api.setids: failed with " + e);
		}

		return false;
	},

	processpending: function()
	{
		wot.prefs.each(function(name, value) {
			if (/^pending\:/.test(name)) {
				wot.api.submit(name.replace(/^pending\:/, ""));
			}
			return false;
		});
	},

	processcookies: function(current)
	{
		if (!this.isregistered() || !wot.prefs.get("my_cookies")) {
			return null;
		}

		current = current || "";

		var id = wot.witness.id;
		var match = /reload=([0-9a-f]{40})/.exec(current);

		if (match && match[1] != id) {
			this.reload(match[1], function() {
				wot.api.cookieupdated = 0;
			});
		}

		var now = Date.now();

		/* these are set every time */
		var setcookies = [
			"accessible=" + (wot.prefs.get("accessible") ? "true" : "false"),
			"partner=" 	  + (wot.partner || "")
		];

		if (this.cookieupdated > 0 &&
				(now - this.cookieupdated) < this.info.cookieinterval &&
				/authid=[0-9a-f]{40}/.test(current)) {
			return setcookies;
		}

		this.cookieupdated = now;

		/* authentication cookies only when needed */
		var cookies = {
			id:  	id,
			nonce:	wot.crypto.getnonce("cookies")
		};

		cookies.auth = wot.crypto.authenticate("id=" + cookies.id +
							"&nonce=" + cookies.nonce);

		for (var i in cookies) {
			setcookies.push(i + "=" + /* if null, set to an empty value */
				encodeURIComponent(cookies[i] || ""));
		}

		return setcookies;
	},

	setcookies: function(onready)
	{
		onready = onready || function() {};
		var cookies = this.processcookies();

		if (cookies) {
			/* this sets our authentication cookies (and only them) if
				they haven't been set already */
			$.ajax({
				url: wot.urls.setcookies + "?" + cookies.join("&"),
				complete: onready
			});
		}
	},

	link: function(hosts, onupdate, retrycount)
	{
		onupdate = onupdate || function() {};

		var cached = [], fetch = [];
		var now = Date.now();

		hosts.forEach(function(h) {
			var obj = wot.cache.get(h);

			if (obj) {
				if (obj.status == wot.cachestatus.ok ||
						obj.status == wot.cachestatus.link) {
					cached.push(h);
					return;
				}

				if ((obj.status == wot.cachestatus.error ||
					 obj.status == wot.cachestatus.busy) &&
						(now - obj.updated) < wot.api.info.errortimeout) {
					cached.push(h);
					return;
				}
			}

			fetch.push(h);
		});

		onupdate(cached);

		while (fetch.length > 0) {
			var batch = fetch.splice(0, this.info.maxhosts);

			batch.forEach(function(h) {
				wot.cache.set(h, wot.cachestatus.busy);
			});

			/* no need to call onupdate here for link requests */

			this.linkcall(batch, onupdate, retrycount);
		}

		return true;
	},

	linkcall: function(batch, onupdate, retrycount)
	{
		if (batch.length == 0) {
			return;
		}

		var hosts = batch.join("/") + "/";

		/* split into two requests if the parameter is too long */
		if (hosts.length >= this.info.maxparamlength &&
				batch.length > 1) {
			this.linkcall(batch.splice(0, batch.length / 2), onupdate,
				retrycount);
			this.linkcall(batch, onupdate, retrycount);
			return;
		}

        var params = {
            hosts: hosts
        };

        if (wot.api.info.prefetch_link) {
            params.mode = "prefetch";
        }

		this.call("link", {
				authentication: true,
				encryption: true
			}, params,
			function(request)
			{
				batch.forEach(function(h) {
					wot.cache.set(h, wot.cachestatus.retry);
				});

				onupdate(batch);
			},
			function(data)
			{
				wot.cache.cacheresponse(batch, data, wot.cachestatus.link);

				var retry = [];

				batch.forEach(function(h) {
					var obj = wot.cache.get(h);

					if (obj &&
						(obj.status != wot.cachestatus.ok &&
						 obj.status != wot.cachestatus.link)) {
						if (wot.url.isencodedhostname(h)) {
							retry.push(h);
							wot.cache.set(h, wot.cachestatus.retry);
						} else {
							wot.cache.set(h, wot.cachestatus.error);
						}
					}
				});

				onupdate(batch);
				
				retrycount = retrycount || 0;

				if (retry.length > 0 &&
						++retrycount <= wot.api.info.maxlinkretries) {
					wot.api.retry("link", [ retry, onupdate, retrycount ],
						retrycount * wot.api.info.retrytimeout.link);
				}
			});
	},

	query: function(target, onupdate)
	{
		onupdate = onupdate || function() {};

		var obj = wot.cache.get(target);

		if (obj && (obj.status == wot.cachestatus.ok ||
				((obj.status == wot.cachestatus.error ||
				    obj.status == wot.cachestatus.busy) &&
					(Date.now() - obj.updated) < this.info.errortimeout))) {
			onupdate([ target ]);
			return true;
		}

		wot.cache.set(target, wot.cachestatus.busy);
		onupdate([ target ]);

		return this.call("query", {
				authentication: true,
				encryption: true
			}, {
				target: target
			},
			function(request)
			{
				wot.cache.set(target, wot.cachestatus.error);

				if (request.status != 403) {
					wot.api.retry("query", [ target, onupdate ]);
				}

				onupdate([ target ]);
			},
			function(data)
			{
				if (wot.cache.cacheresponse([ target ], data) != 1) {
					wot.cache.set(target, wot.cachestatus.error);
				}

				wot.core.setusermessage(data);
				wot.core.setusercontent(data);
				wot.core.setuserlevel(data);

				onupdate([ target ]);
			});
	},

	register: function(onsuccess, retrycount)
	{
		onsuccess = onsuccess || function() {};

		if (this.isregistered()) {
			onsuccess();
			return true;
		}
		
		retrycount = retrycount || 0;

		if (++retrycount > this.info.maxregisterretries) {
			return false;
		}

		this.call("register", {
				secure: true
			}, {
				retrycount: retrycount
			},
			function(request, status)
			{
				if (request.status == 200) {
					/* jQuery error */
					if (wot.api.setids("register", request.responseXML)) {
						onsuccess();
						wot.api.error("api.register: recovered from jQuery " +
							"error: " + status);
						return;
					}
				}

				if (request.status != 403) {
					wot.api.retry("register", [ onsuccess, retrycount ]);
					wot.api.error("api.register: failed with status " +
						request.status + " (" + status + ")");
				}
			},
			function(data)
			{
				if (wot.api.setids("register", data)) {
					onsuccess();
				} else {
					wot.api.retry("register", [ onsuccess, retrycount ]);
				}
			});
	},

	reload: function(toid, onsuccess, isretry)
	{
		onsuccess = onsuccess || function() {};

		if (!/^[a-f0-9]{40}$/.test(toid) ||
				toid == wot.witness.id ||
				(!isretry && this.reloadpending)) {
			return;
		}

		this.reloadpending = true;

		this.call("reload", {
				authentication: true,
				secure: true
			}, {
				reload: toid
			},
			function(request)
			{
				if (request.status != 403) {
					wot.api.retry("reload", [ toid, onsuccess, true ]);
				}
			},
			function(data)
			{
				if (wot.api.setids("reload", data)) {
					wot.cache.clearall();
					wot.api.reloadpending = false;
					onsuccess(toid);
				} else {
					wot.api.retry("reload", [ toid, onsuccess, true ]);
				}
			});
	},

	submit: function(target, testimonies)
	{
		var state = wot.prefs.get("pending:" + target) || {
			target: target,
			testimonies: {},
			tries: 0
		};

		if (testimonies) {
			$.extend(state.testimonies, testimonies);
			state.tries = 0;
		}

		if (++state.tries > 30) {
			wot.log("api.submit: failed " + target + " (tries)");
			wot.prefs.clear("pending:" + target);
			return;
		}

		wot.prefs.set("pending:" + target, state);

		this.call("submit", {
				authentication: true,
				encryption: true
			},
			$.extend({ target: target }, state.testimonies),
			function(request)
			{
				if (request.status != 403) {
					wot.api.retry("submit", [ target ]);
				} else {
					wot.log("api.submit: failed " + target + " (403)")
					wot.prefs.clear("pending:" + target);
				}
			},
			function(data)
			{
				var elems = data.getElementsByTagName("submit");

				if (elems && elems.length > 0) {
					wot.log("api.submit: submitted " + target);
					wot.prefs.clear("pending:" + target);
				} else {
					wot.api.retry("submit", [ target ]);
				}
			});
	},

	feedback: function (question_id, choice, url)
	{
		var options = {
			authentication: true,
			encryption: true
		};

		var params = {
			question: question_id,
			choice: choice,
			url: url
		};

		this.call("feedback", options, params,
			function (request) {   // on error
				wot.log("api.feedback: failed. Params: ", params, request);
			},
			function (data) {   // on success
				wot.log("api.feedback: sent successfully ", params);
			});
	},

	parse: function(elem)
	{
		try {
			var obj = {};
			var attr = elem.attributes;

			for (var i = 0; attr && i < attr.length; ++i) {
				obj[attr[i].name] = attr[i].value;
			}

			$(elem).children().each(function() {
				var child = wot.api.parse(this);

				if (child) {
					var name = this.nodeName.toLowerCase();
					obj[name] = obj[name] || [];

					if (typeof(obj[name]) == "object" &&
							typeof(obj[name].push) == "function") {
						obj[name].push(child);
					} else {
						/* shouldn't happen... */
						wot.log("api.parse: attribute / child collision\n");
					}
				}
			});

			return obj;
		} catch (e) {
			console.log("api.parse: failed with " + e + "\n");
		}

		return null;
	},

	update: function()
	{
        // update the internal flag for prefetching testimonies
        wot.api.info.prefetch_link = !!wot.prefs.get("super_showtestimonies");

		var state = wot.prefs.get("update:state") || {
			last: 0,
			lastversion: wot.version
		};

		var updateinterval = this.info.updateinterval;

		if (state.interval) {
			updateinterval = state.interval * 1000;
		}

		var age = Date.now() - state.last;

		if (age < updateinterval && state.lastversion == wot.version) {
			this.state = state;
			wot.url.updatestate(state);
			wot.api.retry("update", [], updateinterval - age);
			return;
		}

		this.call("update", {
				secure: true
			}, {
				format: wot.api.info.updateformat
			},
			function(request)
			{
				wot.api.retry("update");
			},
			function(data)
			{
				try {
					var newstate = {
						last: Date.now(),
						lastversion: wot.version
					};

					var root = data.getElementsByTagName(wot.platform);

					if (root && root.length > 0) {
						var obj = wot.api.parse(root[0]);

						if (obj) {
							$.extend(newstate, obj);

							if (newstate.interval) {
								updateinterval = newstate.interval * 1000;
							}
						}
					}

					wot.prefs.set("update:state", newstate);
					wot.api.state = newstate;
					wot.url.updatestate(newstate);

					/* poll for updates regularly */
					wot.api.retry("update", [], updateinterval);
				} catch (e) {
					console.log("api.update.success: failed with " + e + "\n");
					wot.api.retry("update");
				}
			});
	}

}});
