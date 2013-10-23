/*
 surveys.widgets.js
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

var surveys = {

	target: "",
	decodedtarget: "",
	question: {},
	state: {},
	current: {},
	reputation: {}, // reputation data including user testimonies
	sliderwidth: 154,
	slider_shift: -4,       // ajustment
	url: "",
	answer_value: null,
	current_idx: 0,
	submit_enabled: false,

	update_submit_button: function () {

		var _this = surveys,
			$submit = $(".surveys-submit");

		_this.submit_enabled = _this.get_opinion(0) >= 0;
		$submit.toggleClass("enabled", _this.submit_enabled);
	},

	report: function (msg, data) {
		var _this = surveys;
		if (typeof(data) === "object") {
			data.question_type = _this.question.type;
			data.target = _this.target;
		}

		wot.post("surveyswidget", msg, data);
	},

	extract_data: function(encoded) {
		var res = null;
		try {
			if(!encoded) return null;
			var decoded = atob(encoded);
			if(!decoded) return null;

			res = JSON.parse(decoded);
			if(!(res && res.question)) return null;

		} catch (e) {
			console.error("Exception when extracting data in surveys.extract_data()", e);
		}
		return res;
	},

	get_opinion: function (app) {
		// returns user's testimony for trustworthiness
		app = app || 0;

		return surveys.state &&
			surveys.state[app] &&
			surveys.state[app].t >= 0 ? surveys.state[app].t : -1;
	},

	stats: {
		cache: {},

		get_impressions: function () {
			var _t = surveys.stats;
			return String((_t.cache ? _t.cache.impressions + 1 : 0) || 0);
		},

		get_submissions: function () {
			var _t = surveys.stats;
			return String((_t.cache ? _t.cache.submissions : 0) || 0);
		}
	},

	getcached: function()
	{
		var _rw = surveys;
		if (_rw.current.target && _rw.current.cached &&
			_rw.current.cached.status == wot.cachestatus.ok) {
			return _rw.current.cached;
		}
		return { value: {} };
	},

	getrating: function(e, stack)
	{
		var _this = surveys;
			noopinion_threshold = 102;
		try {
			if (_this.reputation) {
				var slider = $(".wot-rating-slider", stack);

				/* rating from slider position */
				var position = 100 * (_this.slider_shift + e.clientX - slider.offset().left) /
					_this.sliderwidth;

				if (e.type == "mouseleave") position = noopinion_threshold + 1;

				/* sanitize the rating value */
				if (position < 0) {
					position = 0;
				} else if (position >= 100 && position <= noopinion_threshold) {
					position = 100;
				} else if (position > noopinion_threshold) {
					position = -1;
				} else {
					position = position.toFixed();
				}

				return position;
			}
		} catch (e) {
			console.error("ratingwindow.getrating: failed with ", e);
		}

		return -1;
	},

	updatestate: function(target, data)
	{
		var state = {
			target: target
		};

		/* add existing ratings to state */
		if (data) {
			wot.components.forEach(function(item) {

				var datav = data[item.name];

				if (datav && datav.t >= 0) {
					state[item.name] = { t: datav.t };
				} else {
					state[item.name] = { t: -1 };
				}
			});
		}

		/* remember previous state */
		this.state = $.extend(state, this.state);
	},

	setstate: function (component, t) {
		// This only changes the user's testimonies' state
		var new_value = { name: component };
		new_value.t = t >= 0 ? parseInt(t) : -1;
		this.state[component] = new_value;
	},

	delete_testimony: function(component) {
		var _rw = surveys;
		_rw.setstate(component, -1);
		_rw.state.down = -1;
		_rw.rate_control.updateratings({ name: component, t: -1 });
	},

	ui: {

		is_optout_shown: false,
		is_whatisthis_shown: false,

		// localization map
		l18n_map: {
			".surveys-submit": wot.i18n("fbl", "submit"),
			".surveys-optout > .pseudo-link": wot.i18n("fbl", "hideforever"),
			".surveys-whatsthis > .pseudo-link": wot.i18n("fbl", "whatisthis"),
			".text-optout-confirm": wot.i18n("fbl", "optout_text"),
			".optout-buttons > .button-yes": wot.i18n("fbl", "optout_yes"),
			".optout-buttons > .button-no": wot.i18n("fbl", "optout_no"),
			"#btab-whatsthis": wot.i18n("fbl", "whatisthis_text"),
			".thank-you-text": wot.i18n("fbl", "final")
		},

		localize: function () {
			// replaces strings in UI elements by localized ones
			var _this = surveys.ui;

			for (var sel in _this.l18n_map) {
				if (sel && _this.l18n_map[sel]) {
					$(sel).html(_this.l18n_map[sel]); // isn't potentially unsafe method?
				}
			}
		},

		show_bottom_section: function () {
			$(".bottom-section").show();
		},

		hide_bottom_section: function () {
			var _this = surveys.ui;
			$(".bottom-section").hide();
			_this.is_optout_shown = false;
			_this.is_whatisthis_shown = false;
		},

		hide_optout: function () {
			surveys.ui.is_optout_shown = false;
			$("#btab-optout").hide();
		},

		switch_tab: function (tab_name) {

			$(".tabs").hide();
			$("#tab-"+tab_name).show();
		},

		on_logo: function (e) {
			wot.ga.fire_event(wot.ga.categories.FBL, wot.ga.actions.FBL_logo);
			surveys.report("logo", {});
		},

		on_close: function (e) {
			var _this = surveys;
			wot.ga.fire_event(wot.ga.categories.FBL, wot.ga.actions.FBL_closed, _this.stats.get_impressions());
            _this.report("close", {});
		},

		on_optout: function (e) {
			var _this = surveys.ui,
				$tab = $("#btab-optout");

			$("#btab-whatsthis").hide(); // explicitly hide another bottom tabs
			_this.is_whatisthis_shown = false;

			if(_this.is_optout_shown) {
				_this.hide_bottom_section();
				_this.hide_optout();

			} else {

				surveys.ui.show_bottom_section();
				$tab.show();

				$(".button-yes", $tab).click(function () {
					wot.ga.fire_event(wot.ga.categories.FBL, wot.ga.actions.FBL_optout_yes, surveys.stats.get_impressions());
					wot.ga.fire_event(wot.ga.categories.FBL, wot.ga.actions.FBL_optout_yes_smb, surveys.stats.get_submissions());
					surveys.report("optout", {});
				});

				$(".button-no", $tab).click(function () {
					_this.hide_optout();
					_this.hide_bottom_section();
					wot.ga.fire_event(wot.ga.categories.FBL, wot.ga.actions.FBL_optout_no, surveys.target);
				});

				_this.is_optout_shown = true;
				wot.ga.fire_event(wot.ga.categories.FBL, wot.ga.actions.FBL_optout_shown, surveys.stats.get_impressions());
				wot.ga.fire_event(wot.ga.categories.FBL, wot.ga.actions.FBL_optout_shown_smb, surveys.stats.get_submissions());
			}
		},

		on_whatisthis: function (e) {

			var _this = surveys.ui,
				$btab = $("#btab-whatsthis");

			_this.hide_optout();

			if (_this.is_whatisthis_shown) {
				_this.hide_bottom_section();
				$btab.hide();
			} else {
				_this.show_bottom_section();
				$btab.show();
				_this.is_whatisthis_shown = true;
				wot.ga.fire_event(wot.ga.categories.FBL, wot.ga.actions.FBL_whatisthis, surveys.target);
			}
		},

		on_submit: function (e) {
			var _this = surveys,
				testimony0 = _this.get_opinion(0);

			if (testimony0 >= 0) {

				_this.report("submit", { testimony0: testimony0});

				wot.ga.fire_event(wot.ga.categories.FBL, wot.ga.actions.FBL_submit, _this.target);

				_this.ui.hide_bottom_section();
				_this.ui.switch_tab("final");
			}
		},

        on_dismiss: function (e) {
            var _this = surveys;
            wot.ga.fire_event(wot.ga.categories.FBL, wot.ga.actions.FBL_dismiss, _this.stats.get_impressions());
            surveys.report("close", {});
        },

		update_texts: function () {
			var _this = surveys;

            var $question = $(".surveys-question");

            var visible_host = _this.decodedtarget.length < 35 ? _this.decodedtarget : (wot.i18n("fbl", "this_website") || "this website");

			// sanitize the questions (to avoid XSS with addon) and replace placeholder %site% with target name
			var text = wot.i18n("ratingwindow", "question0").replace(/%site%/,
				"<span class='domainname'>" + visible_host + "</span>");

            if (text.length > 100) {
                $question.addClass("long");
            }

            $question.html(text);  // should be safe since we sanitized the question
		}
	},

	init: function () {
		var _this = surveys;
		var data = _this.extract_data(window.name); // we use name property to transfer data from addon's background
		if (data) {
			_this.decodedtarget = data.decodedtarget || "";
			_this.target = data.target || "";
			_this.reputation = data.reputation || {};
			_this.question = data.question ? data.question : {};
			_this.url = data.url;
			_this.stats.cache = data.stats || {};

			_this.ui.localize();
			_this.ui.update_texts();

			// init rating slider
			_this.updatestate(_this.target, _this.reputation);
			_this.rate_control.init();
			_this.report("shown", {});

			// report after short delay to make sure GA code is inited
			setTimeout(function () {
                wot.ga.set_fbl_question(surveys.question.id);
				wot.ga.fire_event(wot.ga.categories.FBL, wot.ga.actions.FBL_shown, _this.target);
			}, 500);

		} else {
			surveys.report("close", {});
		}

		// setup events' handlers
		$(".surveys-submit").click(_this.ui.on_submit);
		$(".surveys-optout").click(_this.ui.on_optout);
		$(".close-button").click(_this.ui.on_close);
		$(".surveys-whatsthis").click(_this.ui.on_whatisthis);
        $(".action-dismiss").click(_this.ui.on_dismiss);
		$(".wot-logo").click(_this.ui.on_logo);

		$(".close-button-secondary").click(function (event) {
			_this.ui.hide_bottom_section();
			wot.ga.fire_event(wot.ga.categories.FBL, wot.ga.actions.FBL_bottom_close);
		});
	},

	rate_control: {

		init: function() {
			var _this = surveys.rate_control;

			// Rating control events handlers
			$(".wot-rating-stack").bind({
				mousedown: _this.on_mousedown,
				mouseup: _this.on_mouseup,
				mousemove: _this.on_mousemove,
				mouseleave: _this.on_mousemove
			});

			$(".rating-delete-icon, .rating-deletelabel").bind("click", _this.on_remove);

			_this.updateratings({ name: 0, t: -1 });
		},

		on_mousemove: function (e) {
			var _rw = surveys;

//            if (_rw.state.down == -1) return;
			var c = $(this).attr("component");
			var t = _rw.getrating(e, this);

			if (_rw.state.down == c) {
				_rw.setstate(c, t);
			} else {
				_rw.state.down = -1;
			}

			_rw.rate_control.updateratings({ name: c, t: t });
		},

		on_mousedown: function (e) {
			var _rw = surveys;

			var c = $(this).attr("component");
			var t = _rw.getrating(e, this);
			_rw.state.down = c;
			_rw.setstate(c, t);
			_rw.rate_control.updateratings({ name: c, t: t });

			// there is a nasty issue in Chrome & jQuery: when dragging an object, the cursor has "text select" form.
			e.originalEvent.preventDefault(); // http://stackoverflow.com/a/9743380/954197
		},

		on_mouseup: function (e) {
			var _rw = surveys;
			_rw.state.down = -1;  // no component is being rating right now
		},

		on_remove: function (e) {
			var _rw = surveys;

			if ($(this).closest(".rating-delete").hasClass("delete")) {
				var c = parseInt($(this).closest(".wot-rating-data").attr("component"));

				// TODO: show the warning that categories will be deleted also (?)
				_rw.delete_testimony(c);
			}
		},

		updateratings: function(state)
		{
			/* indicator state */
			var _rw = surveys;
			state = state || {};

			/* update each component */
			wot.components.forEach(function(item) {
				if (state.name !== null && state.name != item.name) {
					return;
				}

				var elems = {},
					rep = wot.getlevel(wot.reputationlevels, -1).name,
					t = -1,
					wrs = _rw.state[item.name];

				["stack", "slider", "indicator", "deleteicon", "deletelabel",
					"helptext", "helplink", "data"].forEach(function(elem) {
						elems[elem] = $("#wot-rating-" + item.name + "-" + elem);
					});

				t = (wrs && wrs.t !== null) ? wrs.t : t;

				if (t >= 0) {
					/* rating */
					rep = wot.getlevel(wot.reputationlevels, t).name;
					elems.indicator.css("left", (t * _rw.sliderwidth / 100).toFixed() + "px");
					elems.stack.addClass("testimony").removeClass("hover");
					elems.deletelabel.text(wot.i18n("testimony", "delete"));
					elems.deleteicon.closest(".rating-delete").removeClass("unrated");
					elems.deleteicon.closest(".rating-delete").addClass("delete");

				} else if (state.name != null && state.t >= 0) {
					/* temporary indicator position */
					rep = wot.getlevel(wot.reputationlevels, state.t).name;
//                    elems.indicator.css("left", (state.t * _rw.sliderwidth / 100).toFixed() + "px");
					elems.stack.removeClass("testimony").addClass("hover");

				} else {
					elems.indicator.css("left", "");    // reset the x-position
					elems.stack.removeClass("testimony").removeClass("hover");
					elems.deletelabel.text(wot.i18n("testimony", "unrated"));
					elems.deleteicon.closest(".rating-delete").addClass("unrated");
					elems.deleteicon.closest(".rating-delete").removeClass("delete");
				}

				if (rep) {
					elems.stack.attr("r", rep);
					if (state.down != -1) {
						elems.indicator.attr("r", rep);
						elems.data.attr("r", rep);
					}
				}

				var helptext = wot.get_level_label(item.name, rep, true);

				if (helptext.length) {
					elems.helptext.text(helptext).show();
					elems.helptext.attr("r", rep);
				} else {
					elems.helptext.hide();
				}
			});

			_rw.update_submit_button();
		}
	}
};

$(document).ready(function () {
	surveys.init();
});
