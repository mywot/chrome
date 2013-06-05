/*
	ratingwindow.js
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

$.extend(wot, { ratingwindow: {
	sliderwidth: 194,

	opened_time: null,

	/* rating state */

	state: {},

	updatestate: function(target, data)
	{
		/* initialize on target change */
		if (this.state.target != target) {
			this.finishstate(false);
			this.state = { target: target, down: -1 };
		}

		var state = {};

		/* add existing ratings to state */
		if (data && data.status == wot.cachestatus.ok) {
			wot.components.forEach(function(item) {

				var datav = data.value[item.name];

				if (datav && datav.t >= 0) {
					state[item.name] = { t: datav.t };
				}
			});
		}

		/* remember previous state */
		this.state = $.extend(state, this.state);
	},

	setstate: function(component, t)
	{
		if (t >= 0) {
			this.state[component] = { t: t };
		} else {
			delete(this.state[component]);
		}
	},

	finishstate: function(unload)
	{
		try {
			var bg = chrome.extension.getBackgroundPage();
			var bgwot = bg.wot; // shortage for perfomance and readability

			/* message was shown */

			// on unload finishing, restore previous message or remove current
			if(unload && bgwot.core.usermessage && bgwot.core.usermessage.previous) {
				bgwot.core.usermessage = bgwot.core.usermessage.previous;
			}

			if (bgwot.core.unseenmessage()) {
				bgwot.prefs.set("last_message", bg.wot.core.usermessage.id);
			}

			/* check for rating changes */
			if (bgwot.cache.cacheratingstate(this.state.target,
							this.state)) {

				// don't show warning screen immediately after rating and set "expire to" flag
				var warned_expire = (new Date()).getTime() + wot.expire_warned_after;
				bgwot.cache.setflags(this.state.target, {warned: true, warned_expire: warned_expire });

				/* submit new ratings */
				var params = {};

				wot.components.forEach(function(item) {
					if (wot.ratingwindow.state[item.name]) {
						params["testimony_" + item.name] =
							wot.ratingwindow.state[item.name].t;
					}
				});

				bgwot.api.submit(this.state.target, params);
				// count testimony event
				bgwot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_TESTIMONY);
			}

			/* update all views */
			bgwot.core.update();
		} catch (e) {
			console.log("ratingwindow.finishstate: failed with ", e);
		}
	},

	/* helpers */

	navigate: function(url, context)
	{
		try {
			var contextedurl = wot.contextedurl(url, context);
			chrome.tabs.create({ url: contextedurl });
			this.hide();
		} catch (e) {
			console.log("ratingwindow.navigate: failed with ", e);
		}
	},

	getcached: function()
	{
		if (this.current.target && this.current.cached &&
				this.current.cached.status == wot.cachestatus.ok) {
			return this.current.cached;
		}

		return { value: {} };
	},

	getrating: function(e, stack)
	{
		try {
			if (this.getcached().status == wot.cachestatus.ok) {
				var slider = $(".wot-rating-slider", stack);

				/* rating from slider position */
				var position = 100 * (e.clientX - slider.position().left) /
									wot.ratingwindow.sliderwidth;

				/* sanitize the rating value */
				if (position < 0) {
					position = 0;
				} else if (position > 100) {
					position = 100;
				} else {
					position = position.toFixed();
				}

				return position;
			}
		} catch (e) {
			console.log("ratingwindow.getrating: failed with ", e);
		}

		return -1;
	},

	/* user interface */

	current: {},

	updateratings: function(state)
	{
		/* indicator state */
		state = state || {};

		var cached = this.getcached();

		/* update each component */
		wot.components.forEach(function(item) {
			if (state.name != null && state.name != item.name) {
				return;
			}

			var elems = {};

			[	"stack",
				"slider",
				"indicator",
				"helptext",
				"helplink"
			].forEach(function(elem) {
				elems[elem] = $("#wot-rating-" + item.name + "-" + elem);
			});

			var t = -1,
				wrs = wot.ratingwindow.state[item.name];

			if (wrs && wrs.t != null) {
				t = wrs.t;
			}

			if (t >= 0) {
				/* rating */
				elems.indicator.css("left",
					(t * wot.ratingwindow.sliderwidth /
					 	100).toFixed() + "px");

				elems.stack.addClass("testimony").removeClass("hover");
			} else if (state.name != null && state.t >= 0) {
				/* temporary indicator position */
				elems.indicator.css("left",
					(state.t * wot.ratingwindow.sliderwidth /
					 	100).toFixed() + "px");

				elems.stack.removeClass("testimony").addClass("hover");
			} else {
				elems.stack.removeClass("testimony").removeClass("hover");
			}

			var helptext = "",
				cachedv = cached.value[item.name];

			if (t >= 0) {
				var r = (cachedv && cachedv.r != null) ?
					cachedv.r : -1;

				if (r >= 0 && Math.abs(r - t) > 35) {
					helptext = wot.i18n("ratingwindow", "helptext");
					elems.helplink.text(wot.i18n("ratingwindow", "helplink"))
						.addClass("comment");
				} else {
					helptext = wot.i18n("reputationlevels",
						wot.getlevel(wot.reputationlevels, t).name);
					elems.helplink.text("").removeClass("comment");
				}
			} else {
				elems.helplink.text("").removeClass("comment");
			}

			if (helptext.length) {
				elems.helptext.text(helptext).css("display", "block");
			} else {
				elems.helptext.hide();
			}
		});
	},

	updatecontents: function()
	{
		var bg = chrome.extension.getBackgroundPage();
		var cached = this.getcached();

		/* update current rating state */
		this.updatestate(this.current.target, cached);
        var normalized_target = cached.value.normalized ? cached.value.normalized : this.current.target;

		/* target */
		if (this.current.target && cached.status == wot.cachestatus.ok) {
			$("#wot-title-text").text(
				bg.wot.url.decodehostname(normalized_target));
		} else if (cached.status == wot.cachestatus.busy) {
			$("#wot-title-text").text(wot.i18n("messages", "loading"));
		} else if (cached.status == wot.cachestatus.error) {
			$("#wot-title-text").text(wot.i18n("messages", "failed"));
		} else {
			$("#wot-title-text").text(wot.i18n("messages",
				this.current.status || "notavailable"));
		}

		/* reputations */
		wot.components.forEach(function(item) {

			var cachedv = cached.value[item.name];

			if (bg.wot.prefs.get("show_application_" + item.name)) {
				$("#wot-rating-" + item.name + ", #wot-rating-" + item.name +
					"-border").css("display", "block");
			} else {
				$("#wot-rating-" + item.name + ", #wot-rating-" + item.name +
					"-border").hide();
			}

			$("#wot-rating-" + item.name + "-reputation").attr("reputation",
				(cached.status == wot.cachestatus.ok) ?
					wot.getlevel(wot.reputationlevels,
						(cachedv && cachedv.r != null) ? cachedv.r : -1).name : "");

			$("#wot-rating-" + item.name + "-confidence").attr("confidence",
				(cached.status == wot.cachestatus.ok) ?
					wot.getlevel(wot.confidencelevels,
						(cachedv && cachedv.c != null)? cachedv.c : -1).name : "");
		});

		/* ratings */
		this.updateratings();

		/* message */

		var msg = bg.wot.core.usermessage; // usual case: show a message from WOT server
		var $wot_message = $("#wot-message");
		// if we have something to tell a user
		if (msg.text) {
			var status = msg.type || "";
			$("#wot-message-text")
				.attr("url", msg.url || "")
				.attr("status", status)
				.text(msg.text);

			$wot_message.attr("status", status).attr("msg_id", msg.id).show();
		} else {
			$wot_message.hide();
		}

		/* user content */
		$(".wot-user").hide();

		bg.wot.core.usercontent.forEach(function(item, index) {
			if (item.bar && item.length != null && item.label) {
				$("#wot-user-" + index + "-header").text(item.bar);
				$("#wot-user-" + index + "-bar-text").text(item.label);
				$("#wot-user-" + index + "-bar-image").attr("length",
						item.length).show();
			} else {
				$("#wot-user-" + index + "-header").text("");
				$("#wot-user-" + index + "-bar-text").text("");
				$("#wot-user-" + index + "-bar-image").hide();
			}

			$("#wot-user-" + index + "-text").attr("url", item.url || "");

			if (item.notice) {
				$("#wot-user-" + index + "-notice").text(item.notice).show();
			} else {
				$("#wot-user-" + index + "-notice").hide();
			}

			if (item.text) {
				$("#wot-user-" + index + "-text").text(item.text);
				$("#wot-user-" + index).css("display", "block");
			}
		});

		/* partner */
		$("#wot-partner").attr("partner", wot.partner || "");
	},

	update: function(target, data)
	{
		chrome.windows.getCurrent(function(obj) {
			chrome.tabs.getSelected(obj.id, function(tab) {
				try {
					if (tab.id == target.id) {
						wot.ratingwindow.current = data || {};
						wot.ratingwindow.updatecontents();
					}
				} catch (e) {
					console.log("ratingwindow.update: failed with ", e);
				}
			});
		});
	},

	hide: function()
	{
		window.close();
	},

	count_window_opened: function () {
		// increase amount of times RW was shown (store to preferences)

		wot.log("RW: count_window_opened");

		var bg = chrome.extension.getBackgroundPage();
		var counter = bg.wot.prefs.get(wot.engage_settings.invite_to_rw.pref_name);
		counter = counter + 1;
		bg.wot.prefs.set(wot.engage_settings.invite_to_rw.pref_name, counter);
	},

	reveal_ratingwindow: function (no_animation) {
		var $wtip = $("#wot-welcometip");
		if (no_animation) {
			$wtip.hide();
		} else {
			$wtip.animate({"height": 0, "opacity": 0.2}, {
				duration: 100,
				complete: function(){
					$wtip.hide();
				}
			});
		}
	},

	show_welcome_tip: function (type) {
		// use small delay to allow GA script to initialize itself
		window.setTimeout(function(){

			$("#wot-welcometip").addClass(type).fadeIn();

			// fire the event to GA, providing amount of minutes from installation to opening rating window
			var bg = chrome.extension.getBackgroundPage();
			var timesincefirstrun = Math.round((bg.wot.time_sincefirstrun() + 0.5) / wot.DT.MINUTE);
			wot.ga.fire_event(wot.ga.categories.WT, wot.ga.actions.WT_RW_SHOWN, String(timesincefirstrun));
		}, 500);
	},

	onload: function()
	{
		wot.ratingwindow.opened_time = new Date(); // remember time when RW was opened
		var bg = chrome.extension.getBackgroundPage();
		var first_opening = !bg.wot.prefs.get(wot.engage_settings.invite_to_rw.pref_name);

		/* accessibility */
		$("#wot-header-logo, " +
				"#wot-header-button, " +
				".wot-header-link, " +
				"#wot-title-text, " +
				".wot-rating-reputation, " +
				".wot-rating-slider, " +
				".wot-rating-helplink, " +
				"#wot-scorecard-content, " +
				".wot-scorecard-text, " +
				".wot-user-text, " +
				"#wot-message-text")
			.toggleClass("accessible", bg.wot.prefs.get("accessible"));

		/* texts */
		wot.components.forEach(function(item) {
			$("#wot-rating-" + item.name +
				"-header").text(wot.i18n("components", item.name) + ":");
		});

		[	{	selector: "#wot-header-link-guide",
				text: wot.i18n("ratingwindow", "guide")
			}, {
                selector: "#wot-header-link-forum",
                text: wot.i18n("ratingwindow", "forum")
            }, {
				selector: "#wot-header-link-settings",
				text: wot.i18n("ratingwindow", "settings")
			}, {
				selector: "#wot-title-text",
				text: wot.i18n("messages", "initializing")
			}, {
				selector: "#wot-rating-header-wot",
				text: wot.i18n("ratingwindow", "wotrating")
			}, {
				selector: "#wot-rating-header-my",
				text: wot.i18n("ratingwindow", "myrating")
			}, {
				selector: "#wot-scorecard-visit",
				text: wot.i18n("ratingwindow", "viewscorecard")
			}, {
				selector: "#wot-scorecard-comment",
				text: wot.i18n("ratingwindow", "addcomment")
			}, {
				selector: "#wot-partner-text",
				text: wot.i18n("ratingwindow", "inpartnership")
			}, {
				selector: ".wt-rw-header-text",
				html: wot.i18n("wt", "rw_text_hdr")
			}, {
				selector: ".wt-rw-body",
				html: wot.i18n("wt", "rw_text")
			}, {
				selector: "#wt-rw-btn-ok",
				text: wot.i18n("wt", "rw_ok")
			}
		].forEach(function(item) {
				var $elem = $(item.selector);
				if (item.text) {
					$elem.text(item.text);
				} else if (item.html) {
					$elem.html(item.html);
				}
		});

		if (wot.partner) {
			$("#wot-partner").attr("partner", wot.partner);
		}

		/* user interface event handlers */

		var wurls = wot.urls;

		$("#wot-header-logo").bind("click", function(event) {
			if (event.shiftKey) {
				event.preventDefault();
			}
			else {
				wot.ratingwindow.navigate(wurls.base, wurls.contexts.rwlogo);
			}
		});

		$("#wot-header-logo").bind("dblclick", function(event) {
			if (event.shiftKey) {
				wot.ratingwindow.navigate(chrome.extension.getURL("/settings.html"), wurls.contexts.rwlogo);
			}
		});

		$("#wot-header-link-settings").bind("click", function() {
			wot.ratingwindow.navigate(wurls.settings, wurls.contexts.rwsettings);
		});

		$("#wot-header-link-guide").bind("click", function() {
			wot.ratingwindow.navigate(wurls.settings + "/guide", wurls.contexts.rwguide);
		});

        $("#wot-header-link-forum").bind("click", function() {
            wot.ratingwindow.navigate(wurls.base + "forum", wurls.contexts.rwforum);
        });

		$("#wot-header-button").bind("click", function() {
			bg.wot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_BTN_CLOSE);
			wot.ratingwindow.hide();
		});

		$("#wot-title").bind("click", function() {
			/* TODO: enable the add-on if disabled */
		});

		$(".wot-rating-helplink, #wot-scorecard-comment").bind("click",
			function(event) {
				if (wot.ratingwindow.current.target) {
					var url = wurls.scorecard +
						encodeURIComponent(wot.ratingwindow.current.target) +
						"/comment";

					wot.ratingwindow.navigate(url, wurls.contexts.rwviewsc);
				}
				event.stopPropagation();
			});

		$("#wot-scorecard-comment-container").hover(
			function() {
				$("#wot-scorecard-visit").addClass("inactive");
			},
			function() {
				$("#wot-scorecard-visit").removeClass("inactive");
			});

		$("#wot-scorecard-content").bind("click", function() {
			if (wot.ratingwindow.current.target) {
				wot.ratingwindow.navigate(wot.urls.scorecard +
					encodeURIComponent(wot.ratingwindow.current.target),
						wurls.contexts.rwviewsc);
			}
		});

		$(".wot-user-text").bind("click", function() {
			var url = $(this).attr("url");
			if (url) {
				wot.ratingwindow.navigate(url, wurls.contexts.rwprofile);
			}
		});

		$("#wot-message").bind("click", function() {
			var url = $("#wot-message-text").attr("url");
			if (url) {
				var label = wot.i18n("locale") + "__" + $(this).attr("msg_id");
				bg.wot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_MSG_CLICKED, label);
				wot.ratingwindow.navigate(url, wurls.contexts.rwmsg);
			}
		});

		$(".wot-rating-stack").bind("mousedown", function(e) {
			var c = $(this).attr("component");
			var t = wot.ratingwindow.getrating(e, this);
			wot.ratingwindow.state.down = c;
			wot.ratingwindow.setstate(c, t);
			wot.ratingwindow.updateratings({ name: c, t: t });
		});

		$(".wot-rating-stack").bind("mouseup", function(e) {
			wot.ratingwindow.state.down = -1;
		});

		$(".wot-rating-stack").bind("mousemove", function(e) {
			var c = $(this).attr("component");
			var t = wot.ratingwindow.getrating(e, this);

			if (wot.ratingwindow.state.down == c) {
				wot.ratingwindow.setstate(c, t);
			} else {
				wot.ratingwindow.state.down = -1;
			}

			wot.ratingwindow.updateratings({ name: c, t: t });
		});

		$(window).unload(function() {
			/* submit ratings and update views */
			wot.ratingwindow.finishstate(true);
		});

		bg.wot.core.update();

		var wt =     bg.wot.wt,
			locale = bg.wot.i18n("locale");

		// Welcome Tip button "close"
		$(".wt-rw-close").click(function (e){
			wot.ratingwindow.reveal_ratingwindow();
			wot.ratingwindow.count_window_opened();

			wt.settings.rw_ok = true;
			wt.save_setting("rw_ok");

			var time_before_click = Math.round(wot.time_since(wot.ratingwindow.opened_time));
			wot.ga.fire_event(wot.ga.categories.WT, wot.ga.actions.WT_RW_OK, String(time_before_click));
		});

		// Welcome Tip "learn more" link handler
		$("#wt-learnmore-link").click(function (){
			var time_before_click = Math.round(wot.time_since(wot.ratingwindow.opened_time));
			wot.ga.fire_event(wot.ga.categories.WT, wot.ga.actions.WT_RW_LEARN, String(time_before_click));
			bg.wot.core.open_mywot(wot.urls.tour_rw, wot.urls.contexts.wt_rw_lm);
		});

		var is_rtip_neutral = false; // default style for welcome tip = sticker

		var tts_wtip = (locale === "ru" || locale === "en") &&
						first_opening &&
						!(wt.settings.rw_ok || wt.settings.rw_shown > 0) &&
						wot.is_defined(["rw_text", "rw_text_hdr", "rw_ok"], "wt");

		tts_wtip = tts_wtip && (wot.get_activity_score() < bg.wot.wt.activity_score_max);

		if (tts_wtip && bg.wot.exp) {
			// important to run experiment only no Tips were shown before
			tts_wtip = bg.wot.exp.is_running("wtip-on");
		}

        if (bg.wot.prefs.get("super_wtips")) tts_wtip = true;  // override by super-setting

		if (tts_wtip) {

			var tip_type = "rtip-sticker"; // default style

			// Decide what to show: normal rating window or welcome tip?
			if (bg.wot.exp) {
				is_rtip_neutral = bg.wot.exp.is_running("rtip-neu");
				tip_type = is_rtip_neutral ? "rtip-neutral" : "rtip-sticker"; // reference to CSS style
			}

			// RW is opened first time - show welcome tip
			wot.ratingwindow.show_welcome_tip(tip_type);

			// set all welcome tip's preferences (== wt was shown)
			wt.settings.rw_shown = wt.settings.rw_shown + 1;
			wt.settings.rw_shown_dt = new Date();
			wt.save_setting("rw_shown");
			wt.save_setting("rw_shown_dt");
		}

		// increment "RatingWindow shown" counter
		wot.ratingwindow.count_window_opened();

		// shown RatingWindow means that we shown a message => remove notice badge from the button
		if(bg.wot.core.badge_status && bg.wot.core.badge_status.type == wot.badge_types.notice.type) {
			bg.wot.core.set_badge(false);   // hide badge
		}
	}
}});

$(document).ready(function() {
	wot.ratingwindow.onload();
});
