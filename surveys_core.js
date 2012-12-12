/*
 surveys_core.js
 Copyright © 2012  WOT Services Oy <info@mywot.com>

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
		submited:   1,  // a user has given the answer
		closed:     2,  // a user has closed the survey dialog without givin the answer
		optedout:   3   // a user has clicked "Hide forever"
	},

	// TODO: for public use set calm period to at least 3 days!
	calm_period:        1 * wot.DT.DAY, // Time in seconds after asking a question before we can ask next question
	calm_period_notified: false,    // to avoid multiple GA events during visits of websites
	always_ask:         ['api.mywot.com', 'fb.mywot.com'],
	always_ask_passwd:  "#surveymewot", // this string must be present to show survey by force
	optedout:           null,
	optedout_notified:  false,
	last_time_asked:    null,
	asked:              {}, // the list of asked questions per domain. Is kept in preferences

	init: function() {
		wot.log("wot.surveys.init()");
		if (!wot.enable_surveys) return;    // check global enabler flag

		this.optedout = this.is_optedout();
		if (this.optedout) return;         // do nothing if user has opted out of survey's feature

		this.last_time_asked = wot.prefs.get(wot.surveys.PREFNAMES.lasttime);
		this.load_asked();

		wot.bind("message:surveyswidget:shown", wot.surveys.on_show);
		wot.bind("message:surveyswidget:optout", wot.surveys.on_optout);
		wot.bind("message:surveyswidget:close", wot.surveys.on_close);
		wot.bind("message:surveyswidget:submit", wot.surveys.on_submit);
	},

	update: function (tab, data) {
		try {

			var target = data.target,
				cached = data.cached,
				question = (cached && cached.value && cached.value.question) ? cached.value.question : {};

			var is_tts = wot.surveys.is_tts(target, cached, tab.url, question);

			var senddata = {
				target: target,
				decodedtarget: data.decodedtarget,
				question: question
			};

			if (is_tts) {
				wot.surveys.send_show(tab, senddata);
			}
		} catch (e) {
			console.error("wot.survey.update() failed in BG.", e);
		}
	},

	is_tts: function (target, cache, url, question) {
		var _this = wot.surveys;

		try {

			if(!(question && question.id !== undefined && question.text && question.choices)) {
				// no question was given for the current website - do nothing
				return false;
			}

			// on special domains we should always show the survey if there is a special password given (for testing purposes)
			// e.g. try this url http://api.mywot.com/test.html#surveymewot
			if (_this.always_ask.indexOf(target) >= 0 && url && url.indexOf(_this.always_ask_passwd) >= 0) {
				return true;
			}

			if (_this.optedout || !wot.enable_surveys) {
				// send a GA signal about missed survey because of OptedOut
				if (!_this.optedout_notified) {
					wot.ga.fire_event(wot.ga.categories.FBL, wot.ga.actions.FBL_opportunity, "optedout");
					_this.optedout_notified = true;
				}
				return false;
			}

			// check if have asked the user more than X days ago or never before
			if (_this.last_time_asked && wot.time_since(_this.last_time_asked) < _this.calm_period) {
				// send a GA signal about missed survey because of calm_time
				if (!_this.calm_period_notified) {
					wot.ga.fire_event(wot.ga.categories.FBL, wot.ga.actions.FBL_opportunity, "calm_period");
					_this.calm_period_notified = true;
				}
				return false;
			}

			// check whether we already have asked the user about current website
			if (_this.asked[target]) {
				// here we could test also if user just closed the survey last time without providing any info
				// (in case if we want to be more annoying)
				return false;
			}

		return true;

		} catch (e) {
			console.error("Survey's is_tts() failed", e);
			return false;
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

	send_show: function (tab, question) {
		wot.surveys.connect_and_send(tab, "surveys:show", { question: question });
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
		_this.save_asked_status(data, _this.FLAGS.submited);
		_this.report(data.url, data.question, data.answer);

		// wait for a moment to show there final screen (thank you!)
		window.setTimeout(function(){
			_this.send_close(port.port.sender.tab);
		}, 1500);
	},

	load_asked: function () {
		wot.surveys.asked = wot.prefs.get(wot.surveys.PREFNAMES.asked) || {};
	},

	remember_asked: function(target, status) {
		var _this = wot.surveys;

		try {

			status = status === undefined ? _this.FLAGS.none : status;

			var asked_data = {
				time: new Date(),   // time of first show the survey
				status: status
			};

			if (_this.asked[target]) {
				asked_data = _this.asked[target];
				asked_data.status = status;    // just update the status
			}

			_this.asked[target] = asked_data;    // keep in runtime variable

		} catch (e) {
			console.error("remember_asked() failed with", e);
		}
	},

	save_asked_status: function (data, status) {
		var _this = wot.surveys;
		try {
			if (data && data.target) {
				_this.remember_asked(data.target, status);

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

	optout: function () {
		var _this = wot.surveys;
		_this.optedout = true;
		wot.prefs.set(_this.PREFNAMES.optedout, true);
	},

	on_optout: function (port, data) {
		var _this = wot.surveys;
		_this.optout();
		_this.save_asked_status(data, _this.FLAGS.optedout);
		_this.send_close(port.port.sender.tab);
	},

	report: function (url, question_id, answer) {
		// this func reports to wot server about the option user has chosen: answer id, or optout or close action
		wot.api.feedback(question_id, answer, url);
	}

}});
