/*
 ads_core.js
 Copyright © 2013  WOT Services Oy <info@mywot.com>

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

$.extend(wot, { ads: {

	// Constants
//	CONFIG_BASEURL: chrome.extension.getURL("/"),
	CONFIG_BASEURL: "http://api.mywot.com/",
	AD_BASEURL: chrome.extension.getURL("/widgets/ad-01.html"),

	PREF_OPTOUT: "ads_optedout",
	PREF_LASTTIME: "ads_lasttime",

	EVENTS: {
		NOCONFIG: "noconfig"
	},

	// Module variables
	disabled: false,        // whether ads module should be disabled for this session
	config: {},

	impressions: {},        // hash of parameters for impressions-related data

	per_website: {},        // timings and other params per website

	ADTARGETS: [
		"chainreactioncycles.com",
		"bike-discount.de",
		"cyclingnews.com",
		"bikeradar.com",
		"roseversand.de",
		"bike-components.de",
		"wiggle.co.uk",
		"bike24.de",
		"evanscycles.com",
		"hibike.de",
		"actionsports.de",
		"wiggle.com",
		"merlincycles.com",
		"bikeinn.com",
		"fun-corner.de",
		"starbike.com",
		"cyclestore.co.uk",
		"probikekit.co.uk",
		"winstanleysbikes.co.uk",
		"cyclesurgery.com",
		"rutlandcycling.com",
		"rosebikes.com",
		"salden.nl",
		"ukbikestore.co.uk",
		"fahrrad24.de",
		"islabikes.co.uk",
		"wheelbase.co.uk",
		"islabikes.com",
		"velonews.com",
		"evanscycles.co.uk",
		"chainreactioncycles.co.uk",
		"rosebikes.de",
		"roseversand.com",
		"ukbikestore.com"
	],

	ADLINKS: [
		"bike-discount.de",
		"wiggle.co.uk",
		"bike24.de",
		"fun-corner.de",
		"evanscycles.co.uk",
		"roseversand.com"
	],

	// Module functions
	load_config: function (callback) {
		var _this = this;

		params = {
			id: wot.witness.id,
			locale: wot.locale,
			partner: wot.partner,
			version: wot.version,
			platform: wot.platform
		};

		$.getJSON(_this.CONFIG_BASEURL + "ads/ads_config.json", params, function (config) {
			console.log("Ads config", config);

			if (wot.utils.isEmptyObject(config)) {
				_this.config = {};  // clear current config
				_this.disabled = true;                      // TODO: should we try to reload config later maybe?
				_this.report_event(_this.EVENTS.NOCONFIG, {});
			} else {
				_this.config = config;
				_this.disabled = false;
			}

			if (!_this.disabled) callback();    // call back only if the module is enabled
		});
	},

	init: function () {
		var _this = this;
		_this.load_config(function(){
			if (_this.disabled) return false;

		});
	},

	bind_events: function () {
		// here we setup message listeners

		var _this = this;
		// On-website WOT contentscript's messages
		wot.bind("message:ads:ready", _this.on_wrapper_ready);          // when content script is ready to inject the ad frame
//		wot.bind("message:ads:report_event", _this.on_report_event);
		wot.bind("message:ads:shown", _this.on_ad_shown);
		wot.bind("message:ads:hidden", _this.on_ad_hidden);

		// AD Frame's messages
		wot.bind("message:ads:getconfig", _this.on_getconfig);          // when ad frame requests config and data to show
		wot.bind("message:ads:closeicon", _this.on_ad_close);
		wot.bind("message:ads:clicked", _this.on_ad_clicked);
		wot.bind("message:ads:optout", _this.on_optout);
		wot.bind("message:ads:adhover", _this.on_adhover);
	},

	get_impression: function (obj) {
		var impression_id = obj && obj.impression_id ? obj.impression_id : obj,
			_this = wot.ads;

		return _this.impressions[impression_id] ? _this.impressions[impression_id] : null;
	},

	on_ad_shown: function (port, data) {
//		console.log("on_ad_shown()", port, data);

		var _this = wot.ads;
		var impression = _this.get_impression(data),
			targethostname = impression.targethostname;

		wot.prefs.set(wot.ads.PREF_LASTTIME, Date.now());   // remember last time of ad is shown

		// remember the last time when
		if (!_this.per_website[targethostname]) _this.per_website[targethostname] = { times: 0 };

		$.extend(_this.per_website[targethostname], {
			lasttime: Date.now(),
			times: _this.per_website[targethostname].times + 1
		});

		if (impression) {
			impression.shown = true;
			impression.showntime = Date.now();
			_this.report_event("shown", impression);
		} else {
			console.warn("Unknown impression?");
		}
	},

	on_ad_hidden: function (port, data) {
//		console.log("on_ad_hidden()", port, data);
		var _this = wot.ads;
		var impression = _this.get_impression(data);

		if (impression) {
			impression.hiddentime = Date.now();
			_this.report_event("hidden", impression);
		}
	},

	on_ad_close: function (port, data) {
//		console.log("on_ad_close()", port, data);
		var _this = wot.ads;
		_this.send_close(port.port.sender.tab);
		var impression = _this.get_impression(data);
		if (impression) {
			impression.closed = Date.now();
			_this.report_event("closed", impression);
		}
	},

	on_ad_clicked: function (port, data) {
//		console.log("on_ad_clicked()", port, data);
		var _this = wot.ads;
		var impression = _this.get_impression(data);
		if (impression) {
			impression.clicked = Date.now();
			impression.clicked_position = data.link_position;
			impression.clicked_href = data.href;
			_this.report_event("click", impression);
		}
	},

	on_optout: function (port, data) {
//		console.log("on_optout()", port, data);
		var _this = wot.ads;
		var impression = _this.get_impression(data);
		if (impression) {
			impression.optedout = Date.now();
			_this.report_event("optout", impression);
		}

		wot.prefs.set(_this.PREF_OPTOUT, Date.now());
		_this.send_close(port.port.sender.tab);
	},

	on_wrapper_ready: function (port, data) {
//		console.log("on_wrapper_ready()", data);

		var _this = wot.ads,
			target = data.target,
			positive = _this.tts(target);

		if (positive && target) {

			var impression_id = wot.crypto.getnonce(target),
				targethostname = wot.url.gethostname(target);

			_this.impressions[impression_id] = {
				impression_id: impression_id,
				target: target,
				targethostname: targethostname,     // we will use it many times so it's better to prepare it once
				shown: false,
				hittime: Date.now()
			};

			port.post("inject", {
				config: _this.config,
				impression_id: impression_id         // every impression is assigned ID which is a pair of <user ID, nonce>
			});
		}
	},

	on_getconfig: function (port, data) {
		// Sends adlinks information and configuration to the ad frame
//		console.log("on_getconfig()", port, data);

		var impression = wot.ads.get_impression(data.impression_id);    // determ the target by impression_id

		if (port && port.post && impression) {

			// if no adlinks are attached to the impression yet, generate and store adlinks
			// this will make sure, we show same adlinks to the same impression_id (retain consistancy)
			if (!impression.adlinks || impression.adlinks.length < 1) {
				impression.adlinks = wot.ads.make_adlinks(impression);             // generate list of the adlinks to show
			}

			port.post("config", {
				adlinks: impression.adlinks,
				config: wot.ads.config,
				target: impression.target
			});
		}
	},

	on_adhover: function (port, data) {
//		console.log("on_adhover()", port, data);

		var _this = wot.ads;
		var impression = _this.get_impression(data);

		if (impression) {
			impression.hovered = Date.now();
			impression.hovered_count = data.count;
			_this.report_event("adhover", impression);
		}
	},

	make_adlinks: function (impression) {
		// Returns the list of adlinks according to config parameters "adlinks_number" and "adlinks_method"
		var _this = this,
			config = _this.config,
			res = [];

		// config.adlinks_number
		// config.adlinks_method

		var method = config.adlinks_method || "static",
			adlinks_number = config.adlinks_number || 1;

		var copied = _this.ADLINKS.slice(0);    // make a copy

		// remove current targethostname from the copied list
		var current_p = copied.indexOf(impression.targethostname);

		// artificially add WWW if needed
		current_p = (current_p < 0) ? copied.indexOf("www." + impression.targethostname) : current_p;

		if (current_p >= 0) {
			copied.splice(current_p, 1);    // remove the current target from the adlinks list
		}

		switch (method) {
			case "static":
				res = _this.ADLINKS.slice(0, adlinks_number);
				break;

			case "random":
				for (var i = 0; i < adlinks_number; i++) {
					if (copied.length) {
						res = res.concat(copied.splice(Math.random() * copied.length, 1))
					} else {
						console.warn("Ugh, not enough adlinks in the source list to show");
					}

				}
				break;
		}

		return res;
	},

	tts: function (target) {

		var _this = this,
			targethostname = wot.url.gethostname(target);

		var targets = _this.ADTARGETS;
		var positive = true;

		// Check current target
		positive = positive && !(targets.indexOf(targethostname) < 0);
		console.log("Tested Target. Proceed?", positive);

		if (!wot.prefs.get("super_noadsthreshold")) {   // when super-settings is enabled, no threshold checks are made

			// Check locale
			var allowed_locales = _this.config.locales || ["en"];
			positive = positive && (allowed_locales.indexOf(wot.locale) >= 0);
			console.log("Tested locale. Proceed?", positive);

			// Check opt-out
			var optedout = !!wot.prefs.get(_this.PREF_OPTOUT) || false; // PREF_OPTOUT keeps the date of optout
			positive = positive && !optedout;
			console.log("Tested Optout. Proceed?", positive);

			// Check user Activity score
			var as = wot.get_activity_score(),
				as_limit = isNaN(_this.config.activityscore_limit) ? 10001 : Number(_this.config.activityscore_limit);

			positive = positive && (as < as_limit);
			console.log("Tested activity score. Bound is " + as_limit + ". Proceed?", positive);

			// Check date of installation
			var insta_time = wot.time_sincefirstrun();
			if (insta_time && _this.config.relaxed_secs) {
				positive = positive && (insta_time >= _this.config.relaxed_secs);
				console.log("Tested time since installation. Proceed?", positive);
			}

			// Check local and global delays
			var persite = _this.get_local_delay(targethostname),
				conf_wait_local_secs = 1000 * _this.config.wait_ad_per_site_secs || 0,       // local (in-site) calm period
				conf_wait_global_secs = 1000 * _this.config.wait_global_secs || 1000,   // global calm period
				wait_secs = 0,
				lt = 0,
				is_localdelay_used = true;

			if (persite) {
				console.log("Using local delay for testing lasttime");
				lt = persite.lasttime;
				wait_secs = conf_wait_local_secs;

			} else {
				// Check global last time impression
				console.log("Using global delay for testing lasttime");
				lt = _this.get_impression_lasttime();
				wait_secs = conf_wait_global_secs;
				is_localdelay_used = false;
			}

			if (lt && (Date.now() - lt < wait_secs)) {
				positive = false;
			}
			console.log("Tested Lasttime. Proceed?", positive);

			// Check max times for local delay
			if (is_localdelay_used) {
				if (persite.times && persite.times >=  (_this.config.max_impressions_per_site || 3)) {
					positive = false;
				}
			}
			console.log("Tested max number of times. Proceed?", positive);
		} else {
			console.warn("!!! super_noadsthreshold is enabled. No thresholds and checks are applied.");
		}

		return positive;
	},

	get_local_delay: function (targethostname) {
		var _this = this,
			persite = _this.per_website[targethostname];    // params related to the target website

		if (wot.utils.isEmptyObject(persite) || !persite.lasttime) {
			return null;
		}

		return persite;
	},

	get_impression_lasttime: function () {
		return Number(wot.prefs.get(wot.ads.PREF_LASTTIME)) || 0;
	},

	report_event: function (event, data) {

		var copy = $.extend(true, {}, data);    // make a deep copy to modify it. To avoid race conditions when diff events are sent at the same time
		copy.category = "ad";   // always = "ad" for ads' events
		copy.type = event;
		copy.config_version = wot.ads.config.config_version;

		console.log("Report event", event, copy);

		wot.api.event(copy);
	},

	on_report_event: function (port, data) {
		var _this = this;

		_this.report_event(data.event, data.data);
	},

	connect_and_send: function (tab, message, data) {
		var port = chrome.tabs.connect(tab.id, { name: "ads" });
		if (port) {
			var msg = { message: message };

			if (data) {
				$.extend(msg, data);    // add properties from data
			}

			port.postMessage(msg);
			return port;
		}
		return null;
	},

	send_close: function (tab) {
		wot.ads.connect_and_send(tab, "ads:closecommand", { type: "optout" });
	}

}});
