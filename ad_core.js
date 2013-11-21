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

	// Module functions
	load_config: function (callback) {
		var _this = this;

		params = {
			id: wot.witness.id
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
		wot.bind("message:ads:ready", _this.on_wrapper_ready);
		wot.bind("message:ads:report_event", _this.on_report_event);
		wot.bind("message:ads:shown", _this.on_ad_shown);
		wot.bind("message:ads:hidden", _this.on_ad_hidden);
		wot.bind("message:ads:closeicon", _this.on_ad_close);
		wot.bind("message:ads:clicked", _this.on_ad_clicked);
		wot.bind("message:ads:optout", _this.on_optout);
	},

	get_impression: function (obj) {
		var impression_id = obj && obj.impression_id ? obj.impression_id : obj,
			_this = wot.ads;

		return _this.impressions[impression_id] ? _this.impressions[impression_id] : null;
	},

	on_ad_shown: function (port, data) {
		console.log("on_ad_shown()", port, data);

		var _this = wot.ads;
		var impression = _this.get_impression(data);

		wot.prefs.set(wot.ads.PREF_LASTTIME, Date.now());   // remember last time of ad is shown

		if (impression) {
			impression.shown = true;
			impression.showntime = Date.now();
			_this.report_event("shown", impression);
		} else {
			console.warn("Unknown impression?");
		}
	},

	on_ad_hidden: function (port, data) {
		console.log("on_ad_hidden()", port, data);
		var _this = wot.ads;
		var impression = _this.get_impression(data);

		if (impression) {
			impression.hiddentime = Date.now();
			_this.report_event("hidden", impression);
		}
	},

	on_ad_close: function (port, data) {
		console.log("on_ad_close()", port, data);
		var _this = wot.ads;
		_this.send_close(port.port.sender.tab);
		var impression = _this.get_impression(data);
		if (impression) {
			impression.closed = Date.now();
			_this.report_event("closed", impression);
		}
	},

	on_ad_clicked: function (port, data) {
		console.log("on_ad_clicked()", port, data);
		var _this = wot.ads;
		var impression = _this.get_impression(data);
		if (impression) {
			impression.clicked = Date.now();
			impression.clicked_position = data.link_position;
			_this.report_event("click", impression);
		}
	},

	on_optout: function (port, data) {
		console.log("on_optout()", port, data);
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
		console.log("on_wrapper_ready()", data);

		var _this = wot.ads;
			positive = _this.tts(data.target);

		if (positive) {

			var impression_id = wot.crypto.getnonce(data.target);

			_this.impressions[impression_id] = {
				impression_id: impression_id,
				target: data.target,
				shown: false,
				hittime: Date.now()
			};


			port.post("inject", {
				config: _this.config,
				impression_id: impression_id         // every impression is assigned ID which is a pair of <user ID, nonce>
			});
		}
	},

	tts: function (target) {

		var _this = this;

		var targets = [
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
		];

		var positive = true;

		// Check opt-out
		var optedout = !!wot.prefs.get(_this.PREF_OPTOUT) || false; // PREF_OPTOUT keeps the date of optout
		positive = positive && !optedout;
		console.log("Tested Optout. Proceed?", positive);

		// Check last time impression
		var lt = _this.get_impression_lasttime(),
			conf_wait_global_secs = 1000 * _this.config.wait_global_secs || 1000;   // global calm period
		if (lt && (Date.now() - lt < conf_wait_global_secs)) {
			positive = false;
		}
		console.log("Tested Lasttime. Proceed?", positive);

		// Check current target
		positive = positive && !(targets.indexOf(wot.url.gethostname(target)) < 0);
		console.log("Tested Target. Proceed?", positive);

		// Check user Activity score

		// Check date of installation

		return positive;
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
