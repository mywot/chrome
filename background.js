/*
	background.js
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

$.extend(wot, { core: {
	usermessage: {},
	usercontent: [],
	activity_score: 0,
	badge_status: null,
	first_run: false,       // sesion variable, to know if this launch is the first after installation
	launch_time: null,      // time when current session was started

	loadratings: function (hosts, onupdate)
	{
		if (typeof (hosts) == "string") {
			var target = wot.url.gethostname(hosts);

			if (target) {
				return wot.api.query(target, onupdate);
			}
		} else if (typeof (hosts) == "object" && hosts.length > 0) {
			return wot.api.link(hosts, onupdate);
		}

		(onupdate || function () {})([]);
		return false;
	},

	update: function ()
	{
		try {
			chrome.windows.getAll({}, function(windows) {
				windows.forEach(function(view) {
					chrome.tabs.getSelected(view.id, function(tab) {
						wot.core.updatetab(tab.id);
					});
				});
			});
		} catch (e) {
			console.log("core.update: failed with " + e);
		}
	},

	updatetab: function(id)
	{
		chrome.tabs.get(id, function(tab) {
			wot.log("core.updatetab: " + id + " = " + tab.url);

			if (wot.api.isregistered()) {
				wot.core.loadratings(tab.url, function(hosts) {
					wot.core.updatetabstate(tab, {
						target: hosts[0],
						decodedtarget: wot.url.decodehostname(hosts[0]),
						cached: wot.cache.get(hosts[0]) || { value: {} }
					});
				});

				wot.core.engage_me();

			} else {
				wot.core.updatetabstate(tab, { status: "notready" });
			}
		});
	},

	geticon: function(data)
	{
		try {
			if (data.status == "notready") {
				return "loading";
			}

			var cached = data.cached || {};
		
			if (cached.status == wot.cachestatus.ok) {
				/* reputation */
				var def_comp = cached.value[wot.default_component];

				var result = wot.getlevel(wot.reputationlevels,
								(def_comp && def_comp.r != null) ?
									def_comp.r : -1).name;

				/* additional classes */
				if (result != "rx") {
					if (this.unseenmessage()) {
						result = "message_" + result;
					} else if (result != "r0" &&
								!wot.components.some(function(item) {
									return (cached.value[item.name] &&
											cached.value[item.name].t >= 0);
								})) {
						result = "new_" + result;
					}
				}

				return result;
			} else if (cached.status == wot.cachestatus.busy) {
				return "loading";
			} else if (cached.status == wot.cachestatus.error) {
				return "error";
			}
			
			return "default";
		} catch (e) {
			console.log("core.geticon: failed with " + e);
		}

		return "error";
	},

	seticon: function(tab, data)
	{
		try {
			var canvas = document.getElementById("wot-icon");
			var context = canvas.getContext("2d");
			var icon = new Image();

			icon.onload = function() {
				context.clearRect(0, 0, canvas.width, canvas.height);
				context.drawImage(icon, 0, 0, 19, 19);

				chrome.browserAction.setIcon({
					tabId: tab.id,
					imageData: context.getImageData(0, 0, canvas.width,
								canvas.height)
				});
			};

			icon.src = wot.geticon(this.geticon(data), 19,
							wot.prefs.get("accessible"));
		} catch (e) {
			console.log("core.seticon: failed with " + e + "\n");
		}
	},

	updatetabstate: function(tab, data)
	{
		try {
			if (tab.selected) {
				/* update the browser action */
				this.seticon(tab, data);

				/* update the rating window */
				var views = chrome.extension.getViews({});

				for (var i in views) {
					if (views[i].wot && views[i].wot.ratingwindow) {
						views[i].wot.ratingwindow.update(tab, data);
					}
				}
			}

			/* update content scripts */
			var warning_type = this.updatetabwarning(tab, data);

			// show surveys only if there is no warning
			if (tab.selected &&
				warning_type && warning_type.type == wot.warningtypes.none) {

				if (wot.enable_surveys) {
					wot.surveys.update(tab, data);
				}
			}

		} catch (e) {
			console.error("core.updatetabstate: failed with ", e);
		}
	},

	updatetabwarning: function(tab, data)
	{
		var cached = data.cached, warned = null;

		var warning = {
			type: wot.warningtypes.none,
			reason: wot.warningreasons.none
		};

		try {


			/* Check if "warned" flag is expired */
			if(cached.flags && cached.flags.warned) {
				warned = cached.flags.warned;

				var ctime = (new Date()).getTime();
				if(cached.flags.warned_expire && (ctime > cached.flags.warned_expire)) {
					warned = false;
				}
			}

			if (cached.status != wot.cachestatus.ok || warned) {
				if (warned) warning.reason = wot.warningreasons.skipped;
				return warning; /* don't change the current status */
			}
			
			var prefs = [
				"accessible",
				"min_confidence_level",
				"warning_opacity"
			];

			wot.components.forEach(function(item) {
				prefs.push("show_application_" + item.name);
				prefs.push("warning_level_" + item.name);
				prefs.push("warning_type_" + item.name);
				prefs.push("warning_unknown_" + item.name);
			});

			var settings = {};

			prefs.forEach(function(item) {
				settings[item] = wot.prefs.get(item);
			});

			var type = wot.getwarningtype(cached.value, settings);

			var show_wtip = wot.wt.warning.tts();

			if (type && type.type === wot.warningtypes.overlay) {
				var port = chrome.tabs.connect(tab.id, { name: "warning" });

				if (port) {
					port.postMessage({
						message: "warning:show",
						data: data,
						type: type,
						settings: settings,
						show_wtip: show_wtip
					});
				}
			}

			return type;

		} catch (e) {
			wot.log("core.updatetabwarning: failed with ", e);
		}
	},

	setusermessage: function(data)
	{
		try {

			var usermessage = {};

			var elems = data.getElementsByTagName("message");

			for (var i = 0; elems && i < elems.length; ++i) {
				var elem = $(elems[i]);

				var obj = {
					text: elem.text()
				};

				[ "id", "type", "url", "target", "version", "than" ]
					.forEach(function(name) {
						obj[name] = elem.attr(name);
					});

				if (obj.id && obj.type &&
						(obj.target == "all" || obj.target == wot.platform) &&
						(!obj.version || !obj.than ||
						 	(obj.version == "eq" && wot.version == obj.than) ||
							(obj.version == "le" && wot.version <= obj.than) ||
							(obj.version == "ge" && wot.version >= obj.than))) {
					usermessage = obj;
					break;
				}
			}

			if(this.usermessage && this.usermessage.system_type) {
				// don't change UserMessage if there is a system (addon's) one isn't shown yet. Keep it.
				this.usermessage.previous = usermessage;
			} else {
				this.usermessage = usermessage;
			}


		} catch (e) {
			console.log("core.setusermessage: failed with " + e);
		}
	},

	unseenmessage: function()
	{
		return (this.usermessage &&
					this.usermessage.text &&
					this.usermessage.id &&
					this.usermessage.id != wot.prefs.get("last_message") &&
					this.usermessage.id != "downtime");
	},

	setusercontent: function(data)
	{
		try {
			this.usercontent = [];

			var elems = data.getElementsByTagName("user");

			for (var i = 0; elems && i < elems.length &&
					this.usercontent.length < 4; ++i) {
				var elem = $(elems[i]);
				var obj = {};

				[ "icon", "bar", "length", "label", "url", "text", "notice" ]
					.forEach(function(name) {
						obj[name] = elem.attr(name);
					});

				if (obj.text && (!obj.bar ||
						(obj.length != null && obj.label))) {
					this.usercontent.push(obj);
				}
			}
			this.update_activity_score();

		} catch (e) {
			console.log("core.setusercontent: failed with " + e + "\n");
		}
	},

	update_activity_score: function ()
	{
		if (this.usercontent.length > 0) {
			var uc0 = this.usercontent[0];  // we assume that ActivityScore is delivered to the addon in the first item
			if (uc0 && uc0.label && uc0.label.length) {
				var a_score = 0;
				try {
					a_score = Number(uc0.label, 10);
				} catch (e) {
					// Label field doesn't contain a number, assume a_score = 0
				}

				if (this.activity_score != a_score) {
					// update local storage only when score has been changed
					wot.prefs.set("activity_score", a_score);
				}
				this.activity_score = a_score;
			}
		}
	},

	engage_me: function()
	{   // this is general entry point to "communication with user" activity. Function is called on every tab switch

		var engage_settings = wot.engage_settings,
			core = wot.core;

		// Advertise Rating feature
		if(engage_settings.invite_to_rw.enabled) {

			// check if Rating Window was never opened
			var rw_shown = wot.prefs.get(engage_settings.invite_to_rw.pref_name);

			var lang = wot.i18n("locale");

			// Only for: Mail.ru & RW was never shown & lang is EN or RU
			if(rw_shown < 1 && wot.env.is_mailru && (lang === "ru" || lang === "en")) {

				// if time since firstrun more than predefined delay
				var timesince = wot.time_sincefirstrun();
				if(timesince >= engage_settings.invite_to_rw.delay) {

					var previous_message = core.usermessage;

					// set new message
					wot.core.usermessage = {
						text: wot.i18n("ratingwindow", "invite_rw"),
						id: "invite_rw",
						type: "important",
						url: "",
						target: "",
						version: "",
						than: "",
						previous: previous_message,
						system_type: "engage_rw"
					};

					// put a badge on the add-on's button
					if(!core.badge_status) {
						core.set_badge(wot.badge_types.notice);
					}

				}
			} else {
				//remember the fact to runtime variable to avoid checking that conditions every time
				wot.engage_settings.invite_to_rw.enabled = false;
			}
		}
	},

	setuserlevel: function(data)
	{
		try {
			var elems = data.getElementsByTagName("status");

			if (elems && elems.length > 0) {
				wot.prefs.set("status_level", $(elems[0]).attr("level") || "");
			} else {
				wot.prefs.clear("status_level");
			}
		} catch (e) {
			console.log("core.setuserlevel: failed with " + e + "\n");
		}
	},

	processrules: function(url, onmatch)
	{
		onmatch = onmatch || function() {};

		if (!wot.api.state || !wot.api.state.search) {
			return false;
		}

		var state = wot.prefs.get("search:state") || {};

		for (var i = 0; i < wot.api.state.search.length; ++i) {
			var rule = wot.api.state.search[i];

			if (state[rule.name]) {
				continue; /* disabled */
			}

			if (wot.matchruleurl(rule, url)) {
				onmatch(rule);
				return true;
			}
		}

		return false;
	},

	loadmanifest: function()
	{
		wot.bind("bind:manifest:ready", function() {
			if (wot.core.manifest) {
				wot.trigger("manifest:ready", [], true);
			}
		});

		var xhr = new XMLHttpRequest();

		xhr.onreadystatechange = function() {
			if (this.readyState == 4) {
				wot.core.manifest = JSON.parse(this.responseText) || {};
				wot.trigger("manifest:ready", [], true);
			}
		};

		xhr.open("GET", "manifest.json");
		xhr.send();
	},

	open_mywot: function(url, context)
	{
		var c_url = wot.contextedurl(url, context);
		chrome.tabs.create({ url: c_url });
	},

	open_scorecard: function(target, context)
	{
		if(!target) return;
		var url = wot.contextedurl(wot.urls.scorecard + encodeURIComponent(target), context);
		chrome.tabs.create({ url: url });
	},

	handlemenu: function(info, tab)
	{
		var hostname = "",
			re = /^.+\/{2}([\w.\-_+]+)(:\d+)?\/?.*$/;

		if(info.linkUrl) {
			var res = re.exec(info.linkUrl);
			hostname = res[1] || "";
		} else if (info.selectionText) {
			hostname = info.selectionText || "";
		} else {
			return;
		}

		wot.core.open_scorecard(hostname, "contextmenu");
	},

	createmenu: function()
	{
		chrome.contextMenus.removeAll();    // just in case to avoid doubling
		var menu_id = chrome.contextMenus.create({
			title: wot.i18n("contextmenu", "open_scorecard"),
			contexts: ["link", "selection"],
			onclick: wot.core.handlemenu
		});
	},

	set_badge: function(type, text)
	{   /* sets the badge on the BrowserAction icon. If no params are provided, set the "notice" type */
		var type = type || false,
			text = text || "", color = "";

		if(type !== false) {
			type = type || wot.badge_types.notice;
			text = text || type.text;
			color = type.color || "#ffffff";
			chrome.browserAction.setBadgeBackgroundColor({ color: color });
			wot.core.badge_status = type;   // remember badge's status to prevent concurrent badges
		} else {
			wot.core.badge_status = null;
		}

		chrome.browserAction.setBadgeText({ text: text });
	},

	show_updatepage: function()
	{
		// show update page only if constant wot.firstrunupdate was increased
		var update = wot.prefs.get("firstrun:update") || 0;

		if (update < wot.firstrunupdate) {
			wot.prefs.set("firstrun:update", wot.firstrunupdate);

			chrome.tabs.create({
				url: wot.urls.update + "/" + wot.i18n("lang") + "/" +
					wot.platform + "/" + wot.version
			});
		}
	},

	increase_ws_shown: function () {
		try {
			var pref_name = "warnings_shown";
			var count = wot.prefs.get(pref_name) || 0;
			wot.prefs.set(pref_name, count + 1);
		} catch (e) {
			console.log("wot.core.increase_ws_shown() failed with ", e);
		}
	},

	welcome_user: function()
	{
		// this function runs only once per add-on's launch
		var time_sincefirstrun = 1;
		// check if add-on runs not for a first time
		if (!wot.prefs.get("firstrun:welcome")) {
			wot.core.first_run = true;
			wot.prefs.set("firstrun:update", wot.firstrunupdate);
			wot.prefs.set("firstrun:time", new Date()); // remember first time when addon was run

			// now we have only mail.ru case which requires to postpone opening welcome page
			var postpone_welcome = wot.env.is_mailru;

			if(postpone_welcome) {
				// experiment: don't show welcome page at all
//				wot.core.set_badge(wot.badge_types.notice); // set icon's badge to "notice"
			} else {
				/* use the welcome page to set the cookies on the first run */
				chrome.tabs.create({ url: wot.urls.welcome });
			}
			wot.prefs.set("firstrun:welcome", true);

			window.setTimeout(function () {
				// report "installating" event
				wot.ga.fire_event(wot.ga.categories.GEN, wot.ga.actions.GEN_INSTALLED, String(wot.partner));
			}, 2000);

		} else {
			wot.core.show_updatepage();
			wot.api.setcookies();

			time_sincefirstrun = wot.time_sincefirstrun();

			// if we didn't save firsttime before we should do it now
			if (!time_sincefirstrun) {
				time_sincefirstrun = new Date();
				wot.prefs.set("firstrun:time", time_sincefirstrun);
			}
		}

		// adapt min_confidence_level: 12 for newcomers, 8 - for users who use the addon more than 2 weeks
		var min_level = time_sincefirstrun >= 3600 * 24 * 14 ? 8 : 12;
		wot.prefs.set("min_confidence_level", min_level);

		try {
			// Use timeout before reporting launch event to GA, to give GA a chance to be inited
			window.setTimeout(function () {
				// report how long in days this add-on is staying installed
				var time_sincefirstrun = wot.time_sincefirstrun();
				wot.ga.fire_event(wot.ga.categories.GEN, wot.ga.actions.GEN_LAUNCHED,
					String(Math.floor(time_sincefirstrun / wot.DT.DAY)));

			}, 5000);
		} catch (e) {
			// do nothing here
		}
	},

	onload: function()
	{
		try {
			/* load the manifest for reference */
			this.loadmanifest();
			wot.core.launch_time = new Date();
			wot.detect_environment();
			wot.exp.init();

            wot.exp.is_running("beta-old"); // init value for "WOT beta" dummy experiment

			/* messages */

			wot.bind("message:search:hello", function(port, data) {
				wot.core.processrules(data.url, function(rule) {
					port.post("process", { url: data.url, rule: rule });
				});
			});

			wot.bind("message:search:get", function(port, data) {
				wot.core.loadratings(data.targets, function(hosts) {
					var ratings = {};

					hosts.forEach(function(target) {
						var obj = wot.cache.get(target) || {};

						if (obj.status == wot.cachestatus.ok ||
							obj.status == wot.cachestatus.link) {
							ratings[target] = obj.value;
						}
					});

					var wt_enable_donut_tip = false;
					if (wot.wt && wot.wt.enabled) {
						wt_enable_donut_tip = wot.wt.donuts.tts();
					}
					port.post("update", { rule: data.rule, ratings: ratings, wt_enabled: wt_enable_donut_tip });
				});
			});

			wot.bind("message:tab:close", function(port, data) {
				// close the tab that sent this message
				chrome.tabs.remove(port.port.sender.tab.id);
			});

			/* counting events by GA.
			 * Important: message name we listen for here has to be different than we send from this page
			  * (warnings vs warning) to avoid dead messaging from content script */
			wot.bind("message:warnings:leave_button", function(port, data) {
				wot.ga.fire_event(wot.ga.categories.WS, wot.ga.actions.WS_BTN_CLOSE, data.label);
			});

			wot.bind("message:warnings:enter_button", function(port, data) {
				wot.ga.fire_event(wot.ga.categories.WS, wot.ga.actions.WS_BTN_ENTER, data.target);
				wot.core.update();
			});

			wot.bind("message:warnings:shown", function(port, data) {
				wot.core.increase_ws_shown();
				wot.ga.fire_event(wot.ga.categories.WS, wot.ga.actions.WS_SHOW, data.target);
			});

			wot.bind("message:search:popup_shown", function(port, data) {
				wot.ga.fire_event(wot.ga.categories.INJ, wot.ga.actions.D_POPUP_SHOWN, data.label);
			});

			wot.bind("message:search:openscorecard", function(port, data) {
				wot.core.open_scorecard(data.target, data.ctx);
			});

			wot.bind("message:my:update", function(port, data) {
				port.post("setcookies", {
					cookies: wot.api.processcookies(data.cookies) || []
				});
			});

			wot.listen([ "search", "my", "tab", "warnings", "wtb", "surveyswidget" ]);

			/* event handlers */

			chrome.tabs.onUpdated.addListener(function(id, obj) {
				wot.core.updatetab(id);
			});

			chrome.tabs.onSelectionChanged.addListener(function(id, obj) {
				wot.core.updatetab(id);
			});

			wot.core.createmenu();

			if (wot.debug) {
				wot.prefs.clear("update:state");

				wot.bind("cache:set", function(name, value) {
					console.log("cache.set: " + name, {name: name, value: value});
				});

				wot.bind("prefs:set", function(name, value) {
					console.log("prefs.set: " + name,{name: name, value: value});
				});
			}

			/* initialize */

			wot.api.register(function() {
				wot.core.update();

				if (wot.api.isregistered()) {
					wot.core.welcome_user();
					wot.api.update();
					wot.api.processpending();
					wot.wt.init();  // initialize welcome tips engine
					wot.surveys.init(); // init surveys engine
				}
			});

			wot.ga.post_init(); // finilize setting up GA engine
			wot.cache.purge();

		} catch (e) {
			console.log("core.onload: failed with ", e);
		}
	}

}});

wot.core.onload();
