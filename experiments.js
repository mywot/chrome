/*
 experiments.js
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

$.extend(wot, { exp: {

	EXP_PREF_NAME: "experiments",

	list: {
//		example: {  // this is a template to declare experiments
//			options: ['vara', 'varb'],  // list of variants
//			default: "vara",
//			expires: new Date(2013, 1, 28)   // or null if never expires. Month starts from zero(!)
//		},
		rtip: {
			options: ["neu", "stk"],    // Neutral | Sticker
			default: "stk",
			expires: new Date(2013, 3, 11)
		},
		wtip: {
			options: ["on", "off"],
			default: "on",
			expires: new Date(2013, 3, 30)
		},
        beta: {
            options: ["old"],
            default: "old",
            expires: null
        }
	},

	is_running: function (exp_var) {
		// checks whether the Variant of Experiment given by string "experiment-variant" is running
		try {
			var _this = wot.exp;
			var exp_obj = _this._split(exp_var),
				is_expired;

			if (exp_obj === null) {
				return null;
			}
			var eo =  exp_obj.obj,
				exp = exp_obj.exp,
				vr =  exp_obj.vr;

			is_expired = _this.is_expired(exp, vr);
			if (is_expired) {
				return vr === eo.default;   // when the Exp is expired, test the variant whether it is equal to default one
			}

			if (eo.current) {
				return eo.current === vr;
			} else {
				// the experiement is not running, we need to run it now
				var current = _this.start(exp);
				if (current) {
					return (vr === current);
				} else {
					console.log("no option was selected. Weird.");
					return null;
				}
			}
		} catch (e) {
			console.error(e);
		}

		return null;
	},

	init: function () {
		// loads experiement's preferences and init current exps, or start exps
		var _this = wot.exp;
		_this.load();
	},

	start: function (exp) {
		// makes the selection of variant randomly and stores the choice in preferences
		var _this = wot.exp;
		var options = _this.list[exp].options;

		var p = Math.floor((Math.random() * options.length)); // take random option
		_this.list[exp].current = options[p];
		_this.save();

		if (wot.ga) {
			wot.ga.set_experiments();
		}

		return _this.list[exp].current;
	},

	load: function () {
		var saved = wot.prefs.get(wot.exp.EXP_PREF_NAME) || {};
		if (saved) {
			var elist = wot.exp.list;
			for (var e in saved) {
				if (elist[e] && saved[e].c) {
					elist[e].current = saved[e].c;
				}
			}
		}
	},

	save: function () {
		var elist = wot.exp.list,
			tosave = {};

		for (var e in elist) {
			if (elist[e].current) {
				tosave[e] = {
					c: elist[e].current
				};
			}
		}
		wot.prefs.set(wot.exp.EXP_PREF_NAME, tosave);
	},

	exps_running_ga: function () {
		// forms a string of running experiments to report them to GA as a custom variable.
		var res = "";
		for (var exp in wot.exp.list) {
			if (wot.exp.list[exp] && wot.exp.list[exp].current) {
				res += "(" + exp + "-" + wot.exp.list[exp].current + ")";
			}
		}
		return res;
	},

	is_expired: function (exp) {
		var _this = wot.exp;
		var eo = _this.list[exp];
		if (eo) {
			if (eo.expires) {
				return (new Date() > eo.expires);
			} else {
				return false;
			}
		} else {
			console.log("Can't find the ", exp, "in the experiments list");
			return null;
		}
	},

	_split: function (exp_var) {
		if (exp_var && exp_var.length) {
			var parts = exp_var.split("-", 2);
			if (parts.length < 2) return null;

			var exp = parts[0], vr = parts[1];

			var exp_object = wot.exp.list[exp];

			if (!exp_object) { // no such experiment
				console.log("No experiment", exp, "defined. Do nothing.");
				return null;
			}
			return {exp: exp, obj: exp_object, vr: vr};
		}
		return null;
	}


}});
