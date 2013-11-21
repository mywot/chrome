/*
 content/ads.js
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

wot.ads = {

	config: {},                             // config is inited in onload() by the message from backgound page
	impression_id: null,                    // Unique ID of the impression for the user
	target: null,                           // URL where placeholder is injected
	ad_frame_id: "wot-ad",

	onload: function () {
		console.log("Ads:onload()", window.location);

		try {
			var _this = this;

			// Fully init only after DOM is ready
			if (document.readyState === "complete") {
				_this.on_dom_loaded();
			} else {
				document.addEventListener("DOMContentLoaded", function (e) {
					// workaround for the bug http://code.google.com/p/chromium/issues/detail?id=107505
					// need to check whether wot.ads still available since another content script can erase it
					// because of the bug. This workaround might be removed after mail.ru started to use newer build than 17
					if (wot.ads) wot.ads.on_dom_loaded(); // normally here shouldn't be the condition, but read the comment above
				}, false);
			}

		} catch (e) {
			console.error(e);
		}
	},

	on_dom_loaded: function () {

		var _this = this;
		wot.ads.target = window.location.href;

		if (window === window.top) {        // we are in the main frame. Use wrapper.* methods then.
			/* wait for status updates and warn if necessary */
			wot.bind("message:ads:inject", function(port, data) {
				if (!wot.utils.isEmptyObject(data.config)) {
					wot.ads.config = data.config;
					wot.ads.impression_id = data.impression_id;
					wot.ads.wrapper.inject();
				}
			});

			wot.post("ads", "ready", { target: wot.ads.target });

		} else {
			if (_this.inside.test_ads_url(_this.target)) {
				// Oh wow, we are running inside WOT ads frame
				_this.inside.start();
			}
		}
	},

	// Methods related to JS that runs in the target website page
	wrapper: {

		get_frame_style: function () {
			var _ads = wot.ads,
				_this = this,
				style = "" +
					"{CSS};" +
					"width: {WIDTH}px; height: {HEIGHT}px;";

			replaces = [
				{ from: "CSS", to: _ads.config.css || ""},
				{ from: "WIDTH", to: _ads.config.frame_width || 0},
				{ from: "HEIGHT", to: _ads.config.frame_height || 0}
			];

			style = wot.utils.processhtml(style, replaces);

			return style;
		},

		inject: function () {
			// the frame for the ad is injected only when BG page tells to do that.
			console.log("Ads.wrapper:inject()");

			var _ads = wot.ads,
				_this = this;

			if (wot.utils.isEmptyObject(wot.ads.config)) {
				console.warn("Empty config while trying to add Ads frame");
				return;
			}

			var frame = wot.utils.get_or_create_element(_ads.ad_frame_id, "iframe");
			frame.setAttribute("style", _this.get_frame_style());
			frame.setAttribute("frameborder", "0");
			frame.setAttribute("src", _this.get_ad_src());

			var node = wot.utils.attach_element(frame);
			if (node) { // if injection was successful
				var show_delay = Number(1000 * _ads.config.show_delay_secs || 0);   // delay before showing the frame
				window.setTimeout(_this.show_ad, show_delay);
			}

			wot.bind("message:ads:closecommand", wot.ads.wrapper.on_closecommand);
		},

		show_ad: function () {
			var _ads = wot.ads,
				_this = _ads.wrapper;

			var frame = document.getElementById(_ads.ad_frame_id);
			if (frame) {
				frame.style.visibility = "visible";

				wot.post("ads", "shown", {
					target: _ads.target,
					config_version: _ads.config.config_version,
					impression_id: _ads.impression_id
				});

				var fade_delay = Number(_ads.config.fade_delay_secs || 0);
				if (fade_delay) {
					window.setTimeout(_this.hide_ad, fade_delay * 1000);
				}
			}
		},

		hide_ad: function (method, port) {
			var _ads = wot.ads,
				_this = _ads.wrapper;

			method = method || "auto";

			var frame = document.getElementById(_ads.ad_frame_id);
			if (frame) {
				frame.style.visibility = "hidden";

				wot.post("ads", "hidden", {
					location: window.location.href,
					config_version: _ads.config.config_version,
					method: method
				}, port);
			}
		},

		on_closecommand: function(port, data) {
			// Removes ad frame from DOM
			console.log("on_closecommand()");
			wot.ads.wrapper.hide_ad("close", port.port);
		},


		get_ad_src: function () {
			// make the URL to WOT Ad
			var _ads = wot.ads,
				_this = this,
				params;

			params = {
				impression_id: _ads.impression_id,
				target: _ads.target
			};

			return chrome.extension.getURL("/widgets/ad-01.html") + "?" + wot.utils.query_param(params);
		}
	},

	// Methods related to JS that runs in the Ads frame
	inside: {

		AD_BASEURL: /^.*widgets\/ad-01\.html/i,

		test_ads_url: function (url) {
			console.log("Ads.inside:test_ads_url()", url);

			var _ads = wot.ads,
				_this = this;

			console.log(_this.AD_BASEURL.test(url));

			return _this.AD_BASEURL.test(url);    // TODO: make real check whether the script is loaded for the ads page
		},

		start: function () {
			var _this = this;

			// 1. get config

			// 1.2 extract params from the query
			var params = wot.utils.getParams(location.search.slice(1));
			console.log("Ad page with params", params);

			wot.ads.impression_id = params.impression_id;
			wot.ads.target = params.target;

			// 2. attach event handlers
			$("#close-icon").bind("click", _this.on_closeicon);
			$(".adlink-item a").bind("click", _this.on_adlink_click);
			$("#optout").bind("click", _this.on_optout);

			// 3. post-process
		},

		report_back: function (msg, params) {
			var def_params = {
				target: wot.ads.target,
				impression_id: wot.ads.impression_id,
				config_version: wot.ads.config.config_version
			};

			var new_params = $.extend({}, def_params, params);

			wot.post("ads", msg, new_params);
		},

		on_closeicon: function () {
			wot.ads.inside.report_back("closeicon", {});
		},

		on_adlink_click: function (event) {
			var _this = wot.ads.inside,
				$adlink = $(this),
				link_position = $.inArray($adlink.closest(".adlink-item")[0], $(".adlink-item"));

			_this.report_back("clicked", {
				href: $adlink.attr("href"),
				link_position: link_position
			});
		},

		on_optout: function (event) {
			var _this = wot.ads.inside;
			_this.report_back("optout", {});
		}
	}

};

wot.ads.onload();
