/*
	content/settings.js
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

wot.settings = {
	trigger: /^http(s)?\:\/\/(www\.)?mywot\.com\/([^\/]{2}(-[^\/]+)?\/)?settings\/.+/,
	forward: /^http(s)?\:\/\/(www\.)?mywot\.com\/([^\/]{2}(-[^\/]+)?\/)?settings(\/([^\/]+))?\/?(\?.+)?$/,
	match: 6,

	addscript: function(js)
	{
		try {
			var script = document.createElement("script");

			script.setAttribute("type", "text/javascript");
			script.innerText = js;

			var body = document.getElementsByTagName("body");

			if (body && body.length > 0) {
				body[0].appendChild(script);
			}
		} catch (e) {
			wot.log("settings.addscript: failed with " + e);
		}
	},

	savesearch: function()
	{
		var state = {};

		var inputs = document.getElementsByClassName("wotsearchpref");

		for (var i = 0; i < inputs.length; ++i) {
			var attrs = {};

			[ "id", "type" ].forEach(function(item) {
				attrs[item] = inputs[i].getAttribute(item);
			});

			if (!/^wotsearch-/.test(attrs.id) || attrs.type != "checkbox" ||
					inputs[i].checked) {
				continue;
			}

			var m = /^wotsearch-(.+)$/.exec(attrs.id);

			if (m && m[1]) {
				state[m[1]] = true;
				wot.log("settings.savesearch: disabled: " + attrs.id);
			}
		}

		wot.prefs.set("search:state", state);
	},

	savesetting: function(elem)
	{
		var attrs = {};

		[ "wotpref", "id", "type", "value" ].forEach(function(item) {
			attrs[item] = elem.getAttribute(item);
		});

		if (!attrs.wotpref || !attrs.id || !attrs.type ||
				/^wotsearch-/.test(attrs.id)) {
			return;
		}

		if (attrs.type == "checkbox" || attrs.type == "radio") {
			if (attrs.wotpref == "bool") {
				wot.prefs.set(attrs.id, !!elem.checked);
			} else {
				wot.log("settings.savesetting: " + attrs.type +
					" cannot be " + attrs.wotpref);
			}
		} else {
			if (attrs.value == null) {
				if (attrs.wotpref == "string") {
					attrs.value = "";
				} else {
					wot.log("settings.savesetting: missing value for " +
						attrs.id);
					return;
				}
			}

			switch (attrs.wotpref) {
				case "string":
					wot.prefs.set(attrs.id, attrs.value.toString());
					break;
				case "bool":
					wot.prefs.set(attrs.id, (attrs.value == "true"));
					break;
				case "int":
					wot.prefs.set(attrs.id, Number(attrs.value));
					break;
				default:
					wot.log("settings.savesetting: unknown type " +
						attrs.wotpref);
					break;
			}
		}
	},

	saveinputs: function()
	{
		var inputs = document.getElementsByTagName("input");

		for (var i = 0; i < inputs.length; ++i) {
			this.savesetting(inputs[i]);
		}
	},

	save: function()
	{
		try {
			var save = document.getElementById("wotsave");

			if (save) {
				var saveclass = save.getAttribute("class");

				if (saveclass && saveclass.indexOf("disabled") >= 0) {
					return;
				}
			}

			this.saveinputs();
			this.savesearch();

			this.addscript("wotsettings_saved();");
		} catch (e) {
			wot.log("settings.save: failed with " + e);
			this.addscript("wotsettings_failed();");
		}
	},

	loadsearch: function()
	{
		var elem = document.getElementById("wotsearch");

		if (!elem) {
			return;
		}

		var preftype = elem.getAttribute("wotpref");

		if (preftype != "input") {
			return;
		}

		wot.prefs.get("search:state", function(name, state) {
			state = state || {};

			wot.prefs.get("update:state", function(name, update) {
				update = update || { search: [] };

				/* sort by display name */
				update.search.sort(function(a, b) {
					if (a.display < b.display) {
						return -1;
					}
					if (a.display > b.display) {
						return 1;
					}
					return 0;
				});

				update.search.forEach(function(item) {
					if (!item.display) {
						return;
					}

					var id = "wotsearch-" + item.name;

					var input = document.createElement("input");
					var label = document.createElement("label");

					input.setAttribute("id", id);
					input.setAttribute("class", "wotsearchpref");
					input.setAttribute("type", "checkbox");
					input.setAttribute("wotpref", "bool");
					input.checked = !state[item.name];

					label.setAttribute("for", id);
					label.innerText = item.display;

					elem.appendChild(input);
					elem.appendChild(label);
					elem.appendChild(document.createElement("br"));

					wot.log("settings.loadsearch: added " + id);
				});
			});
		});
	},

	loadsetting: function(elem)
	{
		var attrs = {};

		[ "wotpref", "id", "type" ].forEach(function(item) {
			attrs[item] = elem.getAttribute(item);
		});

		if (!attrs.wotpref || !attrs.id || !attrs.type) {
			return;
		}

		wot.prefs.get(attrs.id, function(name, value) {
			if (value == null) {
				wot.log("settings.loadsetting: " + attrs.id + " missing");
			} else if (attrs.type == "checkbox" || attrs.type == "radio") {
				wot.log("settings.loadsetting: " + attrs.id + " = " + !!value);
				elem.checked = !!value;
			} else {
				elem.setAttribute("value", value.toString());
			}
		});
	},

	loadinputs: function()
	{
		var inputs = document.getElementsByTagName("input");

		for (var i = 0; i < inputs.length; ++i) {
			wot.settings.loadsetting(inputs[i]);
		}
	},

	load: function()
	{
		try {
			wot.settings.loadinputs();
			wot.settings.loadsearch();

			[ "wotsave", "wotnext" ].forEach(function(id) {
				var elem = document.getElementById(id);

				if (elem) {
					elem.addEventListener("click", function() {
							wot.settings.save();
						}, false);
				}
			});

			/* TODO: levels */

			wot.bind("prefs:ready", function() {
				wot.settings.addscript("wotsettings_ready();");
				wot.log("settings.load: done");
			});
		} catch (e) {
			wot.log("settings.load: failed with " + e);
		}
	},

	onload: function()
	{
		if (window != window.top) {
			return; /* ignore the settings page if it's in a frame */
		}

		wot.detect_environment(true); // detect but don't change preferences

		var match = window.location.href.match(this.forward);

		if (match) {

			wot.prefs.get("partner", function(n, partner){

				wot.partner = partner;
				/* redirect to the correct settings language and version */
				var section = match[wot.settings.match];

				/* make sure we have set up authentication cookies */
				wot.bind("my:ready", function() {
					 var loc = wot.urls.settings + "/" +
						wot.i18n("lang") + "/" + wot.platform + "/" + wot.version +
						(wot.partner ? "/" + wot.partner : "") +
						(section ? "/" + section : "");

					loc += (wot.partner ? "#ratings" : ""); // fix for a bug "empty settings tab if partner is set"

					window.location.href = loc;
				});
			});

		} else if (this.trigger.test(window.location.href)) {
			/* load settings for this page */
			document.addEventListener("DOMContentLoaded", function() {
					wot.settings.load();
				}, false);

			if (document.readyState == "complete") {
				wot.settings.load();
			}
		}
	}
};

wot.settings.onload();
