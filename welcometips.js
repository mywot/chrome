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

/* For background.html only (!) */

/* Intro tips explanations:
*   Intro0 - First introduction tip which is shown right after the add-on was installed
*
* */


$.extend(wot, { wt: {

	enabled: true,  // see also content/welcome_tips.js "enabled: true," line at the beginning

	settings: {
		intro_0_shown: null,        // how many times intro0 was shown
		intro_0_ok: null,           // OK was clicked on intro0 tip
		intro_0_shown_dt: null,      // the last time Intro0 was shown

		rw_shown: 0,
		rw_ok: null,
		rw_shown_dt: null,

		warning_shown: 0,
		warning_ok: null,
		warning_optedout: false,
		warning_shown_dt: null
	},

	load_settings: function () {
		wot.log("wot.wt.load_settings()");
		for (var name in wot.wt.settings) {
			if (wot.wt.settings.hasOwnProperty(name)) {
				var val = wot.prefs.get("wt_" + name);
				if (val !== undefined) {
					wot.wt.settings[name] = wot.prefs.get("wt_" + name);
				}
			}
		}
	},

	save_setting: function (name, value) {
		wot.log("wot.wt.save_setting()");

		if(value === undefined) {
			value = wot.wt.settings[name];
		}

		return wot.prefs.set("wt_" + name, value);
	},

	init: function () {
		wot.log("wot.wt.init()");

		if (wot.wt.enabled) {

			// Check additional conditions for Mail.ru users
			var locale = wot.i18n("locale");
			if (!wot.env.is_mailru && (locale == "en" || locale == "ru")) return;

			this.load_settings();

			// Initialize Intro Tip
			if (wot.wt.intro.tts_intro0()) {
				wot.wt.intro.init_intro0();
			}

			// Initialize Tip for Warning screen
			if (wot.wt.warning.tts()) {
				wot.wt.warning.init();
			}
		}
	},

	intro: {
		// is now "Time To Show" Intro0 tip?

		intro_0_showdelay: 2000,    // milliseconds before Intro 0 tip will be shown

		tts_intro0: function () {
			wot.log("wot.wt.tts_intro0()");

			var timesincefirstrun = wot.time_sincefirstrun() || 0,
				wt_settings = wot.wt.settings;

			if ((   wt_settings.intro_0_shown < 2 || !wt_settings.intro_0_shown) &&
					!wt_settings.intro_0_ok &&
					wot.time_since(wot.core.launch_time) <= 10 * wot.DT.MINUTE &&
					timesincefirstrun <= 15 * wot.DT.DAY ) {

				// don't show intro tip first time if user already has experience with WOT longer than 2 days
				if (!wt_settings.intro_0_shown && timesincefirstrun > 2 * wot.DT.DAY ) {
					return false;
				}

				// don't show intro tip second time before 10 days after installation
				if (wt_settings.intro_0_shown === 1 && wot.wt.settings.intro_0_shown_dt && wot.time_since(wot.wt.settings.intro_0_shown_dt) < 7 * wot.DT.DAY ) {
					return false;
				}

				return true;
			}

			return false;
		},

		init_intro0: function () {
			wot.log("wot.wt.init_intro0()");

			wot.bind("message:wtb:ready", function (port, data){
				console.log("message:wtb:ready was received", port, data);

				window.setTimeout(function (port){
					// react only if all conditions are stil met
					if (wot.wt.intro.tts_intro0()) {
						wot.wt.intro.show_intro0(port.port.sender.tab);
					}
				}, wot.wt.intro.intro_0_showdelay, port);
			});

		},

		show_intro0: function (tab) {

			wot.bind("message:wtb:tip_shown", function (port, data){
				if (data && data.mode === "intro_0") {
					wot.wt.settings.intro_0_shown = wot.wt.settings.intro_0_shown ? wot.wt.settings.intro_0_shown + 1 : 1;
					wot.wt.save_setting("intro_0_shown");
					wot.wt.settings.intro_0_shown_dt = new Date();
					wot.wt.save_setting("intro_0_shown_dt");

					wot.ga.fire_event(wot.ga.categories.WT, wot.ga.actions.WT_INTRO_0_SHOWN, String(wot.wt.settings.intro_0_shown));
				}
			});

			wot.bind("message:wtb:clicked", function (port, data){
				// data is { mode: "intro_0", elem: "ok" }
				if(data && data.mode === "intro_0" && data.elem === "ok") {
					var seconds_since_shown = Math.round(wot.time_since(wot.wt.settings.intro_0_shown_dt));
					wot.wt.settings.intro_0_ok = true;
					wot.wt.save_setting("intro_0_ok");
					wot.ga.fire_event(wot.ga.categories.WT, wot.ga.actions.WT_INTRO_0_OK, String(seconds_since_shown));
				}
			});

			var port = chrome.tabs.connect(tab.id, {name: "wt"});
			port.postMessage({ message: "wt:show_intro_0" });
		}
	},

	warning: {
		init: function () {
			wot.bind("message:wtb:wtip_shown", wot.wt.warning.on_show);
			wot.bind("message:wtb:wtip_ok", wot.wt.warning.on_ok);
		},

		tts: function () {
			/* Conditions to show warning welcome tip:
			 *
			  * 1. Welcome tip was never, or less then 2 times shown
			  * 2. Welcome tip's OK button was never clicked
			  * 3. Time since installation not more then 2 week
			  * 4. --Warning is shown first time-- | or if WT was shown once but without OK, time from last WT is more then 7 days.
			  *
			  * */

			var locale = wot.i18n("locale");
			// Mailru only. RU and EN only.
			if (!(wot.env.is_mailru && (locale === "ru" || locale === "en"))) {
				return false;
			}

 			var timesincefirstrun = wot.time_sincefirstrun() || 0,
				wt_settings = wot.wt.settings,
				 timesince_firstshow = wot.time_since(wt_settings.warning_shown_dt);

 			if (wt_settings.warning_shown < 2 && wt_settings.warning_ok !== true &&
				 timesincefirstrun <= 14 * wot.DT.DAY ) {

				 if (wt_settings.warning_shown === 1 && timesince_firstshow <= 7 * wot.DT.DAY) {
					 return false;
				 }

				 return true;
			}

			return false;
		},

		on_show: function (port, data) {

			wot.wt.settings.warning_shown++;
			wot.wt.save_setting("warning_shown");
			wot.wt.settings.warning_shown_dt = new Date();
			wot.wt.save_setting("warning_shown_dt");
			wot.ga.fire_event(wot.ga.categories.WT, wot.ga.actions.WT_WS_SHOWN, data.target);
		},

		on_ok: function (port, data) {
			try {
				wot.wt.settings.warning_ok = true;
				wot.wt.save_setting("warning_ok");

				var optout = data.optout;

				if (optout) {
					wot.wt.settings.warning_optedout = true;
					wot.wt.save_setting("warning_optedout");
					wot.wt.warning.disable_warning();   // change settings so Warning won't be shown any more
					wot.ga.fire_event(wot.ga.categories.WT, wot.ga.actions.WT_WS_OPTEDOUT, String(data.target));
				}

				wot.ga.fire_event(wot.ga.categories.WT, wot.ga.actions.WT_WS_OK, String(data.read_time));

			} catch (e) {
				console.log("wot.wt.warning.on_ok() failed with ", e);
			}
		},

		disable_warning: function () {
			wot.components.forEach(function(app) {
				wot.prefs.set("warning_level_" + app.name, 0);
				wot.prefs.set("warning_type_" + app.name, 0);
				wot.prefs.set("warning_unknown_" + app.name, false);
			});
		}
	}
}});
