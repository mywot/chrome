/*
 surveys_core.js
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

$.extend(wot, { surveys: {

	PREFNAMES: {
		asked:    "surveys_asked",
		lasttime: "surveys_lasttimeasked",
		optedout: "surveys_optedout"
	},

	FLAGS: {
		none:       0,  // a user didn't make any input yet
		submitted:   1,  // a user has given the answer
		closed:     2,  // a user has closed the survey dialog without givin the answer
		optedout:   3   // a user has clicked "Hide forever"
	},

	global_calm_period:   3 * wot.DT.DAY, // Time in seconds after asking a question before we can ask next question
	calm_period_notified: false,    // to avoid multiple GA events during visits of websites: global calm period
	site_max_reask_tries: 3, // how many times we could ask about 1 website
	site_calm_period:     10 * wot.DT.DAY, // delay between asking for the particular website
	site_calm_period_notified: false,    // to avoid multiple GA events during visits of websites: calm period for the particular website

	newuser_period:     2 * wot.DT.WEEK,    // don't ask a user during this period after installation
	newuser_period_notified: false,         // to avoid sending many events of this type

	always_ask:         ['fb.mywot.com'],
	always_ask_passwd:  "#surveymewot", // this string must be present to show survey by force
	reset_passwd:       "#wotresetsurveysettings", // this string must be present to reset timers and optout
	optedout:           null,
	optedout_notified:  false,
	last_time_asked:    null,
	asked:              {}, // the list of asked questions per domain. Is kept in preferences
	session_delay:      null,  // the delay before show FBP
	delays_choice:      [0, 2, 5, 8, 10, 15, 20, 25, 30, 45, 60, 90, 120], // in seconds
	delays:             {}, // temporary storage of assigned delays

	init: function() {
		wot.log("wot.surveys.init()");
		if (!wot.enable_surveys) return;    // check global enabler flag

		this.optedout = this.is_optedout();
		if (this.optedout && !this.is_super_fbl()) return; // do nothing if user has opted out of survey's feature

		this.last_time_asked = wot.prefs.get(wot.surveys.PREFNAMES.lasttime);
		this.load_asked();
	},

	bind_events: function () {
		if (!wot.enable_surveys) return;    // check global enabler flag

		wot.bind("message:surveyswidget:shown", wot.surveys.on_show);
		wot.bind("message:surveyswidget:optout", wot.surveys.on_optout);
		wot.bind("message:surveyswidget:close", wot.surveys.on_close);
		wot.bind("message:surveyswidget:submit", wot.surveys.on_submit);
		wot.bind("message:surveyswidget:logo", wot.surveys.on_logo);
	},

	update: function (tab, data) {
		try {

			if (!(tab && tab.url && data)) return;

			var _this = wot.surveys,
				target = data.target,
				cached = data.cached,
				question = (cached && cached.value && cached.value.question) ? cached.value.question : {};

			// test for magic "reset" URL and clear state if magic URL is found
			if (_this.always_ask.indexOf(target) >= 0 && tab.url && tab.url.indexOf(_this.reset_passwd) >= 0) {
				_this.reset_settings();
				return;
			}

			if (_this.session_delay === null) _this.set_delay();    // initialize delay

			var is_tts = _this.is_tts(target, cached, tab.url, question);

			if (is_tts) {

				// Now check whether delay is fulfilled
				if (_this.is_delay_fulfilled(target)) {
//					console.warn("Delay is fulfilled", target, _this.session_delay, _this.delays[target]);

					var cached_rep = {};
					wot.components.forEach(function(i) {
						var app = i.name;
						if (cached.value[app]) {
							cached_rep[app] = $.extend(true, {}, cached.value[app]);
						}
					});

					var senddata = {
						target: target,
						decodedtarget: data.decodedtarget,
						question: question,
						stats: null,
						reputation: cached_rep,
						session_delay: _this.session_delay
					};
					senddata.stats = _this.count_stats();
					wot.surveys.send_show(tab, senddata);
				} else {
//					console.warn("Delay is not fulfilled", target, _this.session_delay, _this.delays[target]);
					// try again after delay
					var copy_data = $.extend(true, {}, data);
					window.setTimeout(function () {
						_this.update(tab, copy_data);
					}, _this.session_delay * 1000);
				}
			}
		} catch (e) {
			console.error("wot.surveys.update() failed in BG.", e);
		}
	},

	is_delay_fulfilled: function (target) {
		try {
			var _this = wot.surveys;

			if (!_this.delays[target]) {
				_this.delays[target] = Date.now() + _this.session_delay * 1000;
				return false;
			}

			return _this.delays[target] <= Date.now();  // true if it is time to show

		} catch (e) {
			console.error(e);
		}
	},

	set_delay: function () {
		// FBP delay is set per browsing sesion (i.e. it is new for every new browser start)
		try {
			var _this = wot.surveys;

			var p = Math.floor((Math.random() * _this.delays_choice.length)); // take random delay and use during whole session
			_this.session_delay = _this.delays_choice[p];    // in seconds
			if (wot.ga && !wot.ga.disable) {
				wot.ga.set_fbp_delay(_this.session_delay);  // set custom variable to separate events per delay
			}
		} catch (e) {
			console.error(e);
		}
	},

	is_rated: function (target, app) {
		// returns user's testimony for trustworthiness
		app = app || 0;
		var cached = wot.cache.get(target);
		return cached && cached.value && cached.value[app] && cached.value[app].t >= 0;
	},

	is_tts: function (target, cache, url, question) {
		var _this = wot.surveys,
			result = true,
			global_calm = false;

		try {

			if(!(question && question.type == "submit")) {
				// no question was given for the current website - do nothing
				return false;
			}

            if (_this.is_super_fbl()) return true; // forced to enable FBL if "super" is on and a question is available

			// Check if the target is already rated by the user
			if (_this.is_rated(target, 0)) {
				return false;
			}

			// on special domains we should always show the survey if there is a special password given (for testing purposes)
			// e.g. try this url http://api.mywot.com/test.html#surveymewot
			if (_this.always_ask.indexOf(target) >= 0 && url) {
				// don't show the form on magic host without the magic password
				return url.indexOf(_this.always_ask_passwd) >= 0;
			}

			if (_this.optedout || !wot.enable_surveys) {
				// send a GA signal about missed survey because of OptedOut
				if (!_this.optedout_notified) {
					wot.ga.fire_event(wot.ga.categories.FBL, wot.ga.actions.FBL_opportunity, "optedout");
					_this.optedout_notified = true;
				}
				return false;
			}

			if (wot.time_sincefirstrun() < _this.newuser_period) {
				if (!_this.newuser_period_notified) {
					wot.ga.fire_event(wot.ga.categories.FBL, wot.ga.actions.FBL_opportunity, "newuser");
					_this.newuser_period_notified = true;
				}
				return false;
			}

			// check if have asked the user more than X days ago or never before
			if (_this.last_time_asked && wot.time_since(_this.last_time_asked) < _this.global_calm_period) {
				result = false;
				global_calm = true;
			}

			// check whether we already have asked the user about current website
			if (_this.asked[target] && _this.asked[target][question.type]) {
				// here we could test also if user just closed the survey last time without providing any info
				// (in case if we want to be more annoying)
				var asked_data = _this.asked[target][question.type];
				var asked_time = wot.time_since(asked_data.time),
					status = asked_data.status,
					count = asked_data.count;

				if (status !== _this.FLAGS.submitted && 	count < _this.site_max_reask_tries &&
					asked_time > _this.site_calm_period) {

					result = result && true;    // redundant line

				} else {
					// send GA event "FBL_opportunity:site_calm_period" only if global_calm_period doesn't matter
					if (!_this.site_calm_period_notified && !global_calm) {
						wot.ga.fire_event(wot.ga.categories.FBL, wot.ga.actions.FBL_opportunity, "site_calm_period");
						_this.site_calm_period_notified = true;
					}
					result = false;
				}

				if (status === _this.FLAGS.submitted) {
					global_calm = false;    // mute sending GA event about global_calm_period if the user provided the feedback
				}
			}

			if (global_calm) {
				// send a GA signal about missed survey because of calm_time
				if (!_this.calm_period_notified) {
					wot.ga.fire_event(wot.ga.categories.FBL, wot.ga.actions.FBL_opportunity, "global_calm_period");
					_this.calm_period_notified = true;
				}
			}

			return result;

		} catch (e) {
			console.error("Survey's is_tts() failed", e);
			return false;
		}
	},

	count_stats: function () {
		var _this = wot.surveys,
			arr = _this.asked,
			impressions = 0,
			submissions = 0;

		try {
			for(var h in arr) {
				if (h && arr[h]) {
					var questions = arr[h];
					for(var q_id in questions) {
						if (q_id !== undefined && questions[q_id]) {
							var q_stat = questions[q_id];
							if (q_stat) {
								var count = q_stat.count,
									status = q_stat.status;

								impressions = impressions + count;

								if (status === _this.FLAGS.submitted) {
									++submissions;
								}
							}
						}
					}
				}
			}
		} catch (e) {
			console.error(e);
		}


		return {
			impressions: impressions,
			submissions: submissions
		}

	},

	connect_and_send: function (tab, message, data) {
		var port = chrome.tabs.connect(tab.id, { name: "surveys" });
		if (port) {
			var msg = { message: message };

			if (data) {
				$.extend(msg, data);    // add properties from data
			}

			port.postMessage(msg);
			return port;
		}
		return null;
	},

	send_show: function (tab, senddata) {
		wot.surveys.connect_and_send(tab, "surveys:show", { question: senddata });
	},

	send_close: function (tab) {
		wot.surveys.connect_and_send(tab, "surveys:close");
	},

	on_show: function (port, data) {
		var _this = wot.surveys;
		// remember that we asked about the domain
		_this.save_asked_status(data, _this.FLAGS.none);
	},

	on_close: function (port, data) {
		var _this = wot.surveys;

		_this.save_asked_status(data, _this.FLAGS.closed);
		// send signal back to the content script
		_this.send_close(port.port.sender.tab);
	},

	on_submit: function (port, data) {
		var _this = wot.surveys;
		_this.save_asked_status(data, _this.FLAGS.submitted);
		_this.report(data.target, data.question_type, data.testimony0);

		// wait for a moment to show there final screen (thank you!)
		window.setTimeout(function(){
			_this.send_close(port.port.sender.tab);
		}, 1500);
	},

	on_logo: function (port, data) {
		var url = wot.contextedurl(wot.urls.base, wot.urls.contexts.fbl_logo);
		chrome.tabs.create({ url: url });
	},

	load_asked: function () {
		wot.surveys.asked = wot.prefs.get(wot.surveys.PREFNAMES.asked) || {};
	},

	remember_asked: function(target, question_type, status) {
		var _this = wot.surveys;

		try {

			status = status === undefined ? _this.FLAGS.none : status;

			var count = 0;

			if (_this.asked[target]) {
				if (_this.asked[target][question_type]) {
					count = _this.asked[target][question_type]['count'] || 0;
				}
			} else {
				_this.asked[target] = {};
			}

			var asked_data = {
				time: new Date(),   // time of first show the survey
				status: status,
				count: count + ((status === _this.FLAGS.none) ? 1 : 0)  //count only "shown" events
			};

			_this.asked[target][question_type] = asked_data;    // keep in runtime variable

		} catch (e) {
			console.error("remember_asked() failed with", e);
		}
	},

	save_asked_status: function (data, status) {
		var _this = wot.surveys;
		try {
			if (data && data.target && data.question_type) {
				_this.remember_asked(data.target, data.question_type, status);

				wot.prefs.set(_this.PREFNAMES.asked, _this.asked);
				_this.last_time_asked = new Date();
				wot.prefs.set(_this.PREFNAMES.lasttime, _this.last_time_asked);
			}
		} catch (e) {
			console.error(e);
		}
	},

	is_optedout: function () {
		var _this = wot.surveys;
		// if the variable isn't initialized yet - read the setting from preferences (DB)
		return (_this.optedout === null) ? !!wot.prefs.get(_this.PREFNAMES.optedout) : _this.optedout;
	},

	optout: function (flag) {
		var _this = wot.surveys;
		flag = (flag !== undefined ? flag : true);
		_this.optedout = flag;
		wot.prefs.set(_this.PREFNAMES.optedout, flag);
	},

	on_optout: function (port, data) {
		var _this = wot.surveys;
		_this.optout();
		_this.save_asked_status(data, _this.FLAGS.optedout);
		_this.send_close(port.port.sender.tab);
	},

	report: function (target, question_type, testimony0) {

		if (question_type != "submit") {
			console.warn("Unsupported question type appeared in surveys.report()");
			return;
		}

		var cached = wot.cache.get(target),
			state = {};

		// copy current reputation state from cache to state var
		wot.components.forEach(function(item){
			var app = item.name;
			if (cached.value && cached.value[app]) {
				state[app] = {};
				$.extend(true, state[app], cached.value[app]);
			}
		});

		$.extend(true, state, { "0": { t: testimony0 } });  // override testimonies with data from feedback prompt

		var testimonies_changed = wot.cache.cacheratingstate(target, state, {});

		if (testimonies_changed) {

			// don't show warning screen immediately after rating and set "expire to" flag
			var warned_expire = (new Date()).getTime() + wot.expire_warned_after;
			wot.cache.setflags(target, {warned: true, warned_expire: warned_expire });

			/* submit new ratings */
			var params = {
				testimony_0: testimony0,
				fbp: 1      // Feedback Prompt
			};

			wot.api.submit(target, params);

			// count testimony event
			var testimony_level = wot.getlevel(wot.reputationlevels, testimony0).name;
			wot.ga.fire_event(wot.ga.categories.FBL, wot.ga.actions.FBL_TESTIMONY, String(testimony_level));

			wot.core.update(false);
		}
	},

	reset_settings: function () {
		var _this = wot.surveys;
		_this.optout(false);  // reset opt-out
		_this.asked = {}; // reset the list of websites asked about
		_this.last_time_asked = null; // reset time of last asked event
		wot.prefs.set(_this.PREFNAMES.asked, _this.asked);
		wot.prefs.set(_this.PREFNAMES.lasttime, _this.last_time_asked);
		_this.site_calm_period_notified = false;
		_this.calm_period_notified = false;
		_this.optedout_notified = false;
	},

    is_super_fbl: function () {
        // return "super" status which is only for debug purpose (not for users)
        return wot.prefs.get("super_fbl");
    }

}});
