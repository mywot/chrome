/*
 content/welcome_tips.js
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

/* Injectable content script */


/* Messages from injected welcome tips
*
* <- wtb:ready          - a page was loaded and scripts are injected and ready to launch
* -> wt:show_intro_0    - the add-on wants to show intro_0 tip
* <- wtb:tip_shown { mode } - the tip with {mode} was shown to user
* <- wtb:clicked { mode, elem } - something is clicked on tip.
*
* */

wot.wt = {

	enabled: true,  // global switcher for welcome tips. See also /welcometips.js "enabled: true" line

	intro: {

		build: function (replaces) {
			var html = '<div class="wot-wt-introtip">' +
				'<div class="wot-wt-intro-top"></div>' +
				'<div class="wot-wt-intro-body">{WT_INTRO_TEXT}</div>' +
				'<div class="wot-wt-footer">' +
				'<div id="btn_ok" class="wot-wt-button wot-wt-intro-button">{WT_INTRO_BUTTON}</div>' +
				'</div>' +
				'</div>';

			return wot.utils.processhtml(html, replaces);
		},

		show: function (mode, data) {
			var replaces = [],
				wt_wrapper = wot.utils.get_or_create_element("wot_wt_wrapper", "iframe"),
				success = true;

			if (!wt_wrapper) {
				wot.log("can't add element to DOM / wot.wt.intro.show()");
				return;
			}

			wt_wrapper.setAttribute("style",
					"position: fixed; " +
					"top: 10px; " +
					"width: 232px; " +
					"height: 415px; " +
					"z-index: 2147483647; " +
					"right: 40px;" +
					"border: none;");

			wt_wrapper.setAttribute("scrolling", "no");

			switch (mode) {

			case "intro_0":
					/* This is introduction mode, about what is WOT and WOT protects you from e-threats. */
				replaces = [
					{
						from: "WT_INTRO_TEXT",
						to: wot.i18n("wt", "intro_0_msg")
					},
					{
						from: "WT_INTRO_BUTTON",
						to: wot.i18n("wt", "intro_0_btn")
					},
					{
						from: "ICO1",
						to: "<i id='wot-wt-intro-image1'>&#8202;</i>"
					}
				];
				break;
			}

			success = success && wot.utils.attach_element(wt_wrapper); // attach iframe wrapper

			// attach styles inside iframe
			success = success && wot.utils.attach_style("welcometips.css", "wot_wt_styles", wt_wrapper);

			var container = wot.utils.get_or_create_element("introtip", "div", wt_wrapper);

			// apply final replacements
			var post_replaces = [
				{ from: "ADDON_BASEURI", to: chrome.extension.getURL("/") },
				{ from: "WT_LEARNMORE",  to: wot.i18n("wt", "learnmore_link") }
			];
			container.innerHTML = wot.utils.processhtml(wot.wt.intro.build(replaces), post_replaces);
			wot.utils.attach_element(container, wt_wrapper);

			wot.wt.report("tip_shown", {mode: mode});

			wt_wrapper.contentDocument.getElementById("btn_ok").addEventListener("click", function (e) {
				wot.wt.report("clicked", {mode: mode, elem: "ok"});
				wot.wt.intro.hide();
			});

			wt_wrapper.contentDocument.getElementById("wt-learnmore-link").addEventListener("click", function (e) {
				wot.wt.report("clicked", {mode: mode, elem: "learnmore"});
				wot.wt.intro.hide();
			});

			return success;

		},

		hide: function () {
			var wt_wrapper = document.getElementById("wot_wt_wrapper");
			if (wt_wrapper && wt_wrapper.parentNode) {
				wt_wrapper.parentNode.removeChild(wt_wrapper);
			}
		}
	},

	donuts: {

		inited:         false,
		is_shown:       false,
		times:          0,
		hide_timer:     null,
		tip_width:      260,
		tip_height:     350,
		offset_y:       -66,
		offset_x:       0,
		pointer_height: 30, // take this number from welcometips.css rule ".wot-wt-dtip:before" height property.

		init: function () {
			if (!wot.wt.donuts.inited && wot.search && wot.is_defined(["donut_msg", "donut_btn"], "wt")) {
				wot.search.on_update_callback = wot.wt.donuts.show;
				wot.wt.donuts.inited = true;
			}
		},

		build: function (replaces) {
			var html = '<div class="wot-wt-dtip">' +
				'<div id="wot_wt_logo" class="wot-wt-logo">&nbsp;</div>' +
				'<div class="wot-wt-d-body">{WT_D_TEXT}</div>' +
				'<div class="wot-wt-d-body"><p>{WT_D_TEXT2}</p></div>' +
				'<div class="wot-wt-footer">' +
				'<div id="btn_ok" class="wot-wt-button wot-wt-d-button">{WT_D_BUTTON}</div>' +
				'</div>' +
				'</div>';

			return wot.utils.processhtml(html, replaces);
		},

		inject_placeholder: function (x, y, pwidth, pheight, y_offset_pointer) {

			var y_offset = Math.floor(y_offset_pointer) - wot.wt.donuts.pointer_height,
				style_override = null;

			var wrapper = wot.utils.get_or_create_element("wot_wtd_wrapper", "iframe");

			if (!wrapper) {
				wot.log("can't add element to DOM / wot.wt.donuts.show()");
				return null;
			}

			wrapper.setAttribute("scrolling", "no");

			wrapper.setAttribute("style",
				"position: absolute; " +
					"top: " + y + "px; " +
					"left: "+ x +"px;" +
					"width: "+ pwidth +"px; " +
					"height: "+ pheight +"px; " +
					"z-index: 2147483647; " +
					"border: none;");

			wot.utils.attach_element(wrapper); // attach iframe wrapper

			// attach styles inside iframe
			wot.utils.attach_style("welcometips.css", "wot_wt_styles", wrapper);

			var pointer_height = wot.wt.donuts.pointer_height;

			// show tip's sidepointer only if it is able to point to the donut
			if (y_offset <= (wot.wt.donuts.tip_height - pointer_height * 2) &&
				y_offset >= pointer_height / 2) {
				style_override = ".wot-wt-dtip:before {top:" + String(y_offset) + "px;}";
			} else {
				style_override = ".wot-wt-dtip:before { visibility: hidden; }";
			}

			wot.utils.attach_style({ style: style_override }, "wot_wt_styles_2", wrapper);

			return wrapper;
		},

		show: function (x, y, y_offset, rule_name) {

			if (wot.wt.donuts.hide_timer) {
				window.clearTimeout(wot.wt.donuts.hide_timer);
			}

			var wrapper = wot.wt.donuts.inject_placeholder(x, y, wot.wt.donuts.tip_width, wot.wt.donuts.tip_height, y_offset);

			if (!wrapper) return false;

			if (!wot.wt.donuts.is_shown) {
				// report only once until the tip is hidden again
				wot.wt.donuts.is_shown = true;
				wot.wt.report("dtip_shown", { rule_name: rule_name, times: wot.wt.donuts.times });
			}

			wot.wt.donuts.times++;

			var container = wot.utils.get_or_create_element("donut_tip", "div", wrapper);

			var replaces = [
				{
					from: "WT_D_TEXT",
					to: wot.i18n("wt", "donut_msg")
				},
				{
					from: "WT_D_TEXT2",
					to: wot.i18n("wt", "learnmore_link") || ""
				},
				{
					from: "WT_D_BUTTON",
					to: wot.i18n("wt", "donut_btn")
				}
			];

			container.innerHTML = wot.wt.donuts.build(replaces);
			wot.utils.attach_element(container, wrapper);

			// TODO: next lines need refactoring
			wrapper.contentDocument.getElementById("btn_ok").addEventListener("click", wot.wt.donuts.on_click, false);
			wrapper.contentDocument.getElementById("wt-learnmore-link").addEventListener("click", wot.wt.donuts.on_learnmore, false);
			wrapper.contentDocument.getElementById("wot_wt_logo").addEventListener("click", wot.wt.donuts.on_logo, false);

			return true;
		},

		on_click: function () {
			wot.search.on_update_callback = null;    // disable Tip for appearing again
			wot.popup.show_wtip = false;
			wot.wt.report("dtip_ok", {});
			wot.wt.donuts.hide();

			if (wot.popup.layer) {
				wot.popup.show(wot.popup.layer);
			}
		},

		on_logo: function () {
			wot.search.on_update_callback = null;
			wot.popup.show_wtip = false;
			wot.wt.report("dtip_info", { "elem": "logo" });
			wot.wt.donuts.hide();
		},

		on_learnmore: function () {
			wot.search.on_update_callback = null;
			wot.popup.show_wtip = false;
			wot.wt.report("dtip_info", { "elem": "learn_more" });
			wot.wt.donuts.hide();
		},

		delayed_hide: function() {
			try {
				if (wot.wt.donuts.is_shown) {
					if(wot.wt.donuts.hide_timer) {
						window.clearTimeout(wot.wt.donuts.hide_timer);
					}
					wot.wt.donuts.hide_timer = window.setTimeout(wot.wt.donuts.hide, 1000);
				}
			} catch (e) {
				console.log("wot.wt.donuts.delayed_hide() failed.", e);
			}
		},

		hide: function () {
			try {
				var wt_wrapper = document.getElementById("wot_wtd_wrapper");
				if (wt_wrapper && wt_wrapper.parentNode) {
					wt_wrapper.parentNode.removeChild(wt_wrapper);
					wot.wt.donuts.is_shown = false;
				}
			} catch (e) {
				console.log("wot.wt.donuts.hide() failed.", e);
			}
		}

	},

	report: function (message, data) {
		wot.post("wtb", message, data);
	},

	init: function () {
		// Reminder! Keep this function as much lightweight as possible, since it is executed on every page and frame
		// avoid any long-running code here. Use messages to do something later.

		if (window !== window.top) {
			return; // skip frames
		}

		wot.bind("message:wt:show_intro_0", function(port, data) {
			wot.wt.intro.show("intro_0", data);
		});

		// send signal to core only after page is fully loaded
		if (document.readyState === "complete") {
			wot.wt.report("ready");
		} else {
			document.addEventListener("DOMContentLoaded", function (e) {
				// workaround for the bug http://code.google.com/p/chromium/issues/detail?id=107505
				// need to check whether wot.wt still available since another content script can erase it
				// because of the bug. This workaround might be removed after mail.ru started to use newer build than 17

				if (wot.wt) wot.wt.report("ready"); // normally here shouldn't be the condition, but read the comment above
			}, false);
		}

		this.donuts.init();
	}
};

if (wot.wt.enabled) {
	wot.wt.init();
}
