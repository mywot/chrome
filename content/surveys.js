/*
 surveys.js
 Copyright © 2012 - 2013  WOT Services Oy <info@mywot.com>

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

wot.surveys = {

	wrapper_id: "wot_surveys_wrapper",
	is_shown: false,
	wrapper: null,
	pheight: 400,
	pwidth: 392,
	px: 10,
	py: 10,

	pre_init: function() {
		if (!wot.enable_surveys || window !== window.top) return;   // don't run in frames. Ever.

		// Fully init only after DOM is ready
		if (document.readyState === "complete") {
			wot.surveys.init();
		} else {
			document.addEventListener("DOMContentLoaded", function (e) {
				// workaround for the bug http://code.google.com/p/chromium/issues/detail?id=107505
				// need to check whether wot.surveys still available since another content script can erase it
				// because of the bug. This workaround might be removed after mail.ru started to use newer build than 17
				if (wot.surveys) wot.surveys.init(); // normally here shouldn't be the condition, but read the comment above
			}, false);
		}
	},

	init: function () {
		wot.bind("message:surveys:show", wot.surveys.on_show);
	},

	on_show: function(port, data) {
		var _this = wot.surveys;
		if (_this.is_shown) return;

		_this.inject_iframe(data);

		_this.is_shown = true;

		wot.bind("message:surveys:close", wot.surveys.on_close);
	},

	on_close: function(port, data) {
		if(wot.surveys.wrapper) {

			var wr = wot.surveys.wrapper;
			var style = wr.getAttribute("style");
			wr.setAttribute("style", style + "visibility: hidden;");

			// wait a bit to allow GA script to send event to the servers
			setTimeout(function(){
				if(wot.surveys.wrapper) {
					wot.surveys.wrapper.parentNode.removeChild(wot.surveys.wrapper);
				}
			}, 2000);


		}
	},

	build: function (replaces) {

		return wot.utils.processhtml(html, replaces);
	},

	inject_iframe: function (data) {
		var _this = wot.surveys;

		if (!(data && data.question)) {
			wot.log("No question has been provided to ask");
			return;
		}

		// prepare data for transferring to injected frame via window.name
		data.question.url = window.location.origin + window.location.pathname;   // skip params and hash in the URL
		var encoded_data = btoa(JSON.stringify(data.question));

		var wrapper = wot.utils.get_or_create_element(_this.wrapper_id, "iframe");

		if (!wrapper) {
			console.log("can't add element to DOM / wot.surveys.inject_placeholder()");
			return;
		}

		_this.wrapper = wrapper;  // keep the link to the element to destroy it

		wrapper.setAttribute("scrolling", "no");

		wrapper.setAttribute("style",
			"position: fixed; " +
			"top: " + _this.py + "px; " +
			"left: "+ _this.px +"px;" +
			"width: "+ _this.pwidth +"px; " +
			"height: "+ _this.pheight +"px; " +
			"z-index: 2147483647; " +
			"border: none;");

//        wrapper.addEventListener('load', _this.on_contentload);   // use it for managing after-load life of the frame
		wrapper.setAttribute("src", chrome.extension.getURL("/widgets/surveys.html"));
		wrapper.setAttribute("name", encoded_data);  // transfer question's data via "name" property of iframe

		wot.utils.attach_element(wrapper); // attach iframe wrapper to DOM
	},

    on_contentload: function(e) {
//        console.log("frame content loaded", e);
    }
};

wot.surveys.pre_init();
