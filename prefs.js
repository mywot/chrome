/*
	prefs.js
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

$.extend(wot, { prefs: {
	defaults: {
		/* setting names are the same for each platform, don't change */
		accessible:				false,
		min_confidence_level:	wot.confidencelevels[2].min + 2,
		my_cookies:				true,
		popup_hide_delay:		1000,
		popup_show_delay:		200,
		search_ignore_0:		false,
		search_ignore_1:		false,
		search_ignore_2:		false,
		search_ignore_4:		true,
		search_level:			wot.reputationlevels[5].min,
		search_type:			wot.searchtypes.optimized,
		show_application_0:		true,
		show_application_1:		true,
		show_application_2:		true,
		show_application_4:		true,
		show_search_popup:		true,
		use_search_level:		false,
		ninja_donuts:           false,
		ninja_updateshown:      false,
		ninja_announceshown:    0,
		ninja_wave:             0,
		status_level:			"",
		warning_level_0:		wot.reputationlevels[4].min - 1,
		warning_level_1:		wot.reputationlevels[4].min - 1,
		warning_level_2:		wot.reputationlevels[4].min - 1,
		warning_level_4:		0,
		warning_opacity:		0.7,
		warning_type_0:			wot.warningtypes.overlay,
		warning_type_1:			wot.warningtypes.overlay,
		warning_type_2:			wot.warningtypes.overlay,
		warning_type_4:			wot.warningtypes.none,
		warning_unknown_0:		false,
		warning_unknown_1:		false,
		warning_unknown_2:		false,
		warning_unknown_4:		false,
		ratingwindow_shown:     0,   // how many times RatingWindow was opened
		activity_score:         0,
        super_wtips:            false,  // "super" settings for debug purpose: "Show welcome tips always"
        super_fbl:              false,   // "super" settings for debug purpose: "Show FBL always if question is available"
        "update:cats": {
            "101": { name: "Malicious content (e.g. viruses, spyware)", short: "Malicious content", g: 0 },
            "102": { name: "Bad customer / Shopping experience", short: "Bad customer experience", g: 0 },
            "103": { name: "Phishing", g: 0 },
            "104": { name: "Scam", g: 0 },
            "105": { name: "Potentially illegal", g: 0 },
            // unsatisfactory
            "201": { name: "Misleading marketing & information", short: "Misleading information", g: 2 },
            "202": { name: "Privacy risk", g: 2 },
            "203": { name: "Suspicious / potentially risky", g: 2 },
            "204": { name: "Violence, hate, racism, discrimination", short: "Violence, hate, discrimination", g: 2 },
            "205": { name: "Spam", g: 2 },
            "206": { name: "Potentially unwanted programs (e.g. toolbars, types of adware)", short: "Potentially unwanted programs", g: 2 },
            "207": { name: "Ads / pop-ups", g: 2 },
            // neutral
            "301": { name: "Tracking services", g: 4 },
            "302": { name: "Alternative medicine / treatments / Controversial products", short: "Alternative medicine / Controversial", g: 4 },
            "303": { name: "Opinions / Religion / Politics / Ideologies etc.", short: "Opinions / Religion / Politics", g: 4 },
            "304": { name: "Other", g: 4 },
            // good
            "501": { name: "Good site", g: 9 },

            // poor (child safety)
            "401": { name: "Pornography & nudity", g: 10, application: 4, rmin: 0, rmax: 39 },
            "403": { name: "Gruesome / scary / shocking content", short: "Gruesome / shocking", g: 10, application: 4, rmin: 0, rmax: 39  },
            // unsatisfactory (child safety)
            "402": { name: "Incidental nudity (provocative attire)", short: "Incidental nudity", g: 12, application: 4, rmin: 40, rmax: 59  },
            // good (child safety)
            "404": { name: "Designed for children", g: 19, application: 4, rmin: 60, rmax: 100  }
        }
    },

	set: function(name, value)
	{
		try {
			localStorage.setItem(name, JSON.stringify(value));
			wot.trigger("prefs:set", [ name, value ]);
			return true;
		} catch (e) {
			console.log("prefs.set: failed with " + e);
		}

		return false;
	},

	/* Overrides preferences depending on the environment */
	get_overrided_defaults: function(name)
	{
		var mailru_params = {
			"warning_level_4": 39,
			"warning_type_4": wot.warningtypes.overlay,
			"show_application_2": false

		};

		if (wot.env.is_mailru) { // override only for MRU browser
			if(mailru_params[name] !== undefined) {
				return mailru_params[name];
			}
		}

		return this.defaults[name];

	},

	get: function(name)
	{
		try {
			var value;

			try {
				value = JSON.parse(localStorage.getItem(name));
			} catch (e) {
			}

			if (value == null) {
				value = wot.prefs.get_overrided_defaults(name);
			}

			wot.trigger("prefs:get", [ name, value ]);
			return value;
		} catch (e) {
			console.log("prefs.get: failed with " + e);
		}

		return null;
	},

	clear: function(name)
	{
		try {
			localStorage.removeItem(name);
			wot.trigger("prefs:clear", [ name ]);
			return true;
		} catch (e) {
			console.log("prefs.clear: failed with " + e);
		}

		return false;
	},

	each: function(func, params)
	{
		if (typeof(func) != "function") {
			return;
		}

		params = params || [];

		for (var i = 0; i < localStorage.length; ++i) {
			var key = localStorage.key(i);

			var rv = func.apply(null,
						[ key, this.get(key) ].concat(params));

			if (rv) {
				return;
			}
		}
	},

	onload: function()
	{
		wot.bind("message:prefs:getm", function(port, data) {
			var values = {};

			data.names.forEach(function(item) {
				values[item] = wot.prefs.get(item);
			});

			port.post("putm", {
				values: values
			});
		});

		wot.bind("message:prefs:get", function(port, data) {
			port.post("put", {
				name: data.name,
				value: wot.prefs.get(data.name)
			});
		});

		wot.bind("message:prefs:set", function(port, data) {
			wot.prefs.set(data.name, data.value);
		});

		wot.bind("message:prefs:clear", function(port, data) {
			wot.prefs.clear(data.name);
		});

		wot.listen("prefs");
	}
}});

wot.prefs.onload();
