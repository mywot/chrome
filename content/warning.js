/*
	content/warning.js
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

wot.warning = {
	minheight: 600,
	exit_mode: "back",

	make_warning: function()
	{
		var wot_warning = "<div id='wotcontainer' class='wotcontainer {CLASS} {ACCESSIBLE}'>" +
			"<div class='wot-logo'></div>" +
			"<div class='wot-warning'>{WARNING}</div>" +
			"<div class='wot-title'>{TITLE}</div>" +
			"<div class='wot-desc'>{DESC}</div>" +
			"<div class='wot-openscorecard-wrap'>" +
				"<span id='wotinfobutton' class='wot-openscorecard wot-link'>{INFO}</span>" +
			"</div>" +
			"<div id='wot-ratings'>";

		wot.components.forEach(function(item) {

			var c = item.name,
				S_COMPNAME = "RATINGDESC" + c,
				S_RATING = "RATING" + c,
				S_RATING_EXPL = "RATINGEXPL" + c;

			if(wot.warning.settings["show_application_" + c]) {
				wot_warning += "" +
					"<div class='wot-component'>" +
						"<div class='wot-comp-name'>{" + S_COMPNAME + "}</div>" +
						"<div class='wot-comp-level' r='{" + S_RATING + "}'>{" + S_RATING_EXPL + "}</div>" +
						"<div class='wot-comp-icon' r='{" + S_RATING + "}'></div>" +
					"</div>";
			}

		});

		wot_warning +=
			"</div>" +
				"<div class='wot-rateit-wrap'>" +
					"<span>{RATETEXT}</span>" +
				"</div>" +
				"<div class='wot-buttons'>" +
					"<div id='wot-btn-hide' class='wot-button'>{GOTOSITE}</div>" +
					"<div id='wot-btn-leave' class='wot-button'>{LEAVESITE}</div>" +
				"</div>" +
			"</div>";

		return wot_warning;
	},

	getheight: function()
	{
		try {
			if (window.innerHeight) {
				return window.innerHeight;
			}

			if (document.clientHeight) {
				return document.clientHeight;
			}

			if (document.body && document.body.clientHeight) {
				return document.body.clientHeight;
			}
		} catch (e) {
			console.log("warning.getheight: failed with " + e);
		}

		return -1;
	},

	hideobjects: function(hide)
	{
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

	processhtml: function(html, replaces)
	{
		try {
			replaces.forEach(function(item) {
				html = html.replace(RegExp("{" + item.from + "}", "g"),
							item.to);
			});

			return html;
		} catch (e) {
			console.log("warning.processhtml: failed with " + e);
		}

		return "";
	},

	hide: function()
	{
		try {
			var elems = [ document.getElementById("wotwarning"),
						  document.getElementById("wotwrapper") ];

			for (var i = 0; i < elems.length; ++i) {
				if (elems[i] && elems[i].parentNode) {
					elems[i].parentNode.removeChild(elems[i]);
				}
			}
		} catch (e) {
			console.log("warning.hide: failed with " + e);
		}
	},

	set_exitmode: function()
	{
		if(window.history.length > 1) {
			wot.warning.exit_mode = "back"; // note: don't change this string, there are code dependent on it
		} else {
			wot.warning.exit_mode = "leave";
		}
	},

	add: function(data, reason)
	{
		/* Obviously, this isn't exactly foolproof. A site might have
			elements with a higher z-index, or it might try to remove
			our layer... */

		try {
			if (!data.target || document.getElementById("wotwarning")) {
				return;
			}

			wot.warning.set_exitmode();

			var accessible = this.settings.accessible ? "accessible" : "";

			// preprocess link "Rate the site"
			var rate_site = wot.i18n("warnings", "ratesite").replace("<a>", "<a id='wotrate-link' class='wot-link'>");

			var replaces = [
				{
				from: "WARNING",
				to: wot.i18n("warnings", "warning")
			},			{
					from: "TITLE",
					to: (data.decodedtarget || "").replace(/[<>&="']/g, "")
				}, {
					from: "LANG",
					to: wot.i18n("lang")
				}, {
					from: "INFO",
					to: wot.i18n("warnings", "information")
				}, {
					from: "RATETEXT",
				to: rate_site
				}, {
				from: "GOTOSITE",
				to: wot.i18n("warnings", "goto")
				}, {
				from: "LEAVESITE",
				to: wot.i18n("warnings", wot.warning.exit_mode)
			}, {
					from: "ACCESSIBLE",
					to: accessible
				}
			];

			wot.components.forEach(function(item) {

				var cachedv = data.cached.value[item.name];

				var level = wot.getlevel(wot.reputationlevels,
								(cachedv && cachedv.r != null) ? cachedv.r : -1);

				replaces.push({
					from: "RATINGDESC" + item.name,
					to: wot.i18n("components", item.name)
				});
				replaces.push({
					from: "RATING" + item.name,
					to: level.name
				});
				replaces.push({
					from: "RATINGEXPL" + item.name,
					to: wot.i18n("reputationlevels", level.name) || "&nbsp;"
				});
			});

			var warnclass = "";

			if (this.getheight() < this.minheight) {
				warnclass = "wotnoratings";
			}

			if (reason == wot.warningreasons.reputation) {
				replaces.push({ from: "CLASS", to: warnclass });
				replaces.push({
					from: "DESC",
					to: wot.i18n("warnings", "reputation")
				});
			} else if (reason == wot.warningreasons.rating) {
				replaces.push({ from: "CLASS", to: "wotnoratings" });
				replaces.push({
					from: "DESC",
					to: wot.i18n("warnings", "rating")
				});
			} else {
				replaces.push({ from: "CLASS", to: warnclass });
				replaces.push({
					from: "DESC",
					to: wot.i18n("warnings", "unknown")
				});
			}

			var head = document.getElementsByTagName("head");
			var body = document.getElementsByTagName("body");

			if (!head || !head.length || !body || !body.length) {
				return;
			}

			var style = document.createElement("style");

			if (!style) {
				return;
			}

			style.setAttribute("type", "text/css");
			style.innerText = "@import \"" +
				chrome.extension.getURL(wot.getincludepath("warning.css")) +
					"\";";

			head[0].appendChild(style);

			var warning = document.createElement("div");
			var wrapper = document.createElement("div");

			if (!warning || !wrapper) {
				return;
			}

			warning.setAttribute("id", "wotwarning");

			// For child safety we'll set opaque background on adult sites
			var data_4 = data.cached.value[4];
			if (data_4 && data_4.r != undefined && data_4.c != undefined ) {
				if(data_4.r <= this.settings.warning_level_4 && data_4.c >= this.settings.min_confidence_level) {
					this.settings.warning_opacity = 1;
				}
			}

			// set opacity
			if (this.settings.warning_opacity &&
					Number(this.settings.warning_opacity) >= 0 &&
					Number(this.settings.warning_opacity) <= 1) {
				warning.setAttribute("style", "opacity: " +
					this.settings.warning_opacity + " ! important;");
			}

			wrapper.setAttribute("id", "wotwrapper");

			warning = body[0].appendChild(warning);
			wrapper = body[0].appendChild(wrapper);

			wrapper.innerHTML = this.processhtml(this.make_warning(), replaces);
			this.hideobjects(true);

			document.getElementById("wotinfobutton").addEventListener("click",
				function() {
					var url = wot.urls.scorecard + encodeURIComponent(data.target);
					window.location.href = wot.contextedurl(url, wot.urls.contexts.warnviewsc);
				}, false);

			document.getElementById("wot-btn-leave").addEventListener("click",function(e){
				if(wot.warning.exit_mode == "leave") {
					// close tab
					wot.post("tab","close", {});
				} else {
					var e_beforeunload = window.onbeforeunload;
					var back_timer = null;
					window.onbeforeunload = function() {
						if(back_timer) {
							window.clearTimeout(back_timer);
						}
						if(e_beforeunload) e_beforeunload(window);
					};
					window.history.back();

					back_timer = window.setTimeout(function() {
						// this is a trick: we don't know if there is a back-step possible if history.length>1,
						// so we simply wait for a short time, and if we are still on a page, then "back" is impossible and
						// we should go to blank page
						wot.post("tab","close", {});
					}, 100);
				}
			});

			document.getElementById("wot-btn-hide").addEventListener("click",
				function() {
					wot.warning.hide();
					wot.warning.hideobjects(false);
					wot.post("cache", "setflags", {
						target: data.target,
						flags: { warned: true, warned_expire: null }
					});
				}, false);

		document.getElementById("wotrate-link").addEventListener("click",
			function() {
				var url = wot.urls.scorecard +
					encodeURIComponent(data.target) + "/rate";
				window.location.href = wot.contextedurl(url, wot.urls.contexts.warnrate);
			}, false);

		} catch (e) {
			console.log("warning.add: failed with " + e);
		}
	},

	onload: function()
	{
		if (window != window.top) {
			return;
		}

		/* wait for status updates and warn if necessary */
		wot.bind("message:warning:show", function(port, data) {
			wot.warning.settings = data.settings;
			wot.warning.add(data.data, data.type.reason);
		});

		wot.listen("warning");
	}
};

wot.warning.onload();
