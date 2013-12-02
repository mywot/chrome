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

		pre_right: 0,       // position of the frame. Is configured by the config.

		get_frame_style: function () {
			var _ads = wot.ads,
				_this = this,
				style = "" +
					"{CSS};" +
					"width: {WIDTH}px; height: {HEIGHT}px;" +
					"right: -{WIDTH}px";  // we need this to overwrite the {CSS} to get the sliding effect

			// how far to the outside of the screen the frame should be positioned in the beginning
			_this.pre_right = - Number(_ads.config.frame_width * (100 - _ads.config.pre_visible) / 100).toFixed();

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
				frame.style.visibility = "visible";     // make it visible

				frame.style.right = String(_this.pre_right) + "px"; // slide it from the right side

				// on hover, slide it in full width
				frame.addEventListener("mouseenter", function(e) {

					// once user interacted with frame, don't hide it completely
					if (_this.fadeout_timer) {
						window.clearTimeout(_this.fadeout_timer);
						_this.fadeout_timer = null;
					}

					this.style.right = "0px";
				});

				// when not hovered, slide it back
				frame.addEventListener("mouseleave", function(e) {
					this.style.right = String(_this.pre_right) + "px";
				});

				wot.post("ads", "shown", {
					target: _ads.target,
					config_version: _ads.config.config_version,
					impression_id: _ads.impression_id
				});

				var fade_delay = Number(_ads.config.fade_delay_secs || 0);
				if (fade_delay) {
					_this.fadeout_timer = window.setTimeout(_this.hide_ad, fade_delay * 1000);
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
				impression_id: _ads.impression_id
			};

//			var config_keys = [];
//
//			var config = {};
//			for (var i = 0; i < config_keys.length; i++) {
//				var k = config_keys[i];
//				config[k] = wot.ads.config[k];
//			}
//			params.config = window.btoa(JSON.stringify(config));

			return chrome.extension.getURL("/widgets/ad-01.html") + "?" + wot.utils.query_param(params);
		}
	},

	// Methods related to JS that runs in the Ads frame
	inside: {

		AD_BASEURL: /^.*widgets\/ad-01\.html/i,
		ad_hover_counter: 0,

		test_ads_url: function (url) {
			console.log("Ads.inside:test_ads_url()", url);

			var _ads = wot.ads,
				_this = this;

			console.log(_this.AD_BASEURL.test(url));

			return _this.AD_BASEURL.test(url);    // TODO: make real check whether the script is loaded for the ads page
		},

		start: function () {
			var _this = this;

			// * get config
			var params = wot.utils.getParams(location.search.slice(1)); // extract params from the query
			console.log("Ad page with params", params);

			wot.ads.impression_id = params.impression_id;

			wot.bind("message:ads:config", _this.on_config);
			wot.listen(["ads"]);

			// Finally, ask for the config. This will trigger the callback wrote above
			_this.report_back("getconfig", {impression_id: params.impression_id});
		},

		on_config: function (port, data) {
			console.log("Data for the AD page", data);

			var _this = wot.ads.inside;

			wot.ads.target = data.target;
			wot.ads.config = data.config;

			// * Prepare the page
			_this.localize(wot.ads.config);

			_this.build_adlinks(data.adlinks);

			// * attach event handlers
			$("#close-icon").bind("click", _this.on_closeicon);
			$(".adlink-item a").bind("click", _this.on_adlink_click);
			$("#optout").bind("click", _this.on_optout);
			$("body").bind("mouseenter", _this.on_ad_hover);
		},

		localize: function (config) {
			var replaces = [
				["title-hint", config['ad_titlehint']],
				["title", config['ad_title']]
			];

			for (var i = 0; i < replaces.length; i++) {
				var elem = document.getElementById(replaces[i][0]);
				if (elem && replaces[i][1]) {
					elem.textContent = replaces[i][1];
				}
			}
		},

		build_adlinks: function (adlinks) {

			for (var i = 0; i < adlinks.length; i++) {
				var $a = $("<a></a>");

				$a.attr({
					href: "http://" + adlinks[i],
					target: "_blank",
					title: ""
				});

				$a.text(adlinks[i]);

				var $li = $("<li></li>");
				$li.addClass("adlink-item");
				$li.append($a);

				$("#adlinks").append($li);
			}
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

		on_ad_hover: function (event) {
			var _this = wot.ads.inside;

			_this.ad_hover_counter++;
			_this.report_back("adhover", { count: _this.ad_hover_counter });
		},

		on_optout: function (event) {
			var _this = wot.ads.inside;
			_this.report_back("optout", {});
		}
	}

};

wot.ads.onload();
