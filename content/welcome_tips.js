/*
 content/welcome_tips.js
 Copyright © 2009 - 2012  WOT Services Oy <info@mywot.com>

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
				{ from: "ADDON_BASEURI", to: chrome.extension.getURL("/") }
			];
			container.innerHTML = wot.utils.processhtml(wot.wt.intro.build(replaces), post_replaces);
			wot.utils.attach_element(container, wt_wrapper);

			wot.wt.report("tip_shown", {mode: mode});

			wt_wrapper.contentDocument.getElementById("btn_ok").addEventListener("click", function (e) {
				wot.wt.report("clicked", {mode: mode, elem: "ok"});
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

	warning: {

	},

	donuts: {

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
				wot.wt.report("ready");
			}, false);
		}
	}
};

if (wot.wt.enabled) {
	wot.wt.init();
}
