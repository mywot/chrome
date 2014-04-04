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

/* For background.html only (!) */

/* Intro tips explanations:
*   Intro0 - First introduction tip which is shown right after the add-on was installed
*
* */


$.extend(wot, { wt: {

	enabled: true,              // see also content/welcome_tips.js "enabled: true," line at the beginning
	intro_shown_sent: null,     // flag to remember that we have sent already message to show the tip
	activity_score_max: 1500,   // level of AS after which the add-on should not show Tips (see GH #83). 1500 = Bronze

	settings: {
		intro_0_shown: 0,           // how many times intro0 was shown
		intro_0_ok: false,          // OK was clicked on intro0 tip
		intro_0_shown_dt: null,     // the last time Intro0 was shown

		rw_shown: 0,
		rw_ok: false,
		rw_shown_dt: null,

		warning_shown: 0,
		warning_ok: false,
		warning_optedout: false,    // was warning disabled by the user via warning tip?
		warning_shown_dt: null,

		donuts_shown: 0,
		donuts_shown_dt: null,
		donuts_ok: false

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

	bind_events: function () {

		// Warning Tip
		wot.bind("message:wtb:wtip_shown", wot.wt.warning.on_show);
		wot.bind("message:wtb:wtip_ok", wot.wt.warning.on_ok);
		wot.bind("message:wtb:wtip_info", wot.wt.warning.on_learnmore);

		// Intro Tip
		wot.bind("message:wtb:ready", function (port, data) {

			window.setTimeout(function (port){
				// react only if all conditions are stil met
				if (wot.wt.intro.tts_intro0()) {
					wot.wt.intro.show_intro0(port.port.sender.tab);
				}
			}, wot.wt.intro.intro_0_showdelay, port);
		});

		wot.bind("message:wtb:tip_shown", wot.wt.intro.on_show);
		wot.bind("message:wtb:clicked", wot.wt.intro.on_click);

		// Donut Tip
		wot.bind("message:wtb:dtip_shown", wot.wt.donuts.on_show);
		wot.bind("message:wtb:dtip_ok", wot.wt.donuts.on_ok);
		wot.bind("message:wtb:dtip_info", wot.wt.donuts.on_learnmore);

	},

	init: function () {
		wot.log("wot.wt.init()");

		wot.wt.enabled = wot.wt.enabled && !wot.env.is_mailru_amigo;    // disable tips for Mail.ru Amigo browser

		if (wot.wt.enabled) {

            // whether super-settings is off, check normal conditions
            if (!wot.prefs.get("super_wtips")) {
                // Check additional conditions
                // workaround for http://code.google.com/p/chromium/issues/detail?id=53628
                // test if locale strings are available (due to bug in Chrome, it is possible to get "undefined")
                if (!wot.is_defined(["intro_0_msg", "intro_0_btn", "donut_msg", "donut_btn",
                                     "warning_text", "warning_ok", "learnmore_link"], "wt")) return;

                if (wot.get_activity_score() >= wot.wt.activity_score_max) return;
            }

			wot.wt.load_settings();
		}
	},

	intro: {

		intro_0_showdelay: 800,    // milliseconds before Intro 0 tip will be shown

		// is now "Time To Show" Intro0 tip?
		tts_intro0: function () {

            if (wot.prefs.get("super_wtips")) return true;

//            var locale = wot.i18n("locale");
			if (wot.env.is_mailru) return false; // Not for Mailru only.

			var timesincefirstrun = wot.time_sincefirstrun() || 0,
				wt_settings = wot.wt.settings;

			if (wt_settings.intro_0_shown < 2 &&
				!wt_settings.intro_0_ok &&
				wot.time_since(wot.core.launch_time) <= 10 * wot.DT.MINUTE &&
                timesincefirstrun <= 15 * wot.DT.DAY ) {

				// don't show intro tip first time if the user already has experience with WOT longer than 2 days
				if (!wt_settings.intro_0_shown && timesincefirstrun > 2 * wot.DT.DAY ) {
					return false;
				}

				// don't show intro tip second time before 7 days after it was shown first time
				if (wt_settings.intro_0_shown === 1 &&
					wot.wt.settings.intro_0_shown_dt &&
					wot.time_since(wot.wt.settings.intro_0_shown_dt) < 7 * wot.DT.DAY ) {
					return false;
				}

				if (wot.get_activity_score() >= wot.wt.activity_score_max) return false;

				return true;
			}

			return false;
		},

		init_intro0: function () {
			wot.log("wot.wt.init_intro0()");
		},

		on_show: function (port, data) {
			if (data && data.mode === "intro_0") {
				wot.wt.settings.intro_0_shown++;
				wot.wt.save_setting("intro_0_shown");
				wot.wt.settings.intro_0_shown_dt = new Date();
				wot.wt.save_setting("intro_0_shown_dt");

				wot.ga.fire_event(wot.ga.categories.WT, wot.ga.actions.WT_INTRO_0_SHOWN, String(wot.wt.settings.intro_0_shown));
			}
		},

		on_click: function (port, data) {
			// data is { mode: "intro_0", elem: "ok" }
			if(data && data.mode === "intro_0" && data.elem === "ok") {
				var seconds_since_shown = Math.round(wot.time_since(wot.wt.settings.intro_0_shown_dt));
				wot.wt.settings.intro_0_ok = true;
				wot.wt.save_setting("intro_0_ok");
				wot.ga.fire_event(wot.ga.categories.WT, wot.ga.actions.WT_INTRO_0_OK, String(seconds_since_shown));
				return;
			}
			if(data && data.mode === "intro_0" && data.elem === "learnmore") {
				wot.wt.settings.intro_0_ok = true;
				wot.wt.save_setting("intro_0_ok");
				wot.core.open_mywot(wot.urls.tour, wot.urls.contexts.wt_intro);
				wot.ga.fire_event(wot.ga.categories.WT, wot.ga.actions.WT_INTRO_0_LEARN);
				return;
			}
		},

		show_intro0: function (tab) {

			try {
				// prevent trying to show Intro tip more than 1 time in a minute
				if (wot.wt.intro_shown_sent && wot.time_since(wot.wt.intro_shown_sent) <= 60) {
					return;
				}
				wot.wt.intro_shown_sent = new Date();

				var port = chrome.tabs.connect(tab.id, {name: "wt"});
				port.postMessage({ message: "wt:show_intro_0" });
			} catch (e) {
				console.log("wot.wt.intro.show_intro0() failed", e);
			}
		}
	},

	warning: {
		tts: function () {
			/* Conditions to show warning welcome tip:
			 *
			  * 1. Welcome tip was never, or less then 2 times shown
			  * 2. Welcome tip's OK button was never clicked
			  * 3. Time since installation not more then 2 week
			  * 4. --Warning is shown first time-- | or if WT was shown once but without OK, time from last WT is more then 7 days.
			  *
			  * */

            if (wot.prefs.get("super_wtips")) return true;

			if (wot.is_mailru_amigo) return false;

 			var timesincefirstrun = wot.time_sincefirstrun() || 0,
				wt_settings = wot.wt.settings,
				 timesince_firstshow = wot.time_since(wt_settings.warning_shown_dt);

 			if (wt_settings.warning_shown < 2 && wt_settings.warning_ok !== true &&
                timesincefirstrun <= 14 * wot.DT.DAY ) {

				 if (wt_settings.warning_shown === 1 && timesince_firstshow <= 7 * wot.DT.DAY) {
					 return false;
				 }

				 if (wot.get_activity_score() >= wot.wt.activity_score_max) return false;

				 return true;
			}

			return false;
		},

		on_show: function (port, data) {
			if (wot.wt.settings.warning_shown < 2) {
				wot.wt.settings.warning_shown++;
				wot.wt.save_setting("warning_shown");
				wot.wt.settings.warning_shown_dt = new Date();
				wot.wt.save_setting("warning_shown_dt");
				wot.ga.fire_event(wot.ga.categories.WT, wot.ga.actions.WT_WS_SHOWN, data.target);
			}
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

		on_learnmore: function (port, data) {
			var elem = data.elem || "logo";
			var context = elem == "logo" ? wot.urls.contexts.wt_warn_logo : wot.urls.contexts.wt_warn_lm;
			wot.core.open_mywot(wot.urls.tour_warning, context);
			wot.ga.fire_event(wot.ga.categories.WT, wot.ga.actions.WT_WS_LEARN, elem);
		},

		disable_warning: function () {
			wot.components.forEach(function(app) {
				wot.prefs.set("warning_level_" + app.name, 0);
				wot.prefs.set("warning_type_" + app.name, 0);
				wot.prefs.set("warning_unknown_" + app.name, false);
            });
            wot.prefs.set("settingsui_warnlevel", "off");
		}
	},

	donuts: {

		was_triggered: false,

		on_show: function (port, data) {
			if (data.times === 0) {
				wot.wt.settings.donuts_shown++;
				wot.wt.settings.donuts_shown_dt = new Date();
				wot.wt.save_setting("donuts_shown");
				wot.wt.save_setting("donuts_shown_dt");
			}

			wot.ga.fire_event(wot.ga.categories.WT, wot.ga.actions.WT_DONUTS_SHOWN, String(data.rule_name));
		},

		on_ok: function (port, data) {
			var wt_settings = wot.wt.settings;
			wt_settings.donuts_ok = true;
			wot.wt.save_setting("donuts_ok");
			wot.ga.fire_event(wot.ga.categories.WT, wot.ga.actions.WT_DONUTS_OK, String(wt_settings.donuts_shown));
		},

		on_learnmore: function (port, data) {
			var elem = data.elem || "logo";
			var context = elem == "logo" ? wot.urls.contexts.wt_donuts_logo : wot.urls.contexts.wt_donuts_lm;
			wot.core.open_mywot(wot.urls.tour, context); // open tour page
			wot.ga.fire_event(wot.ga.categories.WT, wot.ga.actions.WT_DONUTS_LEARN, elem);

			// since user has interaction with the Tip - don't show it anymore
			wot.wt.settings.donuts_ok = true;
			wot.wt.save_setting("donuts_ok");
		},

		tts: function () {

            if (wot.prefs.get("super_wtips")) return true;

			if (wot.is_mailru_amigo) return false;

			var timesincefirstrun = wot.time_sincefirstrun() || 0,
				wt_settings = wot.wt.settings;

			if (wt_settings.donuts_shown < 4 &&
				!wt_settings.donuts_ok &&
                timesincefirstrun <= 15 * wot.DT.DAY ) {

				// don't show donut tip first time if the user already has experience with WOT longer than 5 days
				if (wt_settings.donuts_shown < 3 && timesincefirstrun > 5 * wot.DT.DAY ) {
					return false;
				}

				// don't show donut tip third time before 7 days after installation
				if (wt_settings.donuts_shown == 2 &&
					wot.wt.settings.donuts_shown_dt &&
					wot.time_since(wot.wt.settings.donuts_shown_dt) < 7 * wot.DT.DAY ) {
					return false;
				}

				if (wot.get_activity_score() >= wot.wt.activity_score_max) return false;
				return true;
			}

			return false;

		}
	}
}});
