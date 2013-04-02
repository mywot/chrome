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

	question: {},
	target: "",
	decodedtarget: "",
	url: "",
	answer_value: null,
	current_idx: 0,
	submit_enabled: false,

	report: function (msg, data) {
		var _this = surveys;
		if (typeof(data) === "object") {
			data.question_id = _this.question.id;
			data.url = _this.url;
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

	slider: {

		options_map: {},
		options: [],
		max_tick_width: 45,
		$slider: null,

		prepare_values: function (options) {
			// makes an array of values for the slider and map them to original options

			var _this = surveys.slider,
				cnt = 1;

			_this.options = [0]; // add default value
			_this.options_map[0] = {value: null, text: " "};

			for(var i in options) {
				_this.options.push(cnt);
				_this.options_map[cnt] = options[i];
				cnt++;
			}

			return _this.options;
		},

		get_label_by_index: function(index) {
			var _this = surveys.slider,
				map = _this.options_map;

			return (map[index] && map[index]['text'] !== undefined) ? map[index]['text'] : "";
		},

		get_value_by_index: function(index) {
			var _this = surveys.slider,
				map = _this.options_map;

			return (map[index] && map[index]['value'] !== undefined) ? map[index]['value'] : "";
		},


		set_value_label: function (label, is_permanent) {
			var $label = $(".surveys-slider-label");
			$label.toggleClass("selected", is_permanent);
			$label.toggleClass("isset", (label.trim().length > 0)); // don't show decoration if no text is in the label
			$label.text(label);
		},

		update_slider_state: function (idx) {
			var _this = surveys.slider,
				label = _this.get_label_by_index(idx),
				value = _this.get_value_by_index(idx);

			surveys.current_idx = idx;
			surveys.answer_value = value;
			_this.set_value_label(label, true);

			// modify appearance of the handle in "zero" position
			$(".zero-tick").toggleClass("selected", (idx == 0));

			$(".slider-tick").removeClass("selected");

			if (idx > 0) {
				$(".slider-tick:nth-child(" + (idx+1) + ")").addClass("selected");
			}

			surveys.submit_enabled = !!idx;
			surveys.ui.update_submit_status();
		},

		on_slider_change: function (event, ui) {
			var _this = surveys.slider;
			_this.update_slider_state(ui.value);
		},

		on_slide: function(event, ui) {
			var _this = surveys.slider;
			_this.update_slider_state(ui.value);
		},

		on_slide_stop: function(event, ui) {
			var _this = surveys;
			wot.ga.fire_event(wot.ga.categories.FBL, wot.ga.actions.FBL_slidered, _this.target);
		},

		update_hover_status: function(idx, is_hovered) {
			var _this = surveys.slider,
				value_to_show = is_hovered ? idx : surveys.current_idx,
				label = _this.get_label_by_index(value_to_show);

			_this.set_value_label(label, !is_hovered);

			if (idx > 0) {
				$(".slider-tick:nth-child(" + (idx+1) + ")").toggleClass("hovered", is_hovered);
			} else {
				$(".zero-tick").toggleClass("hovered", is_hovered);
			}
		},

		get_idx: function (element) {
			return $(element).index();
		},

		on_enter: function (event) {
			var _this = surveys.slider;
			_this.update_hover_status(_this.get_idx(event.currentTarget), true);
		},

		on_leave: function (event) {
			var _this = surveys.slider;
			_this.update_hover_status(_this.get_idx(event.currentTarget), false);
		},

		on_click: function (event) {
			var _this = surveys.slider;
			_this.$slider.slider("value", _this.get_idx(event.currentTarget));
			wot.ga.fire_event(wot.ga.categories.FBL, wot.ga.actions.FBL_directclick, surveys.target);
		},

		build_slider: function() {
			var _this =             surveys.slider,
				$slider =           _this.$slider,
				items_count =       _this.options.length,
				tick_ws,
				$tick_container =   $(".ticks-container");

			var tick_width = Math.round(($slider.width() - items_count) / (items_count - 1));   // take into account border width also

			tick_ws = String(tick_width) + "px";

			// create ticks only if there are more than 3 options. 2 options are represented by edge-values of the slider
			// and one additional option is a default value ("undefined")
			if (items_count > 1) {
				for(var i=0; i < items_count - 1; i++) {
					$tick_container.append("<div class='slider-tick'/>");
				}
			}

			var $ticks = $(".slider-tick"),
				$zerotick = $(".zero-tick");

			// add ticks to the slider's scale, and make other facelift to imitate a slider with "undefined default value"
			$ticks.css("width", tick_ws);
			var parent_offset = $(".surveys-slider").offset();
			var ticks_offset = $slider.offset().left - parent_offset.left,
				tick_cont_left = ticks_offset - tick_width/2;
			$tick_container.css("left", tick_cont_left + "px");
			$zerotick.css("width", tick_width);

			_this.update_slider_state(0);

			// put bounds' labels
			$(".surveys-slider-bounds").css({
				left: tick_cont_left + tick_width + "px",
				width: $tick_container.width() - tick_width
			});
			$(".surveys-slider-left-bound").text(_this.get_label_by_index(1));//.css("left", tick_ws);
			$(".surveys-slider-right-bound").text(_this.get_label_by_index(items_count - 1));

			// handle hovering over ticks
			$ticks.mouseenter(_this.on_enter).mouseleave(_this.on_leave);
			$zerotick.mouseenter(_this.on_enter).mouseleave(_this.on_leave);

			// handle clicks to ticks
			$ticks.click(_this.on_click);
			$zerotick.click(_this.on_click);

		},

		init_slider: function () {
			var _this = surveys.slider,
				items_count = _this.options.length;

			_this.$slider = $("#slider");   // bind Slider control to div
			_this.$slider.slider({
				min: 0,
				max: items_count - 1,
				step: 1,
				animate: "fast",
				change: _this.on_slider_change,
				slide: _this.on_slide,
				stop: _this.on_slide_stop,
				create: surveys.slider.build_slider // build the rest after slider is created
			});
		}
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
			var _this = surveys;
			if (_this.answer_value !== null) {

				_this.report("submit", { answer: _this.answer_value });

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
			var text = wot.utils.htmlescape(_this.question.text).replace(/%site%/,
				"<span class='domainname'>" + visible_host + "</span>");

            if (text.length > 100) {
                $question.addClass("long");
            }

            $question.html(text);  // should be safe since we sanitized the question

            if (_this.question.dismiss_text) {
                $(".action-dismiss").text(_this.question.dismiss_text);
            }
            $(".surveys-action").toggleClass("hidden", !_this.question.dismiss_text);
		},

		update_submit_status: function () {
			var $submit = $(".surveys-submit");

			$submit.toggleClass("enabled", surveys.submit_enabled);
		}

	},

	init: function () {
		var _this = surveys;
		var data = _this.extract_data(window.name); // we use name property to transfer data from addon's background
		if (data) {
			_this.decodedtarget = data.decodedtarget || "";
			_this.target = data.target || "";
			_this.question = data.question ? data.question : {};
			_this.url = data.url;
			_this.stats.cache = data.stats || {};

			_this.ui.localize();
			_this.ui.update_texts();
			_this.slider.prepare_values(_this.question.choices);

			_this.slider.init_slider();
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
	}
};

$(document).ready(function () {
	surveys.init();
});
