/*
	wot.js
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

var wot = {
	version: 20130626,
	platform: "chrome",
	debug: false,           // when changing this, don't forget to switch ga_id value also!
	default_component: 0,
	enable_surveys: true,   // Feedback loop engine

	ga_id: "UA-2412412-8", // test: UA-35564069-1 , live: UA-2412412-8

	// environment (browser, etc)
	env: {
		is_mailru: false,
		is_yandex: false,
		is_rambler: false,

		is_accessible: false
	},

	components: [
		{ name: 0 },
		{ name: 1 },
		{ name: 2 },
		{ name: 4 }
	],

	reputationlevels: [
		{ name: "rx", min: -2 },
		{ name: "r0", min: -1 },
		{ name: "r1", min:  0 },
		{ name: "r2", min: 20 },
		{ name: "r3", min: 40 },
		{ name: "r4", min: 60 },
		{ name: "r5", min: 80 }
	],

	confidencelevels: [
		{ name: "cx", min: -2 },
		{ name: "c0", min: -1 },
		{ name: "c1", min:  6 },
		{ name: "c2", min: 12 },
		{ name: "c3", min: 23 },
		{ name: "c4", min: 34 },
		{ name: "c5", min: 45 }
	],

	searchtypes: {
		optimized: 0,
		worst: 1,
		trustworthiness: 2
	},

	warningtypes: { /* bigger value = more severe warning */
		none: 0,
		notification: 1,
		overlay: 2,
		block: 3
	},

	warningreasons: { /* bigger value = more important reason */
		skipped: -1,
		none: 0,
		unknown: 1,
		rating: 2,
		reputation: 3
	},

	urls: {
		base:		"http://www.mywot.com/",
		scorecard:	"http://www.mywot.com/scorecard/",
		settings:	"http://www.mywot.com/settings",
		welcome:	"http://www.mywot.com/settings/welcome",
		setcookies:	"http://www.mywot.com/setcookies.php",
		update:		"http://www.mywot.com/update",
		tour_warning:"http://www.mywot.com/support/tour/warningscreen",
		tour:       "http://www.mywot.com/support/tour/",
		tour_rw:    "http://www.mywot.com/support/tour/ratingwindow",
		tour_scorecard: "http://www.mywot.com/support/tour/scorecard",

		contexts: {
			rwlogo:     "rw-logo",
			rwsettings: "rw-settings",
			rwguide:    "rw-guide",
            rwforum:    "rw-forum",
			rwviewsc:   "rw-viewsc",
			rwprofile:  "rw-profile",
			rwmsg:      "rw-msg",
			warnviewsc: "warn-viewsc",
			warnrate:   "warn-rate",
			popupviewsc: "popup",
			popupdonuts: "popup-donuts",
			fbl_logo:   "fbl-logo",
			wt_intro:   "wt-intro",
			wt_rw_lm:   "wt-rw-lm",
			wt_warn_lm: "wt-warn-lm",
			wt_warn_logo: "wt-warn-logo",
			wt_donuts_lm: "wt-donuts-lm",
			wt_donuts_logo: "wt-donuts-logo"
		}
	},

	firstrunupdate: 1, /* increase to show a page after an update */

	cachestatus: {
		error:	0,
		ok:		1,
		busy:	2,
		retry:	3,
		link:	4
	},

	badge_types: {
		notice: {   // for system notifications
			color: [240, 0, 0, 255],
			text: "1",
			type: "notice"  // important to compare with current status type
		},
		message: { // for messages from another users
			color: [160, 160, 160, 255],
			text: "",
			type: "message"
		}
	},

	expire_warned_after: 20000,  // number of milliseconds after which warned flag will be expired

	// trusted extensions IDs
	allowed_senders: {
		"ihcnfeknmfflffeebijjfbhkmeehcihn": true,   // dev version
		"bhmmomiinigofkjcapegjjndpbikblnp": true,   // WOT via WebStore
		"goinjpofmboaejkhflohjoloaoebfopj": true,   // WOT (m2) distributed via mywot.com
		"hghiafbmcdglhlkgpfafjjoigpghhilc": true    // Manifest-1 version of WOT addon
	},

	// engagement schedule
	engage_settings: {
		invite_to_rw: {
			delay: 12 * 3600,    // 12 hours after first launch
			pref_name: "ratingwindow_shown",
			enabled: true   // this is a cache value to avoid comprehensive logic work often (in case of = false)
		}
	},

	// Constants for playing with date & time (in seconds)
	DT: {
		MINUTE: 60,
		HOUR: 3600,
		DAY: 24 * 3600,
		WEEK: 7 * 24 * 3600,
		MONTH: 30 * 24 * 3600
	},

	/* logging */

	log: function (s)
	{
		if (wot.debug) {
			console.log(s);
		}
	},

	/* events */

	events: {},

	trigger: function (name, params, once)
	{
		if (this.events[name]) {
			if (wot.debug) {
				console.log("trigger: event " + name + ", once = " + once);
			}

			this.events[name].forEach(function (obj) {
				try {
					obj.func.apply(null, [].concat(params).concat(obj.params));
				} catch (e) {
					console.log("trigger: event " + name + " failed with " +
						e + "\n");
				}
			});

			if (once) { /* these events happen only once per bind */
				delete (this.events[name]);
			}
		}
	},

	bind: function (name, func, params)
	{
		if (typeof (func) == "function") {
			this.events[name] = this.events[name] || [];
			this.events[name].push({ func: func, params: params || [] });

			if (wot.debug) {
				console.log("bind: event " + name);
			}
			this.trigger("bind:" + name);
		}
	},

	addready: function (name, obj, func)
	{
		obj.ready = function (setready)
		{
			if (typeof(func) == "function") {
				this.isready = setready || func.apply(this);
			} else {
				this.isready = setready || this.isready;
			}
			if (this.isready) {
				wot.trigger(name + ":ready", [], true);
			}
		};

		obj.isready = false;

		this.bind("bind:" + name + ":ready", function() {
			obj.ready();
		});
	},

	/* messaging */

	connections: {},

	triggeronmessage: function(port)
	{
		port.onMessage.addListener(function(data) {
			wot.trigger("message:" + data.message, [ {
					port: port,
					post: function(message, data) {
						wot.post(this.port.name, message, data, this.port);
					}
				}, data ]);
		});
	},

	listen: function(names)
	{
		if (typeof(names) == "string") {
			names = [ names ];
		}

		chrome.extension.onConnect.addListener(function(port) {
			if (names.indexOf(port.name) >= 0) {
				wot.triggeronmessage(port);
				wot.connections[port.name] = port;
			}
		});
	},

	connect: function(name)
	{
		var port = this.connections[name];

		if (port) {
			return port;
		}

		port = chrome.extension.connect({ name: name });

		if (port) {
			this.triggeronmessage(port);
			this.connections[name] = port;
		}

		return port;
	},

	post: function(name, message, data, port)
	{
		port = port || this.connect(name);

		if (port) {
			data = data || {};
			data.message = name + ":" + message;
			this.log("post: posting " + data.message + "\n");
			port.postMessage(data);
		}
	},

	is_allowed_sender: function(sender_id) {
		return wot.allowed_senders[sender_id] || wot.debug; // allow known senders or any in
	},

	/* i18n */

	i18n: function(category, id, shorter)
	{
		var msg = category;

		if (shorter) {
			msg += "__short";
		}

		if (id != null) {
			msg += "_" + id;
		}

		var result = chrome.i18n.getMessage(msg);
	   
		if (result == null) {
			result = this.debug ? "!?" : "";
		}

		// Workaround for the Chrome's issue 53628
		// http://code.google.com/p/chromium/issues/detail?id=53628
		var temp_workaround = {
			"warnings_warning": "Warning!",
			"warnings_goto": "Go to the site",
			"warnings_leave": "Leave the site",
			"warnings_back": "Go back"
		};

		if (result == "") {
			var res_2 = temp_workaround[msg];
			if (res_2 != "") return res_2;
		}

		// END of workaround / remove it when the bug will be fixed

		return result;
	},

	/* helpers */

	getuniques: function(list)
	{
		var seen = {};

		return list.filter(function(item) {
					if (seen[item]) {
						return false;
					} else {
						seen[item] = true;
						return true;
					}
				});
	},

	/* rules */

	matchruleurl: function(rule, url)
	{
		try {
			return (RegExp(rule.url).test(url) &&
						(!rule.urlign || !RegExp(rule.urlign).test(url)));
		} catch (e) {
			console.log("matchurl: failed with " + e + "\n");
		}

		return false;
	},

	/* reputation and confidence */

	getlevel: function(levels, n)
	{
		for (var i = levels.length - 1; i >= 0; --i) {
			if (n >= levels[i].min) {
				return levels[i];
			}
		}

		return levels[1];
	},

	getwarningtypeforcomponent: function(comp, data, prefs)
	{
		var type = prefs["warning_type_" + comp] || this.warningtypes.none;

		if (!prefs["show_application_" + comp] ||
				type == this.warningtypes.none) {
			return null;
		}

		var r = -1, c = -1, t = -1;

		if (data[comp]) {
			r = data[comp].r;
			c = data[comp].c;
			t = data[comp].t;
		}

		var warninglevel = prefs["warning_level_" + comp] || 0;
		var minconfidence = prefs["min_confidence_level"] || 0;
		var forunknown = prefs["warning_unknown_" + comp];

		var rr = (r < -1) ? 0 : r;
		var cc = (c < -1) ? warninglevel : c;

		if (((rr >= 0 && rr <= warninglevel && /* poor reputation */
			  			/* and sufficient confidence */
						(cc >= minconfidence || forunknown)) ||
			 		/* or no reputation and warnings for unknown sites */
					(rr < 0 && forunknown)) &&
				/* and no rating that overrides the reputation */
				(t < 0 || t <= warninglevel)) {
			if (r < 0) {
				return {
					type: type,
					reason: this.warningreasons.unknown
				};
			} else {
				return {
					type: type,
					reason: this.warningreasons.reputation
				};
			}
		}

		/* or if the user has rated the site poorly */
		if (t >= 0 && t <= warninglevel) {
			return {
				type: type,
				reason: this.warningreasons.rating
			};
		}

		return null;
	},

	getwarningtype: function(data, prefs)
	{
		var warning = {
			type: this.warningtypes.none,
			reason: this.warningreasons.none
		};

		this.components.forEach(function(item) {
			var comp = wot.getwarningtypeforcomponent(item.name, data, prefs);

			if (comp) {
				warning.type   = Math.max(warning.type, comp.type);
				warning.reason = Math.max(warning.reason, comp.reason);
			}
		});

		return warning;
	},

	/* paths */

	getlocalepath: function(file)
	{
		return "_locales/" + this.i18n("locale") + "/" + file;
	},


	getincludepath: function(file)
	{
		return "skin/include/" + file;
	},

	geticon: function(r, size, accessible, options)
	{
		var name = "/",
			has_subtype = false,
			sub_type = "plain";

		if (options instanceof Object) {
			sub_type = options.subtype;
			has_subtype = !!sub_type;
			// todo: get other option here
		} else {
			// compatibility with old code (non-refactored: options is boolean)
			has_subtype = options; // sub_type might only be "plain" if plain is true.
		}

		if (typeof(r) == "number") {
			name += this.getlevel(this.reputationlevels, r).name;
		} else {
			name += r;
		}

		if (has_subtype) {
			name = "/" + sub_type + name;
		}

		var path = "skin/fusion/";

		if ((typeof(r) != "number" || r >= -1) && accessible) {
			path += "accessible/";
		}

		return path + size + "_" + size + name + ".png";
	},

	contextedurl: function(url, context)
	{
		var newurl = url;
		newurl += ( (url.indexOf("?") > 0) ? "&" : "?" );
		newurl += "utm_source=addon&utm_content=" + context;
		return newurl;
	},

	detect_environment: function(readonly)
	{
		readonly = readonly || false;
		// try to understand in which environment we are run
		var user_agent = window.navigator.userAgent || "";
		wot.env.is_mailru = user_agent.indexOf("MRCHROME") >= 0;

		// old yandex browser is named "Yandex Internet" (chromium 18), new browser is named "YaBrowser" (chromium 22+)
		wot.env.is_yandex = user_agent.indexOf("YaBrowser") >= 0 || user_agent.indexOf(" YI") >= 0;

		if(wot.env.is_mailru) {
			// set param to label requests
			wot.partner = "mailru";
		}

		if(!readonly) wot.prefs.set("partner", wot.partner);

		// Is the mode "accessible" set on?
		wot.env.is_accessible = wot.prefs.get("accessible");
	},

	time_sincefirstrun: function()
	{
		// gives time (in seconds) spent from very first run of the addon.
		var starttime_str = wot.prefs.get("firstrun:time");
		if (starttime_str) {
			var starttime = new Date(starttime_str);
			return (new Date() - starttime) / 1000;    // in seconds;

		} else {
			return undefined;
		}
	},

	time_since: function(a, b) {

		if (typeof a === "string") {
			a = new Date(a);
		}

		b = b || new Date();

		if (typeof b === "string") {
			b = new Date(b);
		}

		return (b - a) / 1000;  // in seconds
	},

	is_defined: function (list, prefix) {
		// test if locale strings are available (due to bug in Chrome, it is possible to get "undefined")
		if (list instanceof Array != true) return false;
		for(var i in list) {
			if (wot.i18n(prefix, list[i]) === undefined) {
				return false; // avoid showing "undefined" strings in Tips. Postpone to browser's restart (it fixes usually)
			}
		}
		return true;
	},

	get_activity_score: function (onget) {
		var pref_name = "activity_score",
			proxy_wot = wot;
		if (wot.core || wot.ratingwindow) {
			// wow, we are in the background page or Rating window

			if (wot.ratingwindow) {
				// use reference to BG page
				var bg = chrome.extension.getBackgroundPage();
				proxy_wot = bg.wot;
			}

			if (proxy_wot.core.activity_score == 0) {
				// lets check what we have in local storage
				return proxy_wot.prefs.get(pref_name);
			} else {
				return proxy_wot.core.activity_score;
			}
		} else {
			// yay, we are in a content script. Have to use functional-style
			wot.prefs.get(pref_name, onget);
		}
	}
};


wot.utils = {

	get_document: function (frame) {
		frame = frame || window;
		var framed_document = frame.document || frame.contentDocument;
		return framed_document;
	},

	get_or_create_element: function (id, tag, frame) {
		tag = tag || "div";
		var framed_document = wot.utils.get_document(frame);

		var elem = framed_document.getElementById(id);

		if(!elem) {
			elem = framed_document.createElement(tag);
			elem.setAttribute("id", id);
		}

		return elem;
	},

	attach_element: function (element, frame) {
		var framed_document = wot.utils.get_document(frame);

		if(framed_document) {
			var body = framed_document.getElementsByTagName("body");

			if (!element || !body || !body.length) {
				return false;
			}

			return body[0].appendChild(element);
		} else {
			wot.log("Can't get document of frame");
			return false;
		}

	},

	attach_style: function (style_file_or_object, uniq_id, frame) {
		try {
			uniq_id = uniq_id || null;
			var reuse_style = false;

			var framed_document = wot.utils.get_document(frame);

			if(!framed_document) {
				return false;
			}

			if(uniq_id) {
				var el = framed_document.getElementById(uniq_id);
				if(el) {
					// if the element exists already - remove it to update styles
					reuse_style = true;
				}
			}

			var head = framed_document.getElementsByTagName("head");

			if (!head || !head.length) {
				return false;
			}

			var style = reuse_style ? el : framed_document.createElement("style");

			if (!style) {
				return false;
			}

			if(uniq_id) {
				style.setAttribute("id", uniq_id);
			}

			style.setAttribute("type", "text/css");

			if (typeof style_file_or_object === "object") {
				style.innerText = style_file_or_object.style;
			} else {
				style.innerText = "@import \"" +
					chrome.extension.getURL(wot.getincludepath(style_file_or_object)) +
					"\";";
			}

			if (!reuse_style) {
				head[0].appendChild(style);
			}

			return true;
		} catch (e) {
			console.log("wot.utils.attach_style() failed with", e, "Arguments:", arguments);
			return false;
		}
	},

	processhtml: function (html, replaces) {
		try {
			replaces.forEach(function(item) {
				html = html.replace(RegExp("{" + item.from + "}", "g"),
					item.to);
			});

			return html;
		} catch (e) {
			console.log("warning.processhtml: failed with " + e);
		}

		return "";
	},

	htmlescape: function(str) {
		var tagsToReplace = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;'
		};
		return str.replace(/[&<>]/g, function(symb) {
			return tagsToReplace[symb] || symb;
		});
	}
};
