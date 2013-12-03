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
    badge: {
        type: null,
        text: ""
    },

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

	update: function (update_rw)
	{
		try {
			chrome.windows.getAll({}, function(windows) {
				windows.forEach(function(view) {
					chrome.tabs.getSelected(view.id, function(tab) {
						wot.core.updatetab(tab.id, update_rw);
					});
				});
			});
		} catch (e) {
			console.log("core.update: failed with " + e);
		}
	},

	updatetab: function(id, update_rw)
	{
		chrome.tabs.get(id, function(tab) {
            if (!tab) return;
			wot.log("core.updatetab: " + id + " = " + tab.url);

			if (wot.api.isregistered()) {
				wot.core.loadratings(tab.url, function(hosts) {
					wot.core.updatetabstate(tab, {
						target: hosts[0],
						decodedtarget: wot.url.decodehostname(hosts[0]),
						cached: wot.cache.get(hosts[0]) || { value: {} }
					}, update_rw);
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
					}
                    else if (result != "r0" &&
								!wot.components.some(function(item) {
									return (cached.value[item.name] &&
											cached.value[item.name].t >= 0);
								})) {
						result = "new_" + result;   // this adds yellow star on top of the donut
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

			icon.src = wot.geticon(this.geticon(data), 19, wot.prefs.get("accessible"));
		} catch (e) {
			console.log("core.seticon: failed with " + e + "\n");
		}
	},

    get_ratingwindow: function (callback) {
//        Enumerates "views" of current tab of current window and if WOT RatingWindow is found,
//        then call callback and pass selected tab and view found to it.
//        Callback should be as some_function (tab, view)

        chrome.tabs.query({
                active: true,           // lookup for active tabs
                currentWindow: true     // in active windows
            },
            function (tabs) {
                for (var i in tabs) {
                    var tab = tabs[i];  // now we have active tab to pass it to callback function
                    var views = chrome.extension.getViews({});

                    for (var i in views) {
                        if (views[i].wot && views[i].wot.ratingwindow) {
                            callback(tab, views[i]);
                        }
                    }
                }
            });
    },

    update_ratingwindow: function (tab0, data) {
        // Invokes update() of the Rating Window
        wot.core.get_ratingwindow(function (tab, view) {
            if (tab0.id == tab.id) {    // update RW only for the related tab
                view.wot.ratingwindow.update(tab, data);
            }
        });
    },

    update_ratingwindow_comment: function () {
        wot.core.get_ratingwindow(function (tab, view) {
            wot.log("update_ratingwindow_comment()", tab, view);
            var rw = view.wot.ratingwindow;

            var target = wot.url.gethostname(tab.url),
                cached = wot.cache.get(target);

            // get locally stored comment if exists
            var local_comment = wot.keeper.get_comment(target);
            rw.update_comment(cached, local_comment, wot.cache.captcha_required);
        });
    },

	updatetabstate: function(tab, data, update_rw)
	{
		try {

            if (!data.target) {
                wot.core.update_ratingwindow(tab, data);    // update RW with empty data
                return;
            }

            var cached = data.cached || {};

			if (tab.selected) {

				this.seticon(tab, data); /* update the browser action */

                var local_comment = wot.keeper.get_comment(data.target);

                // First priority: is user's input submitted successfully?
                if (local_comment && local_comment.comment && local_comment.status === wot.keeper.STATUSES.LOCAL) {
                    this.toggle_badge(tab.id, wot.badge_types.unsaved_comment);

                } else {

                    // Second: is the website rated by user?
                    if (!wot.is_rated(cached) && cached.status == wot.cachestatus.ok) {
                        // turned off intentionally on 25.06.2013 to deploy old style of notification about unrated
//                        this.toggle_badge(tab.id, wot.badge_types.unrated);
                    } else {
                        // Third: are categories selected for the website?
                        if (cached.status == wot.cachestatus.ok && cached.value &&
                            cached.value.cats && wot.utils.isEmptyObject(wot.select_voted(cached.value.cats))) {

                            // now check whether other conditions are met:
                            var lev = wot.reputationlevels.slice(-2, -1)[0].min;    // yellow/green border
                            wot.components.forEach(function(app) {
                                var app_id = app.name,
                                    t = cached.value[app_id] ? cached.value[app_id].t : -1,
                                    r = cached.value[app_id] ? cached.value[app_id].r : -1;

                                // 1. Is the testimony below green?
                                // 2. Is user's testimony opposite to current reputation?
                                if ((t >= 0 && t < lev) || (t >= lev && r >= 0 && r < lev)) {
                                    // Indicate that the user's input is incomplete
                                    wot.core.set_badge(tab.id, wot.badge_types.nocategories);
                                    return false;   // stop the loop and exit
                                }
                            });
                        } else {
                            this.set_badge(tab.id, wot.core.badge.type, wot.core.badge.text);
                        }
                    }
                }

                /* update the rating window */
                if (update_rw) wot.core.update_ratingwindow(tab, data);

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
				"warning_opacity",
                "update:state"
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

			if (type && type.type >= wot.warningtypes.overlay) {
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

        return; // this is so for the beta-version to rewrite utilization of badge feature

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
						core.set_badge(null, wot.badge_types.notice);
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
			console.error("core.setuserlevel: failed with ", e);
		}
	},

    is_level: function (level) {
        try {
            var w_key = wot.prefs.get("witness_key"),
                user_level = wot.prefs.get("status_level");

            if (!user_level && level == null) return true;
            var h = wot.crypto.bintohex(wot.crypto.sha1.hmacsha1hex(w_key, "level="+level)); // encrypt the string by user's key
            return (user_level == h);

        } catch (e) {
            console.error("wot.core.is_level failed", e);
            return false;   // in case of errors it is safer to assume that user is not registered yet
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

	open_scorecard: function(target, context, hash)
	{
		if(!target) return;
        hash = hash ? "#" + hash : "";
		var url = wot.contextedurl(wot.urls.scorecard + encodeURIComponent(target), context) + hash;
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

    toggle_badge: function (tab_id, type, text) {
        // Makes badge on the donut blink several times
        var counter = 5,
            delay = 220,
            on = true,
            ticker = null;

        ticker = window.setInterval(function(){
            if (counter > 0) {
//                console.log("TICK", counter);

                if (counter % 2 == 0) {
                    wot.core.set_badge(tab_id, null);
                } else {
                    wot.core.set_badge(tab_id, type, text);
                }

                counter -= 1;
            } else {
                if (ticker) {
                    window.clearInterval(ticker);
                }
            }
        }, delay);

    },

	set_badge: function (tab_id, type, text)
	{   /* sets the badge on the BrowserAction icon. If no params are provided, clear the badge */
		var type = type || false,
			text = text || "", color = "";

		if(type !== false) {
			type = type || wot.badge_types.notice;
			text = text || type.text;
			color = type.color || "#ffffff";

            var obj = {
                color: color
            };

            if (tab_id) {
                obj.tabId = tab_id;
            }

			chrome.browserAction.setBadgeBackgroundColor(obj);
			wot.core.badge_status = type;   // remember badge's status to prevent concurrent badges
		} else {
			wot.core.badge_status = null;
		}

		var obj = { text: text };
        if (tab_id) {
            obj.tabId = tab_id;
        }
        chrome.browserAction.setBadgeText(obj);
	},

	show_updatepage: function()
	{
		// show update page only if constant wot.firstrunupdate was increased
		var update = wot.prefs.get("firstrun:update") || 0;
        var open_update_page = true;

		if (update < wot.firstrunupdate) {
			wot.prefs.set("firstrun:update", wot.firstrunupdate);

            // Do some actions when the add-on is updated
            switch (wot.firstrunupdate) {
                case 2: // = 2 is a launch of WOT 2.0 in September 2013

                    // clear welcometips counters to show them again
                    var prefs_to_clear = [
                        "wt_donuts_shown", "wt_donuts_shown_dt", "wt_donuts_ok",
                        "wt_intro_0_shown", "wt_intro_0_shown_dt", "wt_intro_0_ok",
                        "wt_rw_shown", "wt_rw_shown_dt", "wt_rw_ok",
                        "wt_warning_shown", "wt_warning_shown_dt", "wt_warning_ok"
                    ];

                    for (var p in prefs_to_clear) {
                        wot.prefs.clear(prefs_to_clear[p]);
                    }

                    // set badge "NEW"
                    wot.core.badge.text = "new";
                    wot.core.badge.type = wot.badge_types.notice;

                    if (wot.env.is_mailru) {
                        open_update_page = false;   // Don't open UpdatePage for Mail.ru users
                    }

                    break;
            }

			if (open_update_page) {
                chrome.tabs.create({
                    url: wot.urls.update + "/" + wot.i18n("lang") + "/" +
                        wot.platform + "/" + wot.version
                });
            }
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
				var open_in_bg = !wot.env.is_yandex;    // for Yandex browser open the WP in background
				chrome.tabs.create({ url: wot.urls.welcome, active: open_in_bg });
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

		// This GA reporting is disabled due to exceeding limits (10M/day)
//		try {
//			// Use timeout before reporting launch event to GA, to give GA a chance to be inited
//			window.setTimeout(function () {
//				// report how long in days this add-on is staying installed
//				var time_sincefirstrun = wot.time_sincefirstrun();
//				wot.ga.fire_event(wot.ga.categories.GEN, wot.ga.actions.GEN_LAUNCHED,
//					String(Math.floor(time_sincefirstrun / wot.DT.DAY)));
//
//			}, 5000);
//		} catch (e) {
//			// do nothing here
//		}
	},

	onload: function()
	{
		try {
			/* load the manifest for reference */
			this.loadmanifest();
			wot.core.launch_time = new Date();
            wot.cache_locale();
			wot.detect_environment();
			wot.exp.init();

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
                            obj.value.decodedtarget = wot.url.decodehostname(obj.value.target);
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
				wot.core.update(false);
			});

			wot.bind("message:warnings:shown", function(port, data) {
				wot.core.increase_ws_shown();
				wot.ga.fire_event(wot.ga.categories.WS, wot.ga.actions.WS_SHOW, data.target);
			});

			wot.bind("message:search:popup_shown", function(port, data) {
				var cached = wot.cache.get(data.target),
					action = wot.ga.actions.D_POPUP_TARGET_R0;

				if (cached && cached.value && cached.value[0]) {
					var _map = {
							"r0": wot.ga.actions.D_POPUP_TARGET_R0,
							"r1": wot.ga.actions.D_POPUP_TARGET_R1R2,
							"r2": wot.ga.actions.D_POPUP_TARGET_R1R2,
							"r3": wot.ga.actions.D_POPUP_TARGET_R3,
							"r4": wot.ga.actions.D_POPUP_TARGET_R4,
							"r5": wot.ga.actions.D_POPUP_TARGET_R5
						},
						action = _map[wot.getlevel(wot.reputationlevels, cached.value[0].r).name]; // redefine the action
				}
				wot.ga.fire_event(wot.ga.categories.INJ, action, data.norm_target);
				wot.ga.fire_event(wot.ga.categories.INJ, wot.ga.actions.D_POPUP_SHOWN, data.label);
			});

			wot.bind("message:search:openscorecard", function(port, data) {
				wot.core.open_scorecard(data.target, data.ctx);
			});

			wot.bind("message:search:ratesite", function(port, data) {
				wot.core.open_scorecard(data.target, data.ctx, "rate");
			});

			wot.bind("message:my:update", function(port, data) {
				port.post("setcookies", {
					cookies: wot.api.processcookies(data.cookies) || []
				});
            });

			if (wot.surveys && wot.surveys.bind_events) {
				wot.surveys.bind_events();
			}

			if (wot.wt && wot.wt.bind_events) {
				wot.wt.bind_events();
			}

			if (wot.featured && wot.featured.bind_events) {
				wot.featured.bind_events();
			}

			wot.listen([ "search", "my", "tab", "warnings", "wtb", "surveyswidget", "ads" ]);

			/* event handlers */

			chrome.tabs.onUpdated.addListener(function(id, obj) {
				wot.core.updatetab(id, true);
			});

			chrome.tabs.onSelectionChanged.addListener(function(id, obj) {
				wot.core.updatetab(id, true);
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
				wot.core.update(true);

				if (wot.api.isregistered()) {
					wot.core.welcome_user();
					wot.api.update();
					wot.api.processpending();       // submit
                    wot.api.comments.processpending();
					wot.wt.init();                  // initialize welcome tips engine
					wot.surveys.init();             // init surveys engine
					if (wot.featured) wot.featured.init();    // init Featured engine
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
