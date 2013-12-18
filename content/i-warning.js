/*
 content/i-warning.js
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

wot.warning = {

	warning_id: null,
	generated_style: "",
	exit_mode: "back",
	check_timer: null,

	onload: function () {
		if (window !== window.top) {
			return;
		}

		/* wait for status updates and warn if necessary */
		wot.bind("message:warning:inject", wot.warning.inject);
		wot.bind("message:warning:remove", wot.warning.remove);

		wot.listen(["warning", "wt", "surveys", "ads"]);
	},

	inject: function (port, data) {
		wot.warning.settings = data.settings;
		if (!wot.warning.warning_id) {
			wot.warning.warning_id = data.id;
			wot.warning.data = data.data;
			wot.warning.add();

			// set regular check whether Warning is still visible or removed
			wot.warning.check_timer = window.setInterval(function () {

				var w = document.getElementById(wot.warning.warning_id);

				if (!wot.warning.test_visibility(w)) {  // test whether Warning is distorted in any way

					// remove the corrupted element if it presents
					if (w) {
						wot.warning.hide();
					}

					wot.warning.add();  // create new fresh warning
				}

			}, 1000);
		}
	},

	test_visibility: function (w) {
		var cur_style = w ? w.getAttribute("style") : "";

		return w != null && cur_style == wot.warning.generated_style;
	},

	remove: function (port, data) {

		// stop the checker
		if (wot.warning.check_timer) {
			window.clearInterval(wot.warning.check_timer);
			wot.warning.check_timer = null;
		}

		wot.warning.hide();
		wot.warning.hideobjects(false);
	},

	hideobjects: function(hide) {
		try {
			var elems = [ "embed", "object", "iframe", "applet" ];

			for (var i = 0; i < elems.length; ++i) {
				var objs = document.getElementsByTagName(elems[i]);

				for (var j = 0; objs && j < objs.length; ++j) {
					if (hide) {
						objs[j].setAttribute("wothidden",
							objs[j].style.display || "block");
						objs[j].style.display = "none";
					} else {
						var display = objs[j].getAttribute("wothidden");
						if (display) {
							objs[j].removeAttribute("wothidden");
							objs[j].style.display = display;
						}
					}
				}
			}
		} catch (e) {
			console.log("warning.hideobjects: failed with " + e);
		}
	},

	hide: function()
	{
		try {
			if (wot.warning.warning_id) {
				var elem = document.getElementById(wot.warning.warning_id);
				if (elem && elem.parentNode) {
					elem.parentNode.removeChild(elem);
				}
			}
		} catch (e) {
			console.log("warning.hide: failed with " + e);
		}
	},

	set_exitmode: function() {
		if (window.history.length > 1) {
			wot.warning.exit_mode = "back"; // note: don't change this string, there are code dependent on it
		} else {
			wot.warning.exit_mode = "leave";
		}
	},

	get_style: function () {
		// generates shuffled style for the iframe

		var props = [
			"width: 100%",
			"height: 100%",
			"position: fixed",
			"top:0",
			"left:0",
			"z-index: 2147483646",
			"margin: 0",
			"padding: 0",
			"overflow: hidden",
			"background-color: transparent",
			"border: 0 none transparent",
			"display: block",
			"visibility: visible"
		];

		var res = [];

		while (props.length) {
			res = res.concat(props.splice(Math.random() * props.length, 1))
		}

		return res.map(function(item) {
			return item + " !important";
		}).join("; ");
	},

	add: function(data) {
		try {
			var data = wot.warning.data;

			if (!data.target || !data.cached || document.getElementById("wotwarning")) {
				return;
			}

			wot.warning.set_exitmode();

			this.target = data.target;

			var body = document.getElementsByTagName("body");

			if (!body || !body.length) {
				return;
			}

			var warning = document.createElement("iframe");

			if (!warning) {
				return;
			}

			warning.setAttribute("id", wot.warning.warning_id);

			wot.warning.generated_style = wot.warning.get_style();

			warning.setAttribute("style", wot.warning.generated_style);
			warning.setAttribute("src", chrome.extension.getURL("content/warning.html"));

			warning = body[0].appendChild(warning);

		} catch (e) {
			console.log("warning.add: failed with " + e);
		}
	}

};

wot.warning.onload();
