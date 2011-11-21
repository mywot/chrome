/*
	content/warning.js
	Copyright © 2009-2011  WOT Services Oy <info@mywot.com>

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

const WOT_WARNING_HTML =
	"<table id=\"wotcontainer\" cellspacing=\"0\" lang=\"{LANG}\" class=\"{CLASS} {ACCESSIBLE}\">" +
	"<tr id=\"wotheadline\" style=\"background: url({HEADLINE}) top center no-repeat ! important;\">" +
		"<td colspan=\"2\"></td>" +
	"</tr>" +
	"<tr id=\"wotcontainertop\">" +
		"<td colspan=\"2\"></td>" +
	"</tr>" +
	"<tr id=\"wotdescription\" class=\"wotcontainermiddle\">" +
		"<td colspan=\"2\">" +
			"<div id=\"wotdescriptiontext\" class=\"wotlimitwidth {DESCCLASS}\">{DESC}</div>" +
		"</td>" +
	"</tr>" +
	"<tr id=\"wottarget\" class=\"wotcontainermiddle\">" +
		"<td colspan=\"2\">" +
			"<div id=\"wotwebsite\" class=\"wotlimitwidth\" title=\"{TITLE}\">{TITLE}</div>" +
		"</td>	" +
	"</tr>" +
	"<tr id=\"wotinfo\" class=\"wotcontainermiddle\">" +
		"<td colspan=\"2\">" +
			"<div id=\"wotinfobutton\">" +
				"<span id=\"wotinfotext\">{INFO}</span>" +
			"</div>" +
		"</td>" +
	"</tr>" +
	"<tr id=\"wotratingtop\" class=\"wotcontainermiddle\">" +
		"<td colspan=\"2\"></td>" +
	"</tr>" +
	"<tr id=\"wotratingareatop\" class=\"wotratingarea\">" +
		"<td colspan=\"2\"></td>" +
	"</tr>" +
	"<tr id=\"wotrating0\" class=\"wotratingarea wotratingrow wotreputation{RATING0}\">" +
		"<td class=\"wotratingcol wotratingcolleft\">" +
			"<span class=\"wotratingname\">{RATINGDESC0}</span>" +
		"</td>" +
		"<td class=\"wotratingcol wotratingcolright\">" +
			"<span id=\"wotratingexpl0\" class=\"wotratingexpl\">{RATINGEXPL0}</span>" +
		"</td>" +
	"</tr>" +
	"<tr id=\"wotrating1\" class=\"wotratingarea wotratingrow wotreputation{RATING1}\">" +
		"<td class=\"wotratingcol wotratingcolleft\">" +
			"<span class=\"wotratingname\">{RATINGDESC1}</span>" +
		"</td>" +
		"<td class=\"wotratingcol wotratingcolright\">" +
			"<span id=\"wotratingexpl1\" class=\"wotratingexpl\">{RATINGEXPL1}</span>" +
		"</td>" +
	"</tr>" +
	"<tr id=\"wotrating2\" class=\"wotratingarea wotratingrow wotreputation{RATING2}\">" +
		"<td class=\"wotratingcol wotratingcolleft\">" +
			"<span class=\"wotratingname\">{RATINGDESC2}</span>" +
		"</td>" +
		"<td class=\"wotratingcol wotratingcolright\">" +
			"<span id=\"wotratingexpl2\" class=\"wotratingexpl\">{RATINGEXPL2}</span>" +
		"</td>" +
	"</tr>" +
	"<tr id=\"wotrating4\" class=\"wotratingarea wotratingrow wotreputation{RATING4}\">" +
		"<td class=\"wotratingcol wotratingcolleft\">" +
			"<span class=\"wotratingname\">{RATINGDESC4}</span>" +
		"</td>" +
		"<td class=\"wotratingcol wotratingcolright\">" +
			"<span id=\"wotratingexpl4\" class=\"wotratingexpl\">{RATINGEXPL4}</span>" +
		"</td>" +
	"</tr>" +
	"<tr id=\"wotratingareabottom\" class=\"wotratingarea\">" +
		"<td colspan=\"2\"></td>" +
	"</tr>" +
	"<tr id=\"wotratingbottom\" class=\"wotcontainermiddle\">" +
		"<td colspan=\"2\"></td>" +
	"</tr>" +
	"<tr id=\"wotbuttonstop\" class=\"wotcontainermiddle\">" +
		"<td colspan=\"2\"></td>" +
	"</tr>" +
	"<tr id=\"wotbuttons\" class=\"wotcontainermiddle\">" +
		"<td id=\"wotbuttonrate\">" +
			"<span id=\"wotratebutton\" class=\"wotbutton\">{RATETEXT}</span>" +
		"</td>" +
		"<td id=\"wotbuttongoto\">" +
			"<span id=\"wotgotobutton\" class=\"wotbutton\">{GOTOTEXT}</span>" +
		"</td>" +
	"</tr>" +
	"<tr id=\"wotcontainerbottom\">" +
		"<td colspan=\"2\"></td>" +
	"</tr>" +
	"<tr id=\"wotlogo\">" +
		"<td colspan=\"2\"></td>" +
	"</tr>" +
	"</table>";

wot.warning = {
	minheight: 600,

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
			console.log("warning.getheight: failed with " + e + "\n");
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
			console.log("warning.hideobjects: failed with " + e + "\n");
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
			console.log("warning.processhtml: failed with " + e + "\n");
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
			console.log("warning.hide: failed with " + e + "\n");
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

			var accessible = this.settings.accessible ? "accessible" : "";

			var replaces = [
				{
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
					to: wot.i18n("warnings", "ratesite")
				}, {
					from: "GOTOTEXT",
					to: wot.i18n("warnings", "gotosite")
				}, {
					from: "ACCESSIBLE",
					to: accessible
				}
			];

			wot.components.forEach(function(item) {
				var level = wot.getlevel(wot.reputationlevels,
								data.cached.value[item.name] ?
									data.cached.value[item.name].r : -1);

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
				replaces.push({ from: "DESCCLASS", to: "wotlongdescription" });
				replaces.push({
					from: "DESC",
					to: wot.i18n("warnings", "reputation")
				});
			} else if (reason == wot.warningreasons.rating) {
				replaces.push({ from: "CLASS", to: "wotnoratings" });
				replaces.push({ from: "DESCCLASS", to: "wotlongdescription" });
				replaces.push({
					from: "DESC",
					to: wot.i18n("warnings", "rating")
				});
			} else {
				replaces.push({ from: "CLASS", to: warnclass });
				replaces.push({ from: "DESCCLASS", to: "" });
				replaces.push({
					from: "DESC",
					to: wot.i18n("warnings", "unknown")
				});
			}

			if (reason != wot.warningreasons.unknown) {
				replaces.push({
					from: "HEADLINE",
					to: chrome.extension.getURL(wot.getlocalepath("warning.png"))
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

			if (this.settings.warning_opacity &&
					Number(this.settings.warning_opacity) >= 0 &&
					Number(this.settings.warning_opacity) <= 1) {
				warning.setAttribute("style", "opacity: " +
					this.settings.warning_opacity + " ! important;");
			}

			wrapper.setAttribute("id", "wotwrapper");

			warning = body[0].appendChild(warning);
			wrapper = body[0].appendChild(wrapper);

			wrapper.innerHTML = this.processhtml(WOT_WARNING_HTML, replaces);
			this.hideobjects(true);

			document.getElementById("wotinfobutton").addEventListener("click",
				function() {
					window.location.href = wot.urls.scorecard +
						encodeURIComponent(data.target);
				}, false);

			document.getElementById("wotratebutton").addEventListener("click",
				function() {
					window.location.href = wot.urls.scorecard +
						encodeURIComponent(data.target) + "/rate";
				}, false);

			document.getElementById("wotgotobutton").addEventListener("click",
				function() {
					wot.warning.hide();
					wot.warning.hideobjects(false);
					wot.post("cache", "setflags", {
						target: data.target,
						flags: { warned: true }
					});
				}, false);
		} catch (e) {
			console.log("warning.add: failed with " + e + "\n");
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
