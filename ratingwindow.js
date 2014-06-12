/*
 ratingwindow.js
 Copyright © 2009 - 2014  WOT Services Oy <info@mywot.com>

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
    MAX_VOTED_VISIBLE: 4,   // how many voted categories we can show in one line
	sliderwidth: 154,
    slider_shift: -4,       // adjustment
    opened_time: null,
    was_in_ratemode: false,
    timer_save_button: null,
    state: {},  // rating state
    local_comment: null,
    is_registered: false,   // whether user has an account on mywot.com
    delete_action: false,   // remembers whether user is deleting rating
    prefs: {},              // shortcut for background preferences
	current: {},

	is_wg_allowed: false,
	tags: [],               // WG tags for the current website
	wg_viewer_timer: null,
	wg_infotag_timer: null,
	msg_timer: null,

	get_bg: function (sub_objname) {
        // just a shortcut
        var bg = chrome.extension.getBackgroundPage();
		if (sub_objname && bg[sub_objname]) return bg[sub_objname];

		return bg;
    },

    is_rated: function (state) {
        var ratings = wot.ratingwindow.getcached().value,
            is_rated = false;

        state = state ? state : ratings;

        // Detect if the website is rated by user, to activate proper mode
        wot.components.forEach(function (i) {
            var name = i.name;
            if (state[name] && state[name].t >= 0) {
                is_rated = true;
                return false;
            }
        });

        return is_rated;
    },

    updatestate: function(target, data)
    {
        var _this = wot.ratingwindow,
	        was_target_changed = false;
        /* initialize on target change */
        if (_this.state.target != target) {
	        _this.finishstate(false);
	        _this.state = { target: target, down: -1 };
	        _this.comments.set_comment("");  // reset comment field
	        $("#voted-categories-content").empty();
	        $("#rated-votes").removeClass("commented");
	        was_target_changed = true;
        }

        var state = {
            target: target
        };

        /* add existing ratings to state */
        if (data && data.status == wot.cachestatus.ok) {
            wot.components.forEach(function(item) {

                var datav = data.value[item.name];

                if (datav && datav.t >= 0) {
                    state[item.name] = { t: datav.t };
                } else {
                    state[item.name] = { t: -1 };
                }
            });
        }

        /* remember previous state */
	    _this.state = $.extend(state, _this.state);
	    _this.cat_selector.init_voted(data.value.cats); // re-build user votes with new data
	    return was_target_changed;
    },

    setstate: function (component, t) {
        // This only changes the user's testimonies' state
        var new_value = { name: component };
        new_value.t = t >= 0 ? parseInt(t) : -1;
        this.state[component] = new_value;
        this.update_catsel_state();
    },

    delete_testimony: function(component) {
        var _rw = wot.ratingwindow;
        _rw.setstate(component, -1);
        _rw.state.down = -1;
        _rw.rate_control.updateratings({ name: component, t: -1 });
    },

    update_catsel_state: function () {
        // update category selector based on user's testimonies
        var cache = wot.ratingwindow.getcached();
        var identified = (cache.value && cache.value.cats) ? cache.value.cats : [];
        wot.ratingwindow.cat_selector.set_state(this.state, identified);
    },

    cat_difference: function (is_rated) {
        var _rw = wot.ratingwindow;
        var cache = _rw.getcached(),
            cached_cats = (cache.value && cache.value.cats) ? cache.value.cats : {};
        var old_votes = wot.select_voted(cached_cats),      // from the cache. Object.
            new_votes_arr = [],  // user's votes. Array.
            new_votes_obj = {},
            diff = {},  // the difference in votes
            cat = {};

        // If user removed testimonies, we have to remove votes also. Otherwise take votes from the category selector
        if (is_rated) {
            new_votes_arr = _rw.cat_selector.get_user_votes(false); // get votes as array
        }

//        console.log("old", old_votes);
//        console.log("new", new_votes_arr);

        for(var i in new_votes_arr) {
            cat = new_votes_arr[i];
            new_votes_obj[cat.id] = cat.v;
            // if the category voted the same previously, skip it
            if (!(old_votes[cat.id] && old_votes[cat.id].v == cat.v)) {
                diff[cat.id] = cat.v; // the category hasn't been voted previously
            }
        }

        // look for removals of votes
        for(cat in old_votes) {
            if (new_votes_obj[cat] === undefined) {
                // the category has been unvoted in current session
                diff[cat] = 0;
            }
        }

//        console.log("diff", diff);
        return diff;
    },

    _make_votes: function (diff) {
        var votes = [];
        for (var cat in diff) {
            votes.push(String(cat) + ":" + diff[cat]);
        }

//        console.log("votes", votes);

        if (votes.length > 0) {
            return votes.join("/") + "/";
        } else {
            return "";
        }

    },

    has_votes: function () {
        var _rw = wot.ratingwindow,
            votes = _rw.cat_selector.get_user_votes(false);
        return votes.length > 0;
    },

    finishstate: function(unload)
    {
        var rw = wot.ratingwindow,
            bg = rw.get_bg();

        try {
            var bgwot = bg.wot, // shortage for perfomance and readability
                target = "",
                is_rated = false,
                testimonies_changed = false,
                comment_changed = false,
                has_comment = false,
                user_comment = rw.comments.get_comment_value(),
	            mytags = rw.wg.get_tags(user_comment),
	            has_mytags = mytags && mytags.length,
                user_comment_id = 0,
                cached = {},
                changed_votes = {},     // user votes diff as an object
                changed_votes_str = "", // user's votes diff for categories as string
                votes = rw.cat_selector.get_user_votes(true), // user's votes for categories as object {cat_id : vote }
                has_up_votes = rw.has_1upvote(votes),
                votes_changed = false;  // just a flag that votes have been changed

            /* message was shown */

            // on unload finishing, restore previous message or remove current
            if (unload && bgwot.core.usermessage && bgwot.core.usermessage.previous) {
                bgwot.core.usermessage = bgwot.core.usermessage.previous;
            }

            if (rw.current.target) {
                target = rw.current.target;
                cached = rw.getcached();
                is_rated = rw.is_rated(rw.state);
                changed_votes = rw.cat_difference(is_rated);
                votes_changed = !wot.utils.isEmptyObject(changed_votes);

                // Whether ratings OR categories were changed?
                testimonies_changed = (rw.was_in_ratemode && (bgwot.cache.cacheratingstate(target, rw.state, changed_votes) || votes_changed));

                has_comment = (user_comment.length > 0);

                if (cached.comment && cached.comment.comment && cached.comment.comment.length > 0) {
                    user_comment_id = cached.comment.wcid;
                    comment_changed = (cached.comment.comment != user_comment);
                } else {
                    comment_changed = has_comment;  // since there was no comment before
                    user_comment_id = 0;            // no previous comment, set cid to zero
                }
            }

            /* if user's testimonies or categories were changed, store them in the cache and submit */
            if (testimonies_changed) {

                // don't show warning screen immediately after rating and set "expire to" flag
                var warned_expire = (new Date()).getTime() + wot.expire_warned_after;
                bgwot.cache.setflags(target, {warned: true, warned_expire: warned_expire });

                /* submit new ratings */
                var params = {};

                wot.components.forEach(function(item) {
                    if (rw.state[item.name]) {
                        params["testimony_" + item.name] = rw.state[item.name].t;
                    }
                });

                if (votes_changed) {
                    params.votes = rw._make_votes(changed_votes);
                }

                bgwot.api.submit(target, params);

                var submission_mode = unload ? "auto" : "manual";

                // count testimony event
                if (is_rated) {
                    bgwot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_TESTIMONY, submission_mode);
	                bgwot.core.last_testimony = Date.now(); // remember when user rated last time
                } else {
                    bgwot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_TESTIMONY_DEL, submission_mode);
                }

            } else {
//                bg.console.log("No testimonies & votes to submit them. Ignored.");
            }

            if (unload) {  // RW was closed by browser (not by clicking "Save")

                if (comment_changed) {
//                    bg.console.log("The comment seems to be changed");
                    // when comment body is changed, we might want to store it locally
                    bgwot.keeper.save_comment(target, user_comment, user_comment_id, votes, wot.keeper.STATUSES.LOCAL);
                    bgwot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_COMMENTKEPT);
                }

            } else { // User clicked Save
                // TODO: make it so, that if votes were changed and user have seen the comment, then submit the comment
                if (comment_changed && (has_up_votes || has_mytags || !has_comment)) {
                    // Comment should be submitted, if (either comment OR categories votes were changed) AND at least one up vote is given
                    if (has_comment) {

                        // If user can't leave a comment for a reason, accept the comment locally, otherwise submit it silently
                        var keeper_status = (rw.comments.allow_commenting && rw.is_registered) ? wot.keeper.STATUSES.SUBMITTING : wot.keeper.STATUSES.LOCAL;
                        bgwot.keeper.save_comment(target, user_comment, user_comment_id, votes, keeper_status);

                        if (rw.comments.allow_commenting && rw.is_registered) {
                            bgwot.api.comments.submit(target, user_comment, user_comment_id, rw._make_votes(votes));
                            bgwot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_COMMENTADDED);
                        }

                    } else {
                        if (comment_changed) {
                            // remove the comment
                            bgwot.keeper.remove_comment(target);
                            if (rw.is_registered) {
                                bgwot.api.comments.remove(target);
                                bgwot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_COMMENTREMOVED);
                            }
                        }
                    }
                    // update cache in RW object
	                rw.current.cached = bgwot.cache.get(target);
                }
            }

            /* update all views */
            bgwot.core.update(false);   // explicitly told to not update the rating window
        } catch (e) {
            bg.console.log("ratingwindow.finishstate: failed with ", e);
        }
    },

    /* helpers */

    navigate: function(url, context, fragment, keep_opened)
    {
        try {
            fragment = fragment ? "#" + fragment : "";
            var contextedurl = wot.contextedurl(url, context) + fragment;
            chrome.tabs.create({ url: contextedurl, active:!keep_opened },
                function(tab) {
                    if (!keep_opened) wot.ratingwindow.hide();
                }
            );
            if (!keep_opened) wot.ratingwindow.hide();
        } catch (e) {
            console.error("ratingwindow.navigate: failed with ", e);
        }
    },

    getcached: function()
    {
        var _rw = wot.ratingwindow;
        if (_rw.current.target && _rw.current.cached &&
            _rw.current.cached.status == wot.cachestatus.ok) {
            return _rw.current.cached;
        }
        return { value: {} };
    },

    getrating: function(e, stack)
    {
        var noopinion_threshold = 102;
        try {
            if (this.getcached().status == wot.cachestatus.ok) {
                var slider = $(".wot-rating-slider", stack);

                /* rating from slider position */
				var position = 100 * (wot.ratingwindow.slider_shift + e.clientX - slider.offset().left) /
                    wot.ratingwindow.sliderwidth;

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
            console.log("ratingwindow.getrating: failed with ", e);
        }

        return -1;
    },

    /* user interface */

    updatecontents: function()
    {
        var bg = chrome.extension.getBackgroundPage(),
            _this = wot.ratingwindow,
            cached = this.getcached(),
            visible_hostname = "",
            rw_title = "";

        var normalized_target = cached.value.normalized ? cached.value.normalized : this.current.target;

        var $_hostname = $("#hostname-text"),
            $_wot_title_text = $("#wot-title-text");

        /* target */
        if (_this.current.target && cached.status == wot.cachestatus.ok) {
            visible_hostname = normalized_target;
            rw_title = wot.i18n("messages", "ready");
        } else if (cached.status == wot.cachestatus.busy) {
            rw_title = wot.i18n("messages", "loading");
        } else if (cached.status == wot.cachestatus.error) {
            rw_title = wot.i18n("messages", "failed");
        } else {
            rw_title = wot.i18n("messages", this.current.status || "notavailable");
        }

        $_hostname.text(visible_hostname);
        $_wot_title_text.text(rw_title);

        $("#wot-ratingwindow")
	        .toggleClass("unregistered", !_this.is_registered);

        /* reputations */
        /* ratings */

        wot.components.forEach(function(item) {

            var cachedv = cached.value[item.name];
            var rep_level = (cached.status == wot.cachestatus.ok) ?
                wot.getlevel(wot.reputationlevels,
                    (cachedv && cachedv.r != null) ? cachedv.r : -1).name : "r0";

            $("#wot-rating-" + item.name + "-reputation").attr("reputation", rep_level);

            $("#wot-rating-" + item.name + "-confidence").attr("confidence",
                (cached.status == wot.cachestatus.ok) ?
                    wot.getlevel(wot.confidencelevels,
                        (cachedv && cachedv.c != null)? cachedv.c : -1).name : "c0");

            var $_rep_legend = $("#rep-" + item.name + " .rating-legend");
            $_rep_legend.attr("r", rep_level);
            $_rep_legend.text(wot.get_level_label(item.name, rep_level, false));

            var t = (cachedv && cachedv.t >= 0) ? cachedv.t : -1;

            _this.rate_control.updateratings({ name: item.name, t: t }); // update visual ratingbars
        });

        /* message */

        var msg = bg.wot.core.usermessage; // usual case: show a message from WOT server

	    // old style elements
	    var $_wot_message = $("#wot-message"),
		    $_wot_message_text = $("#wot-message-text");

	    // new style elements
	    var $msg_indicator = $("#message-indicator"),
		    $msg_box = $("#floating-message"),
		    $msg_text = $("#floating-message-text");

        // if we have something to tell a user
        if (msg.text) {
            var status = msg.type || "",
	            is_seen = !bg.wot.core.unseenmessage();

	        $_wot_message_text
                .attr("url", msg.url || "")
                .attr("status", status)
                .text(msg.text);

	        $_wot_message.attr("status", status).attr("msg_id", msg.id).show();

	        $msg_text.text(msg.text);

	        $msg_box
		        .attr("url", msg.url || "")
		        .attr("status", status)
		        .attr("msg_id", msg.id);

	        $msg_indicator
		        .toggleClass("unseen", !is_seen)
		        .toggleClass("seen", is_seen)
		        .show();

        } else {
            $_wot_message.hide();
	        // hide the message icon on the top
	        $msg_indicator.hide();
        }

        /* content for user (messages / communications) */
        $(".wot-user").hide();

        // TODO: rewrite below: use activity score stored in Prefs instead.
        var user_header,
            item = (bg.wot.core.usercontent && bg.wot.core.usercontent.length > 0) ? bg.wot.core.usercontent[0] : {},
            user_as = 0,
            $_user_text = $("#wot-user-0-text"),
            as_notice = wot.i18n("activityscore", "next");

        if (item.label && !isNaN(item.label)) {
            user_as = parseInt(item.label); // for better security we use numeric
        }

        // insert next level name
        var level_name = '<span class="user-level">' +
            wot.i18n("activityscore", wot.get_user_level(user_as, true).name) +
            '</span>';

        as_notice = as_notice.replace("{NEXT_LEVEL}", level_name);

	    var as_html = '<span id="user-activityscore">' + user_as + '</span>';
	    user_header = wot.i18n("activityscore","text").replace("{SCORE}", as_html);

        $("#wot-user-0-header").html(user_header);

	    var as_html_thankyou = '<span class="thanks-activityscore-number">' + user_as + '</span>';
	    var thank_your_as = wot.i18n("activityscore","text").replace("{SCORE}", as_html_thankyou);
        $(".thanks-activityscore-text").html(thank_your_as); // on the "Thank you" screen

        $(".thanks-ratemore").html(as_notice || "");     // on the "Thank you" screen

        $_user_text.attr("url", item.url || "");

        if (user_as < wot.AS_LEVELS.PLATINUM) {
            $("#wot-user-0-notice").html(as_notice).show();
        } else {
            $("#wot-user-0-notice").hide();
        }

        if (item.text) {
            $_user_text.text(item.text);
            $("#wot-user-0").css("display", "block");
        }

	    // WOT Groups feature discontinued: commented out the code below
//	    _this.wg.update_wg_visibility();
//	    _this.wg.update_wg_tags();

    },

    insert_categories: function (cat_list, $_target) {
        $_target.hide();   // to prevent blinking during modification
        $("li", $_target).remove(); // clean the list

        for (var i in cat_list) {
            var cdata = cat_list[i];
            var cat_id = cdata.id,
                cat_conf = wot.getlevel(wot.confidencelevels, cdata.c).name,
                cgroup_style = wot.get_category_css(cat_id),
                $_new_cat = $("<li class='cat-item'></li>"),
                cat_text = wot.get_category_name(cat_id, true),
                $_ico = $("<div class='ico'></div>");

            if (cat_text) {
                $_new_cat.text(cat_text);
                $_new_cat.addClass([cgroup_style, cat_conf].join(" "));   // set group style, confidence style
                $_ico.addClass([cgroup_style, cat_conf].join(" "));
                $_new_cat.prepend($_ico);
                $_target.append($_new_cat);
            }
        }
        $_target.show();
    },

    update_categories: function () {
//        console.log("wot.ratingwindow.update_categories()");
        var _rw = wot.ratingwindow,
            cached = _rw.getcached(),
            $_tr_list = $("#tr-categories-list");

        try {
            // delete categories from the visible area
            _rw.insert_categories({}, $_tr_list);

            if (_rw.current.target && cached.status == wot.cachestatus.ok && cached.value) {
                var cats = cached.value.cats;
                if (!wot.utils.isEmptyObject(cats)) {
                    var sorted = wot.rearrange_categories(wot.select_identified(cats));    // sort categories and split into two parts (TR, CS)
                    _rw.insert_categories(sorted.all, $_tr_list);
                }
            }
        } catch (e) {
            console.error("Failed to render categories", e);
        }
    },

    update: function(target, data)
    {
        chrome.windows.getCurrent(function(obj) {
            chrome.tabs.getSelected(obj.id, function(tab) {
                try {
                    var _rw = wot.ratingwindow,
                        bg = _rw.get_bg();

                    if (tab.id == target.id) {

                        /* update current rating state */
                        var target_changed = _rw.updatestate(data.target, data.cached); //_rw.getcached()

                        _rw.current = data || {};
                        _rw.updatecontents();
                        _rw.update_categories();

                        if (_rw.is_registered) {
                            // ask server if there is my comment for the website
	                        if (target_changed) {   // no need to reask comment on every "iframe loaded" event
		                        _rw.comments.get_comment(data.target);
	                        }
                        } else {
                            bg.wot.core.update_ratingwindow_comment(); // don't allow unregistered addons to comment
                        }

                        if (target_changed) {
	                        _rw.modes.reset();
	                        _rw.modes.auto(true);
                        }

                        if (!data.target) {
                            bg.wot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_NOTARGET);
                        }
                    }
                } catch (e) {
                    console.log("ratingwindow.update: failed with ", e);
                }
            });
        });
    },

    update_comment: function (cached, local_comment, captcha_required) {

        var _rw = wot.ratingwindow,
            _comments = wot.ratingwindow.comments,
            comment_data = {},
	        wg = cached.wg || {},
            bg = chrome.extension.getBackgroundPage(),
            is_unsubmitted = false;

        _rw.current.cached = cached;    // update current cached state
        _rw.local_comment = local_comment;  // keep locally stored comment

        if (cached && cached.comment) {
            comment_data = cached.comment;
            _rw.comments.captcha_required = captcha_required || false;
        }

	    // WOT Groups data
	    _rw.is_wg_allowed = wg.wg == true || false;
	    _rw.tags = [];

	    if (wg.tags && wg.tags.length > 0) {
		    _rw.tags = wg.tags;
	    }

        // Errors
	    var error_code = comment_data.error_code || 0;

        _comments.allow_commenting = ([
            wot.comments.error_codes.AUTHENTICATION_FAILED,
            wot.comments.error_codes.COMMENT_NOT_ALLOWED,
            wot.comments.error_codes.IS_BANNED
        ].indexOf(error_code) < 0); // if none of these codes are found

        _comments.is_banned = (error_code == wot.comments.error_codes.IS_BANNED);

        // If there is a locally stored comment, use it if it's newer than server-stored one
        if (local_comment && !wot.utils.isEmptyObject(local_comment)) {

            // If server-side comment is newer, than drop locally stored one
            if (local_comment.timestamp && comment_data.timestamp && comment_data.timestamp >= local_comment.timestamp) {
                // Remove a comment from keeper
                bg.wot.keeper.remove_comment(local_comment.target);
                _rw.local_comment = null;
            } else {
                comment_data.comment = local_comment.comment;
                comment_data.timestamp = local_comment.timestamp;
                comment_data.wcid = comment_data.wcid === undefined ? 0 : comment_data.wcid;
                is_unsubmitted = true;
            }
        }

        // check whether comment exists: "comment" should not be empty, and wcid should not be null (but it can be zero)
        if (comment_data && comment_data.comment && comment_data.wcid !== undefined) {
            _comments.posted_comment = comment_data;
            _comments.set_comment(comment_data.comment);
            $("#rated-votes").addClass("commented");

            // switch to commenting mode if we have unfinished comment
            if (is_unsubmitted) {
                _rw.modes.comment.activate();
            } else {
	            _rw.modes.auto(true);   // force to update the view
            }

        } else {
//            bg.console.log("no comment to show");

            _comments.set_comment("");
            $("#rated-votes").removeClass("commented");
            _comments.posted_comment = {};
        }

        // change appearance of commenting area regarding to permissions
        if (!_rw.is_registered) {
            // show the invitation to create an account
            _rw.comments.show_register_invitation();

        } else {
            if (_rw.comments.captcha_required) {
                _rw.comments.show_captcha_invitation();

            } else if (_rw.comments.is_banned) {
                // this is considered below
            } else {
                // normal mode
                _rw.comments.show_normal_hint();
            }
        }

	    _rw.update_boardmessages(comment_data.newBoardMessages);
	    _rw.wg.update_wg_tags();
	    _rw.wg.update_wg_visibility();
        _comments.update_button(_rw.modes.current_mode, _comments.allow_commenting && !_comments.is_banned);
    },

    hide: function()
    {
        window.close();
    },

	update_boardmessages: function (count) {

		count = count || 0;
		count = $.isNumeric(count) ? count : 0;
//		var _rw = wot.ratingwindow;

		$("#header-boardmsg").
			toggleClass("messages", count != 0)
			.text(count);
	},

    count_window_opened: function () {
        // increase amount of times RW was shown (store to preferences)

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

    show_welcome_tip: function () {
        // use small delay to allow GA script to initialize itself
        window.setTimeout(function(){

            $("#wot-welcometip").fadeIn();

            // fire the event to GA, providing amount of minutes from installation to opening rating window
            var bg = chrome.extension.getBackgroundPage();
            var timesincefirstrun = Math.round((bg.wot.time_sincefirstrun() + 0.5) / wot.DT.MINUTE);
            wot.ga.fire_event(wot.ga.categories.WT, wot.ga.actions.WT_RW_SHOWN, String(timesincefirstrun));
        }, 500);
    },

    localize: function () {
	    var bgwot = wot.ratingwindow.get_bg().wot;

        /* texts */
        wot.components.forEach(function(item) {
            var n = item.name;
            $("#wot-rating-" + n + "-header").text(wot.i18n("components", n));
            $("#wot-myrating-"+ n +"-header").text(wot.i18n("ratingwindow", "question" + n));

            $("#wot-rating-" + n + "-boundleft").text(wot.i18n("testimony", item.name + "_levels_" + wot.getlevel(wot.reputationlevels, 0).name));
            $("#wot-rating-" + n + "-boundright").text(wot.i18n("testimony", item.name + "_levels_" + wot.getlevel(wot.reputationlevels, 100).name));
        });

        [
            { selector: "#myrating-header",         text: wot.i18n("ratingwindow", "myrating") },
            { selector: "#wot-header-link-guide",   text: wot.i18n("ratingwindow", "guide") },
            { selector: "#wot-header-link-forum",   text: wot.i18n("ratingwindow", "forum") },
            { selector: "#wot-header-link-settings",text: wot.i18n("ratingwindow", "settings") },
            { selector: "#header-link-profile-text", text: wot.i18n("ratingwindow", "profile") },
            { selector: "#wot-title-text",          text: wot.i18n("messages", "initializing") },
            { selector: "#wot-rating-header-wot",   text: wot.i18n("ratingwindow", "wotrating") },
            { selector: "#wot-rating-header-my",    text: wot.i18n("ratingwindow", "myrating") },
            { selector: "#wot-scorecard-visit",     text: wot.i18n("ratingwindow", "viewscorecard") },
            { selector: "#wot-scorecard-comment",   text: wot.i18n("ratingwindow", "addcomment") },
            { selector: ".wt-rw-header-text",       html: wot.i18n("wt", "rw_text_hdr") },
            { selector: ".wt-rw-body",              html: wot.i18n("wt", "rw_text") },
            { selector: ".btn-delete_label",        text: wot.i18n("buttons", "delete") },
            { selector: "#btn-delete",              title: wot.i18n("buttons", "delete_title") },
            { selector: "#btn-cancel",              text: wot.i18n("buttons", "cancel") },
            { selector: "#btn-submit",              text: wot.i18n("buttons", "save") },
            { selector: "#btn-thanks-ok",           text: wot.i18n("buttons", "ok") },
            { selector: ".category-title",          text: wot.i18n("ratingwindow", "categories") },
            { selector: "#change-ratings",          text: wot.i18n("ratingwindow", "rerate_change") },
            { selector: ".comment-title",           text: wot.i18n("ratingwindow", "comment") },
            { selector: "#user-comment",            placeholder: wot.i18n("ratingwindow", "comment_placeholder") },
            { selector: ".thanks-text",             text: wot.i18n("ratingwindow", "thankyou") },
            { selector: "#comment-register-text",   text: wot.i18n("ratingwindow", "comment_regtext") },
            { selector: "#comment-register-link",   text: wot.i18n("ratingwindow", "comment_register") },
            { selector: "#wg-title",                html: wot.i18n("wg", "title") },
            { selector: "#wg-addmore",              text: wot.i18n("wg", "add_long") },
            { selector: ".wg-viewer-title",         text: wot.i18n("wg", "viewer_title_wikipedia") },
            { selector: "#wg-expander",             text: wot.i18n("wg", "expander") },
            { selector: "#wg-about",                text: wot.i18n("wg", "about") },
            { selector: ".wg-about-title",          text: wot.i18n("wg", "about_title") },
            { selector: ".wg-about-content",        text: wot.i18n("wg", "about_content") },
            { selector: "#wg-about-ok",             text: wot.i18n("wg", "about_ok") },
            { selector: "#wg-about-learnmore",      text: wot.i18n("wg", "about_more") },
            { selector: "#comment-captcha-text",    text: wot.i18n("ratingwindow", "comment_captchatext") },
            { selector: "#comment-captcha-link",    text: wot.i18n("ratingwindow", "comment_captchalink") }

        ].forEach(function(item) {
                var $elem = $(item.selector);
                if (item.text) {
                    $elem.text(item.text);
                } else if (item.html) {
                    $elem.html(item.html);
                } else if (item.title) {
                    $elem.attr("title", item.title);
                } else if (item.placeholder) {
                    $elem.attr("placeholder", item.placeholder);
                }
            });
    },

    build_voted_category_html: function (category, vote) {

        var cat_name = wot.get_category_name(category.id, true);    // use short name
        var $_cat_wrapper = $('<div class="votedcategory"></div>'),
            $_hand = $('<div class="category-hand"><div class="hand-icon"></div></div>'),
            $_cat_text = $('<div class="category-text"></div>');

	    $_cat_wrapper.addClass(vote == 1 ? "hand-up" : "hand-down");
        $_hand.addClass(vote == 1 ? "hand-up" : "hand-down");
        if (vote == 1) {
	        $_hand.addClass(wot.get_category_css(category.id));
        }
        $_hand.attr("title", wot.i18n("ratingwindow", vote == 1 ? "vote_yes" : "vote_no"));
        $_cat_text.attr("title", cat_name);
        $_cat_text.text(cat_name);
        $_cat_wrapper.append($_hand);
        $_cat_wrapper.append($_cat_text);

        return $_cat_wrapper;
    },

    update_uservoted: function () {
        var _rw = wot.ratingwindow;
        var res = "",
            up_voted = [],
            down_voted = [],
            cat = null,
            $_change = $("#change-ratings"),
            $_voted_content = $("#voted-categories-content"),
            $_voted_categories = $("#voted-categories"),
            change_link_text = "";

        // try to get user's votes from the category selector (if there are any)
        var voted = _rw.cat_selector.get_user_votes();
        if (voted.length > 0) {
            for (var i = 0; i < voted.length; i++) {
                cat = voted[i];
                if (cat.v == 1) {
                    up_voted.push(_rw.build_voted_category_html(cat, cat.v));
                } else if (cat.v == -1) {
                    down_voted.push(_rw.build_voted_category_html(cat, cat.v));
                }
            }
        } else {
            // try to get user's votes from cache (server response)
            voted = wot.select_voted(_rw.getcached().value.cats);
            for(cat in voted) {
                if (voted[cat].v == 1) {
                    up_voted.push(_rw.build_voted_category_html(wot.get_category(cat), voted[cat].v));
                } else if (voted[cat].v == -1) {
                    down_voted.push(_rw.build_voted_category_html(wot.get_category(cat), voted[cat].v));
                }
            }
        }

        $_voted_content.empty();

        if (up_voted.length > 0) {

            $_voted_categories.removeClass("wider");

            up_voted.forEach(function(elem) {
                $_voted_content.append(elem);
            });

            down_voted.forEach(function(elem) {
                $_voted_content.append(elem);
            });

            var more_voted = up_voted.length + down_voted.length - _rw.MAX_VOTED_VISIBLE;

            if (more_voted > 0) {
                var $_more = $('<div class="more-categories"></div>');
                $_more.text("+" + more_voted + " " + wot.i18n("ratingwindow", "morecats"));
                $_voted_content.append($_more);
            }

            change_link_text = wot.i18n("ratingwindow", "rerate_change");
        } else {
            $_voted_categories.addClass("wider");
            $_voted_content.text(wot.i18n("ratingwindow", "novoted"));
            change_link_text = "";
        }

        $("#rated-votes").toggleClass("voted", (up_voted.length > 0));
        $_change.text(change_link_text);
        $_change.toggle(change_link_text && change_link_text.length > 0);
    },

    has_1upvote: function (votes_obj) {
        // At least one category must be voted as YES since user gives a rating
        var _rw = wot.ratingwindow,
            votes = votes_obj || _rw.cat_selector.get_user_votes(true); // get votes as object {cat_id : vote }
        for(i in votes) {
            if (votes[i] == 1) {
                return true;
            }
        }
        return false;
    },

    is_allowed_submit: function () {
        var _rw = wot.ratingwindow,
            testimonies = 0,
            passed = false,
            has_1upvote = _rw.has_1upvote(),
            has_comment = _rw.comments.is_commented(),
            has_valid_comment = _rw.comments.has_valid_comment();

	    if (_rw.modes.is_current("wgcomment")) {    // quick comment & tag mode

		    if ((has_comment && has_valid_comment) || !has_comment && _rw.comments.is_changed()) {
			    passed = true;
		    }

	    } else {    // normal WOT rating mode
		    // 1. Either TR or CS are rated, OR none of them are rated (e.g. "delete my ratings")
		    for (var i in wot.components) {
			    var cmp = wot.components[i].name;
			    if (_rw.state[cmp] && _rw.state[cmp].t !== null && _rw.state[cmp].t >= 0) {
				    testimonies++;
			    }
		    }

		    if (has_1upvote) {
			    // if there is a comment, it must be valid, otherwise disallow the submit
			    if ((testimonies > 0 && !has_comment) || has_valid_comment) {    // if rated OR commented, then OK
				    passed = true;
			    } else if (testimonies == 0 && !has_comment) {
				    passed = true;
			    }
		    } else {
			    if (testimonies == 0 && has_comment == false) {
				    passed = true;  // no cats, no testimonies, no comment := "Delete everything" (if there are changes)
			    }
		    }
	    }

        return passed;
    },

    update_submit_button: function (enable, warn) {
        var _rw = wot.ratingwindow,
            $_submit = $("#btn-submit"),
            delete_action = false;

        _rw.timer_save_button = null;

        if (enable) {
            $_submit.removeClass("disabled");
        } else if (enable === false) {
            $_submit.addClass("disabled");
        } else {
            enable = _rw.is_allowed_submit();
            $_submit.toggleClass("disabled", !enable);
            $_submit.toggleClass("highlight", (enable && !warn));
            $_submit.toggleClass("warning", !!warn);

            // If user wants to delete ratings, change the text of the button and hide "Delete ratings" button
	        if (_rw.modes.is_current("wgcomment")) {
		        delete_action = (_rw.comments.is_changed() && !_rw.comments.is_commented());
	        } else {
		        if (enable && !_rw.is_rated(_rw.state) && !_rw.comments.has_valid_comment()) {
			        delete_action = true; // remember the reverse of the label
		        }
	        }
        }

        if (!delete_action) {
            $_submit.text(wot.i18n("buttons", "save"));

//	        if (_rw.modes.is_current("wgcomment")) {
//		        $("#btn-delete").show();
//	        }
        } else {
	        $_submit.text(wot.i18n("testimony", "delete"));
	        $("#btn-delete").hide();
        }

        _rw.delete_action = delete_action;
    },

    onload: function()
    {
        var _rw = wot.ratingwindow;
        var bg = chrome.extension.getBackgroundPage();

        _rw.opened_time = new Date(); // remember time when RW was opened (for UX measurements)
        _rw.prefs = bg.wot.prefs;   // shortcut
        wot.cache_locale();
	    wot.detect_environment(true);

        var first_opening = !_rw.prefs.get(wot.engage_settings.invite_to_rw.pref_name);

        wot.init_categories(_rw.prefs);

        _rw.is_registered = bg.wot.core.is_registered();

        /* accessibility */
        $("#wot-ratingwindow").toggleClass("accessible", bg.wot.prefs.get("accessible"));

        _rw.localize();

        /* user interface event handlers */
        var wurls = wot.urls;

        var $_wot_header_logo = $("#wot-header-logo");

        $_wot_header_logo.bind("click", function(event) {
            if (event.shiftKey) {
                event.preventDefault();
            }
            else {
                wot.ratingwindow.navigate(wurls.geturl(wurls.base), wurls.contexts.rwlogo);
            }
        });

        $_wot_header_logo.bind("dblclick", function(event) {
            if (event.shiftKey) {
                wot.ratingwindow.navigate(chrome.extension.getURL("/settings.html"), wurls.contexts.rwlogo);
            }
        });

        $("#wot-header-link-settings").bind("click", function() {
            wot.ratingwindow.navigate(wurls.geturl(wurls.settings), wurls.contexts.rwsettings);
        });

        $("#wot-header-link-profile").bind("click", function() {
            bg.wot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_PROFILELNK,
                _rw.is_registered ? "registered" : "unregistered");
            wot.ratingwindow.navigate(wurls.geturl(wurls.profile), wurls.contexts.rwprofile);
        });

        $("#wot-header-link-guide").bind("click", function() {
            wot.ratingwindow.navigate(wurls.geturl(wurls.tour), wurls.contexts.rwguide);
        });

        $("#wot-header-link-forum").bind("click", function() {
            wot.ratingwindow.navigate(wurls.geturl(wurls.base) + "forum", wurls.contexts.rwforum);
        });

        $("#wot-header-close").bind("click", function() {
            bg.wot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_BTN_CLOSE);
            _rw.hide();
        });

        $("#wot-scorecard-visit").bind("click", function() {
            if (wot.ratingwindow.current.target) {
                wot.ratingwindow.navigate(wot.urls.geturl(wot.urls.scorecard) +
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

        $("#wot-message, #floating-message").bind("click", function() {
            var url = $("#wot-message-text").attr("url");
            if (url) {
                var label = wot.i18n("locale") + "__" + $(this).attr("msg_id");
                bg.wot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_MSG_CLICKED, label);
                wot.ratingwindow.navigate(url, wurls.contexts.rwmsg);
            }
        });

	    $("#message-indicator")
		    .bind({
			    "mouseenter": function() {
				    $("#floating-message").fadeIn(200);
				    $(this).addClass("seen").removeClass("unseen");
				    if (_rw.msg_timer) clearTimeout(_rw.msg_timer);
				    var bgwot = wot.ratingwindow.get_bg("wot");

				    // remember the message as read
				    if (bgwot.core.unseenmessage()) {
		                bgwot.prefs.set("last_message", bgwot.core.usermessage.id);
		            }
			    },

	            "mouseleave": function() {
		            _rw.msg_timer = setTimeout(function (){
			            $("#floating-message").fadeOut(200);
		            },500);
	            }
		    });

	    $("#floating-message").bind({
		    "mouseenter": function() {
			    if (_rw.msg_timer) clearTimeout(_rw.msg_timer);
		    },

		    "mouseleave": function() {
			    if (_rw.msg_timer) clearTimeout(_rw.msg_timer);
			    _rw.msg_timer = setTimeout(function (){
				    $("#floating-message").fadeOut(200);
			    },500);
		    }
	    });

        $(".rating-delete-icon, .rating-deletelabel").bind("click", _rw.rate_control.on_remove);

        $("#user-comment")
	        .bind("change keyup", function(event) {

		        wot.ratingwindow.comments.update_caret(event, this);

	            window.setTimeout(function(){
	                wot.ratingwindow.comments.update_hint();
		            wot.ratingwindow.wg.update_wg_tags();

	                // set the timeout to update save button when user stops typing the comment
	                if (wot.ratingwindow.timer_save_button) {
	                    window.clearTimeout(wot.ratingwindow.timer_save_button);
	                }
	                wot.ratingwindow.timer_save_button = window.setTimeout(function(){
		                wot.ratingwindow.update_submit_button();
	                }, 200);

	            }, 20);    // to react on any keyboard event after the text was changed
	        })
	        .tagautocomplete({
		        source: wot.ratingwindow.wg.suggest_tags,
		        character: "#",
		        items: 4,
		        show: wot.ratingwindow.wg.show_tagautocomplete
	        })
	        .get(0).addEventListener("paste", _rw.comments.on_paste, false);   // overload the paste event

        // Rate mode event handlers
        $("#btn-comment").bind("click", _rw.on_comment_button);
        $("#btn-submit").bind("click", _rw.on_submit);
        $("#btn-thanks-ok").bind("click", _rw.on_thanks_ok);
        $("#btn-cancel").bind("click", _rw.on_cancel);
        $("#btn-delete").bind("click", _rw.on_delete_button);
        $("#change-ratings, #voted-categories-content").bind("click", _rw.on_change_ratings);


        $("#comment-register-link").bind("click", function() {
            wot.ratingwindow.navigate(wurls.geturl(wurls.signup), wurls.contexts.rwcommreg);
        });

        $("#comment-captcha-link").bind("click", function() {
            if (wot.ratingwindow.current.target) {
                wot.ratingwindow.navigate(wot.urls.geturl(wot.urls.scorecard) +
                    encodeURIComponent(wot.ratingwindow.current.target + "/rate"),
                    wurls.contexts.rwcaptcha, "rate");
            }
        });

        $(window).unload(wot.ratingwindow.on_unload);

        _rw.rate_control.init(); // init handlers of rating controls
        bg.wot.core.update(true);     // this starts main data initialization (e.g. before it, there is no "cached" data)

        var wt =     bg.wot.wt,
            locale = bg.wot.i18n("locale");

        // Welcome Tip button "close"
        $(".wt-rw-close").click(function (e){
            wot.ratingwindow.reveal_ratingwindow();

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

		var tts_wtip =  first_opening &&
						!(wt.settings.rw_ok || wt.settings.rw_shown > 0) &&
						wot.is_defined(["rw_text", "rw_text_hdr"], "wt");

		tts_wtip = tts_wtip && (wot.get_activity_score() < bg.wot.wt.activity_score_max);

	    tts_wtip = tts_wtip && !wot.env.is_mailru_amigo;    // no tip for Amigo browser

        if (bg.wot.prefs.get("super_wtips")) tts_wtip = true;  // override by super-setting

		if (tts_wtip) {
			// RW is opened first time - show welcome tip
			_rw.show_welcome_tip();

			// set all welcome tip's preferences (== wt was shown)
			wt.settings.rw_shown = wt.settings.rw_shown + 1;
			wt.settings.rw_shown_dt = new Date();
			wt.save_setting("rw_shown");
			wt.save_setting("rw_shown_dt");
		}

	    // Web Guide initialization
	    _rw.wg.init_handlers();

	    // increment "RatingWindow shown" counter
        _rw.count_window_opened();
        bg.wot.core.badge.text = "";
        bg.wot.core.badge.type = null;

        // shown RatingWindow means that we shown a message => remove notice badge from the button
        // this was commented on 24.06.2013 to avoid concurrent changing of the badge
//        if (bg.wot.core.badge_status && bg.wot.core.badge_status.type == wot.badge_types.notice.type) {
//            bg.wot.core.set_badge(null, false);   // hide badge
//        }

//	    _rw.wg.update_mytags();  // fetch user's tags whether they are not loaded yet or expired
//	    _rw.wg.update_popular_tags();
    },

	show_tiny_thankyou: function () {
		$("#tiny-thankyou").fadeIn(500, function (){
			window.setTimeout(function (){
				$("#tiny-thankyou").fadeOut(1000);
			}, 2000);
		});
	},

    on_comment_button: function (e) {
        var _rw = wot.ratingwindow;

        if ($(this).hasClass("disable")) return;    // do nothing of the button is disabled

        switch (_rw.modes.current_mode) {
            case "rate":
                 if (!_rw.comments.allow_commenting) return;
                _rw.update_uservoted();
                _rw.modes.comment.activate();

                // do some stats collection
                if (_rw.comments.is_commented()) {
                    wot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_EDITCOMMENT);
                } else {
                    wot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_ADDCOMMENT);
                }
                break;
            case "comment":
                _rw.modes.rate.activate();
                wot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_PICKACAT);
                break;
        }
    },

    on_delete_button: function () {
//        console.log("on_delete_button()");
        var _rw = wot.ratingwindow,
            bg = _rw.get_bg();

        wot.components.forEach(function(item){
            _rw.delete_testimony(item.name);
        });

        bg.wot.keeper.remove_comment(_rw.state.target);
        _rw.comments.set_comment("");   // clear the comment
        _rw.local_comment = null;
        _rw.comments.update_hint();

        wot.ratingwindow.finishstate(false);
        wot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_DELETEALL);
        _rw.modes.auto();   // switch RW mode according to current state
    },

    on_cancel: function () {

        var _rw = wot.ratingwindow,
            cached = _rw.getcached(),
            bg = chrome.extension.getBackgroundPage();

        // restore previous testimonies
        wot.components.forEach(function(item){
            var a = item.name;
            var t = (cached.value[a] && cached.value[a].t !== undefined) ? cached.value[a].t : -1;
            if (_rw.state[a]) {
                _rw.state[a].t = t;
                _rw.state[a].name = a;
            } else {
                _rw.state[a] = { t: t, name: a };
            }

            _rw.rate_control.updateratings(_rw.state[a]);  // restore user's testimonies visually
        });

        _rw.cat_selector.init_voted(); // restore previous votes

        bg.wot.keeper.remove_comment(_rw.state.target); // remove locally saved comment
        _rw.update_comment(cached, null); // restore comment to server-side version

        wot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_BTNCANCEL);

        _rw.modes.auto();   // switch RW mode according to current state
    },

    on_submit: function (e) {
//        console.log("on_submit()");

	    if ($(e.currentTarget).hasClass("disabled")) return;    // do nothing is "Save" is not allowed

	    var _rw = wot.ratingwindow,
		    bg = _rw.get_bg(),
		    last_rated = 0 + bg.wot.core.last_testimony;    // remember the value before saving the testimony

	    wot.ratingwindow.finishstate(false);
	    if (_rw.delete_action) {
		    _rw.modes.auto();   // switch RW mode according to current state
	    } else {
		    if ((last_rated == 0 || (Date.now() - last_rated) > wot.TINY_THANKYOU_DURING) &&
			    !_rw.modes.is_current("wgcomment")) {
			    // show full Thank You screen when last rating from the user was long time ago
			    _rw.modes.thanks.activate();
		    } else {
			    // otherwise show tiny thank you
			    _rw.modes.auto();
			    _rw.show_tiny_thankyou();
		    }
	    }
    },

    on_thanks_ok: function () {
        wot.ratingwindow.modes.auto();
    },

    on_change_ratings: function () {
        wot.ratingwindow.modes.rate.activate();
    },

    on_unload: function () {
        wot.ratingwindow.finishstate(true);
    },

    rate_control: {

        init: function() {
            var _this = wot.ratingwindow;

            // Rating control events handlers
            $(".wot-rating-stack").bind({
                mousedown: _this.rate_control.on_mousedown,
                mouseup: _this.rate_control.on_mouseup,
                mousemove: _this.rate_control.on_mousemove,
                mouseleave: _this.rate_control.on_mousemove
            });
        },

        on_mousemove: function (e) {
            var _rw = wot.ratingwindow;

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
            var _rw = wot.ratingwindow;

            // skip the click if ratings are disabled
            if ($("#ratings-area").attr("disabled")) return;

            var c = $(this).attr("component");
            var t = _rw.getrating(e, this);
            _rw.state.down = c;
            _rw.setstate(c, t);
            _rw.rate_control.updateratings({ name: c, t: t });

            if (!_rw.modes.is_current("comment")) _rw.modes.rate.activate();  // switch to rate mode if we are not in "comment" mode

            // there is a nasty issue in Chrome & jQuery: when dragging an object, the cursor has "text select" form.
            e.originalEvent.preventDefault(); // http://stackoverflow.com/a/9743380/954197
        },

        on_mouseup: function (e) {
            var _rw = wot.ratingwindow;
            _rw.state.down = -1;  // no component is being rating right now
        },

        on_remove: function (e) {
            var _rw = wot.ratingwindow;

            if ($(this).closest(".rating-delete").hasClass("delete")) {

                if (!_rw.modes.is_current("comment")) _rw.modes.rate.activate();  // switch to rate mode if we are not in "comment" mode
                var c = parseInt($(this).closest(".wot-rating-data").attr("component"));

                // TODO: show the warning that categories will be deleted also (?)
                _rw.delete_testimony(c);
            }
        },

        update_ratings_visibility: function (mode) {
            var _rw = wot.ratingwindow,
                $_ratingarea = $("#ratings-area");

            if (mode == "unrated") {
                if (_rw.state.target) {
                    $_ratingarea.attr("disabled", null);
                } else {
                    $_ratingarea.attr("disabled", "disabled");
                    // TODO: show some text to explain that there is nothing to rate
                }
            } else {
                $_ratingarea.attr("disabled", null);
            }
        },

        updateratings: function(state)
        {
            /* indicator state */
            var _rw = wot.ratingwindow;
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
	                var show_helptext = true;
	                if (rep == "r0" && _rw.prefs.get("activity_score") >= 3000) {
		                show_helptext = false;
	                }

	                if (show_helptext) {
		                elems.helptext.text(helptext).show();
		                elems.helptext.attr("r", rep);
	                } else {
		                elems.helptext.text("");
	                }
                } else {
	                elems.helptext.hide();
                }
            });

            _rw.update_submit_button(null, wot.ratingwindow.cat_selector.is_illogical);
        }
    },

    /* Modes are only visual helpers to render proper content in the Rating Window */
    modes: {

        current_mode: "",

        unrated: {
            visible: ["#ratings-area", "#reputation-info", "#user-communication", ".user-comm-social", "#main-area"],
            invisible: ["#rate-buttons", "#categories-selection-area", "#rated-votes",
                "#commenting-area", "#thanks-area", "#ok-button", "#wg-about-area"],
            addclass: "view-mode unrated",
            removeclass: "rated commenting thanks rate wgcommenting wgexpanded wgabout",

	        show_effect: {
		        name: "fade",
		        direction: "in"
	        },

	        show_duration: 100,
	        hide_duration: 0,

	        before_show: function (prev_mode) {
		        if (prev_mode) {
			        $("#main-area")[0].style.height = null;
		        }
	        },

	        before_hide: function (new_mode) {
		        var $mainarea = $("#main-area");

		        if (new_mode == "wgcomment") {
			        $mainarea[0].style.height = wot.ratingwindow.modes.unrated.get_mainarea_height($mainarea);
		        }
	        },

	        get_mainarea_height: function ($elem) {

		        var e = $elem[0],
			        rects = e.getClientRects(),
			        rect = rects && rects.length ? rects[0] : {},
			        h = rect.height || 0;

		        return h + $("#ratings-area").height() - (wot.platform != "firefox"? 1 : 0) + "px";
	        },

            activate: function (force) {
                if (!wot.ratingwindow.modes._activate("unrated", force) && !force) return false;

	            var $rated_votes = $("#rated-votes"),
		            show_comment_icon = $rated_votes.hasClass("commented");

	            $rated_votes.toggle(show_comment_icon);
	            $(".user-comm-activity").toggle(!show_comment_icon);

	            wot.ratingwindow.wg.update_wg_visibility();
                return true;
            }
        },

        rated: {
            visible: ["#ratings-area", "#reputation-info", "#user-communication", "#rated-votes", ".user-comm-social", "#main-area"],
            invisible: ["#rate-buttons", "#categories-selection-area",
                "#commenting-area", "#thanks-area", "#ok-button", "#wg-about-area"],
            addclass: "view-mode rated",
            removeclass: "unrated commenting thanks rate wgcommenting wgexpanded wgabout",

	        show_effect: {
		        name: "fade",
		        direction: "in"
	        },

	        show_duration: 100,
	        hide_duration: 0,

	        before_show: function (prev_mode) {
		        if (prev_mode) {
			        $("#main-area")[0].style.height = null;
		        }
	        },

	        before_hide: function (new_mode) {
		        var $mainarea = $("#main-area");

		        if (new_mode == "wgcomment") {
			        $mainarea[0].style.height = wot.ratingwindow.modes.unrated.get_mainarea_height($mainarea);
		        }
	        },

            activate: function (force) {
                if (!wot.ratingwindow.modes._activate("rated", force) && !force) return false;

	            $(".user-comm-activity").hide(); // in rated mode never show activity score line

                wot.ratingwindow.update_uservoted();
	            wot.ratingwindow.wg.update_wg_visibility();
                return true;
            }
        },

        rate: {
            visible: ["#ratings-area", "#rate-buttons", "#categories-selection-area", "#main-area"],
            invisible: ["#reputation-info", "#user-communication", "#rated-votes",
                "#commenting-area", "#thanks-area", "#ok-button", "#wg-area", "#wg-about-area"],
            addclass: "rate",
            removeclass: "view-mode rated unrated commenting thanks wgcommenting wgexpanded wgabout",

	        show_effect: {
		        name: "fade",
		        direction: "in"
	        },

	        show_duration: 100,
	        hide_duration: 0,

	        activate: function (force) {
                var _rw = wot.ratingwindow,
                    prev_mode = _rw.modes.current_mode;

                if (!_rw.modes._activate("rate", force) && !force) return false;

                // "Comment" mode can be the first active mode in session, so we have to init things still.
                if (prev_mode != "comment" || !_rw.cat_selector.inited) {
                    if (!_rw.cat_selector.inited) {
                        _rw.cat_selector.build();
                        _rw.cat_selector.init();
                    }
                    _rw.cat_selector.init_voted();
                    _rw.update_catsel_state();  // update the category selector with current state
                }

                _rw.cat_selector.calc_illogicality();
	            _rw.cat_selector.warn_illogicality(_rw.cat_selector.is_illogical);

	            _rw.update_submit_button(null, _rw.cat_selector.is_illogical);
                _rw.comments.update_button("rate", true);
                _rw.was_in_ratemode = true;

                _rw.reveal_ratingwindow(true);
                return true;
            }
        },

        comment: { // Commenting during rating process
            visible: ["#ratings-area", "#rate-buttons", "#commenting-area", "#rated-votes", "#main-area"],
            invisible: ["#reputation-info", "#user-communication", "#categories-selection-area",
                "#thanks-area", "#ok-button", "#wg-area", "#wg-about-area"],
            addclass: "commenting",
            removeclass: "view-mode rated unrated rate thanks wgcommenting wgexpanded wgabout",

	        show_effect: {
		        name: "fade",
		        direction: "in"
	        },

	        show_duration: 100,
	        hide_duration: 0,

	        activate: function (force) {
                var _rw = wot.ratingwindow,
                    prev_mode = _rw.modes.current_mode;
                if (!wot.ratingwindow.modes._activate("comment", force) && !force) return false;

                // TODO: this piece of code is a duplication. Should be refactored.
                if (prev_mode == "" || !_rw.cat_selector.inited) {
                    if (!_rw.cat_selector.inited) {
                        _rw.cat_selector.build();
                        _rw.cat_selector.init();
                    }
                    _rw.cat_selector.init_voted();
	                _rw.update_catsel_state();  // update the category selector with current state
                }

		        // update side hint to the relevant hint
		        $("#comment-side-hint").html(wot.i18n("ratingwindow", "commenthints"));

                _rw.was_in_ratemode = true; // since in comment mode user is able to change rating, we should set the flag
                _rw.comments.update_hint();
                _rw.comments.update_button("comment", true);
                _rw.update_submit_button();
                _rw.comments.focus();
                _rw.reveal_ratingwindow(true);
                return true;
            }
        },

        wgcomment: { // Quick Comment mode for WebGuide feature
            visible: ["#wg-area", "#commenting-area", "#main-area"],  // "#rate-buttons" will be shown after animation
            invisible: ["#ratings-area", "#reputation-info", "#user-communication", "#categories-selection-area",
                "#thanks-area", "#ok-button", "#rated-votes", "#wg-about-area"],

	        addclass: "wgcommenting",
	        removeclass: "view-mode rated unrated rate thanks wgexpanded wgabout",

	        show_effect: {
		        name: "blind",
		        direction: "down"
	        },

	        hide_effect: {
		        name: null
	        },

	        show_duration: 200,
	        hide_duration: 0,

	        before_show: function () {
	        },

	        before_hide: function () {
		        $("#rate-buttons").hide();
	        },

	        after_show: function () {
		        $("#rate-buttons").show();
	        },

            activate: function (force) {
                var _rw = wot.ratingwindow,
                    prev_mode = _rw.modes.current_mode;
                if (!wot.ratingwindow.modes._activate("wgcomment", force) && !force) return false;

//	            $("#main-area")[0].style.height = null;

				// update side hint to the relevant hint
	            $("#comment-side-hint").html(wot.i18n("ratingwindow", "wgcommenthints"));

	            _rw.was_in_ratemode = false; // user is commenting passing rating process
                _rw.comments.update_hint();
                _rw.update_submit_button();
	            _rw.reveal_ratingwindow(true);
                _rw.comments.focus();
                return true;
            }
        },

	    wgexpanded: { // Full view of WOT Groups feature
		    visible: ["#wg-area", "#ratings-area" ],
		    invisible: [ "#reputation-info", "#user-communication", "#categories-selection-area",
			    "#thanks-area", "#ok-button", "#commenting-area", "#wg-about-area", "#ok-button"],

		    addclass: "wgexpanded",
		    removeclass: "rate thanks wgcommenting commenting wgabout",

		    show_duration: 300,
		    hide_duration: 0,

		    before_show: function () {
			    $("#main-area").hide({
				    effect: "blind",
				    direction: "up",
				    duration: 500,
				    easing: "easeOutQuart",
				    complete: function () {
				        $("#wg-tags").addClass("expanded");
			        }
			    });
		    },

		    before_hide: function () {
			    $("#wg-expander").text(wot.i18n("wg", "expander"));
			    $("#wg-tags").removeClass("expanded");
		    },

		    after_show: function () {
		    },

		    after_hide: function () {
			    wot.ratingwindow.wg.update_wg_tags();
		    },

		    activate: function (force) {
			    var _rw = wot.ratingwindow,
				    prev_mode = _rw.modes.current_mode;
			    if (!wot.ratingwindow.modes._activate("wgexpanded", force) && !force) return false;

			    _rw.was_in_ratemode = false; // user is commenting passing rating process
			    _rw.reveal_ratingwindow(true);
			    $("#wg-expander").text(wot.i18n("wg", "expander_less"));

			    return true;
		    }
	    },

        thanks: {
            visible: ["#thanks-area", "#ratings-area", "#rated-votes", "#ok-button", "#main-area"],
            invisible: ["#reputation-info", "#user-communication", "#categories-selection-area",
                "#commenting-area", "#rate-buttons", "#wg-area", "#wg-about-area"],
            addclass: "thanks view-mode",
            removeclass: "rated unrated rate commenting wgcommenting wgexpanded wgabout",

            activate: function (force) {
                var _rw = wot.ratingwindow;
                if (!_rw.modes._activate("thanks", force) && !force) return false;

                _rw.update_uservoted();

                // no need to show this to platinum members
                if ((_rw.prefs.get("activity_score") || 0) >= wot.AS_LEVELS.PLATINUM) {
                    $(".thanks-ratemore").hide();
                }

                setTimeout(function() {
                    wot.ratingwindow.modes.auto();  // switch to default mode
                }, 6000);
                return true;
            }
        },

	    wg_about: {
			// the explanation screen "What's this?" for WOT Groups
		    visible: ["#wg-area", "#wg-about-area", "#ratings-area", "#main-area"],
		    invisible: ["#reputation-info", "#user-communication", "#categories-selection-area",
			    "#commenting-area", "#rate-buttons" ],
		    addclass: "wgabout view-mode",
		    removeclass: "rated unrated rate commenting thanks wgcommenting wgexpanded",

		    before_hide: function (new_mode) {
			    var $mainarea = $("#main-area");

			    if (new_mode == "wgcomment") {
				    $mainarea[0].style.height = wot.ratingwindow.modes.unrated.get_mainarea_height($mainarea);
			    }
		    },

		    activate: function (force) {
			    var _rw = wot.ratingwindow;
			    if (!_rw.modes._activate("wg_about", force) && !force) return false;

			    $("#main-area")[0].style.height = null;

			    return true;
		    }
	    },

        show_hide: function (mode_name) {
            var _modes = wot.ratingwindow.modes,
	            current_mode = _modes.current_mode,
	            mode = _modes[mode_name],
	            cmode = _modes[current_mode] || {};
            var visible = mode ? mode.visible : [];
            var invisible = mode ? mode.invisible : [];

            if (cmode && typeof(cmode.before_hide) == "function") cmode.before_hide(mode_name);

	        var hide_effect = cmode.hide_effect ? cmode.hide_effect.name : "fade",
	            show_effect = mode.show_effect ? mode.show_effect.name : "fade",
		        hide_params = cmode.hide_effect ? cmode.hide_effect : { direction: "out" },
		        show_params = mode.show_effect ? mode.show_effect : { direction: "in"};

			var hide_options = {
				effect: hide_effect,
				duration: cmode && cmode.hide_duration && current_mode !='' ? cmode.hide_duration : 0,
				complete: function () {
					if (current_mode && typeof(cmode.after_hide) == "function") cmode.after_hide(mode_name);

					// then switch classes
					$("#wot-ratingwindow").addClass(mode.addclass).removeClass(mode.removeclass);
				}
			};

	        hide_options = $.extend(hide_options, hide_params);
	        $(invisible.join(", ")).hide(hide_options);

	        // then show new mode
	        if (typeof(mode.before_show) == "function") mode.before_show(current_mode);

	        var show_options = {
		        effect: show_effect,
		        duration: mode && mode.show_duration && current_mode != '' ? mode.show_duration : 0,
		        complete: function () {
			        if (typeof(mode.after_show) == "function") mode.after_show(current_mode);
		        }
	        };
	        show_options = $.extend(show_options, show_params);
	        $(visible.join(", ")).show(show_options);
        },

        _activate: function (mode_name, force) {
            /* Generic func to do common things for switching modes. Returns false if there is no need to switch the mode. */
//            console.log("RW.modes.activate(" + mode_name + ")");

            var _rw = wot.ratingwindow;
            if (_rw.modes.current_mode == mode_name && !force) return false;
            _rw.modes.show_hide(mode_name);
            _rw.modes.current_mode = mode_name;
            _rw.rate_control.update_ratings_visibility(mode_name);
	        return true;
        },

        auto: function (enforce) {
            var _rw = wot.ratingwindow;

            if (_rw.local_comment && _rw.local_comment.comment) {
                _rw.modes.comment.activate(enforce);
            } else {
                // If no locally saved comment exists, switch modes between Rated / Unrated
                if (_rw.is_rated()) {
                    _rw.modes.rated.activate(enforce);
                } else {
                    _rw.modes.unrated.activate(enforce);
                }
            }
        },

        reset: function () {
            wot.ratingwindow.modes.current_mode = "";
        },

        is_current: function (mode) {
            return wot.ratingwindow.modes.current_mode == mode;
        }
    },

    cat_selector: {
	    MAX_UPVOTED_BEFORE_WARN: 3,
        inited: false,
        $_cat_selector: null,
        short_list: true,
        voted: {},
	    is_illogical: false,

        build: function () {
            var _rw = wot.ratingwindow,
                _this = _rw.cat_selector,
                cats = [];

            _this.$_cat_selector = $(".category-selector .dropdown-menu"); // all operations are done on the menu actually
            $("*", _this.$_cat_selector).detach();  // remove everything if present

            // cycle through grouping to create main sections
            for (var gi = 0; gi < wot.grouping.length; gi++) {
                var grp = wot.grouping[gi];
                if (!grp.omnipresent && grp.text) {
                    var $_li = _this._build_grouping(grp.text, grp.name);

                    var $_popover = $("<div></div>").addClass("popover");   // container for a list of categories

                    // Iterate over list of groups in the grouping (section)
                    if (grp.groups && grp.groups.length) {
                        for(var a = 0; a < grp.groups.length; a++) {
                            var g = grp.groups[a], // g.name == id, g.type == css style
                                g_id = parseInt(g.name);

                            cats = wot.select_categories(g_id, g_id);   // list if categories' IDs
                            _rw.cat_selector._build_from_list(cats, $_popover, false, false);
                        }
                    }

                    $_li.append($_popover);
                    _this.$_cat_selector.append($_li);
                }
            }

            var _i18n_fulllist = wot.i18n("ratingwindow", "fulllist");

            if (_i18n_fulllist) {
                var chk_html = '<div class="cat-full-list">' +
                    '<input type="checkbox" id="chk-full-list" class="css-checkbox"/>' +
                    '<label for="chk-full-list" class="css-label">' + _i18n_fulllist + '</label>' +
                    '</div>';

                _this.$_cat_selector.append($(chk_html));
            }
        },

        _build_grouping: function (grouping_text, grouping_name) {
            // Makes HTML for a grouping
            var $_li = $("<li></li>").attr("grp-name", grouping_name); // grouping holder
            // add section name
            $("<span></span>").addClass("group-title").text(grouping_text).appendTo($_li);
            return $_li;
        },

        _build_from_list: function (cat_list, $_target_popover, omni, dynamic) {
            /* Makes HTML elements of categories with all controls and inserts them into Popover wrapper */
            var _this = wot.ratingwindow.cat_selector;
            var textvote_yes = wot.i18n("ratingwindow", "vote_yes"),
                textvote_no = wot.i18n("ratingwindow", "vote_no");

            $(".category-breakline", $_target_popover).detach();    // remove any breaklines
            if (cat_list.length > 0) {
                // Iterate over a list of categories belonging to the current group
                if (omni) {
                    $("<div></div>").addClass("category-breakline").appendTo($_target_popover); // add the separator for omni
                }

                for (var ci = 0; ci < cat_list.length; ci++) {
                    var cobj = cat_list[ci],// here we may get a category object, or simple category ID. Depends on source.
                        cid = 0;
                    cid = (typeof cobj == "object") ? cobj.id : cobj; // in case if we work with category object instead if just a number

                    var cat = wot.get_category(cid);
                    if (!wot.utils.isEmptyObject(cat)) {
                        var $_po_cat = $("<div></div>").addClass("category"); // container for a category
                        $_po_cat.attr("data-cat", cat.id);
                        $_po_cat.toggleClass("omni", omni);
						$_po_cat.toggleClass("dynamic", dynamic);

                        if (cat.fullonly) {
                            $_po_cat.addClass("fullonly");
                            $_po_cat.toggleClass("invisible", _this.short_list);
                        }

	                    var $_cat_vote = $("<div></div>").addClass("cat-vote");
	                    if (dynamic) {
		                    // here we show "I disagree" button on the right side
		                    $("<div></div>").text(textvote_no).addClass("cat-vote-right").appendTo($_cat_vote);
	                    } else {
		                    // In "normal" sections we show checkboxes only, on the left side
		                    $("<div></div>").addClass("cat-vote-left").appendTo($_cat_vote);
	                    }

//	                    $("<div></div>").addClass("delete-icon")
//		                    .appendTo($("<div></div>").addClass("cat-vote-del").appendTo($_cat_vote));

	                    $_cat_vote.appendTo($_po_cat);


                        $("<div></div>")    // the category line
                            .text(wot.get_category_name(cat.id, true))
                            .addClass("cat-name")
                            .appendTo($_po_cat);

                        $_target_popover.append($_po_cat);

                    } else {
                        console.warn("Can't find category", cat_list[ci]);
                    }
                }
            }
            return cat_list.length;
        },

        set_state: function (state, identified) {
            // Sets the category selector into proper state taking into account user's ratings and currently identified categories.
            var _rw = wot.ratingwindow,
                _this = _rw.cat_selector,
                $_popover = null;

            if (!_this.inited) return;  // do nothing when I'm not ready yet

            if (!_rw.modes.is_current("rate")) return; // do nothing when not in Rate mode

            var t0 = state[0] ? state[0].t : -1;    // Trustworthiness user's testimony
            var t4 = state[4] ? state[4].t : -1;    // Child Safety user's testimony

            // 1. Pre-open proper grouping
            var grp = wot.determ_grouping(t0, null),
                grp_id = grp.name;

            var $_grouping = $("li[grp-name=" + grp_id + "]", _this.$_cat_selector).first();
            if ($_grouping && grp_id != null) {
                _this.deactivate_all();
                _this.activate_submenu($_grouping);
            }

            // 2. Create omni-part with CS categories based on user's CS testimony
            var omnigroupings = wot.determ_grouping(t0, "omnipresent");
            var omni_categories = [],   // all possible omni-categories
                omni_to_show = [],  // plain filtered list of omni-categories
                omni_per_section = {};  // list of omni-categories per selector's section

            // make a list of all categories for omni-area that we may show
            if (omnigroupings && omnigroupings.groups) {
                for (var gi = 0; gi < omnigroupings.groups.length; gi++) {
                    var g_id = parseInt(omnigroupings.groups[gi].name);
                    // collect all categories that are possible to show in omni-area
                    omni_categories = omni_categories.concat(wot.select_categories(g_id, g_id));
                }

                // filter out categories irrelevant to user's testimony
                omni_to_show = omni_categories.filter(function(elem, i, arr) {
                    var cat = wot.get_category(elem);
                    return (cat.rmin !== null && cat.rmax !== null && t4 >= cat.rmin && t4 <= cat.rmax);
                });
            }

            /* now omni_to_show[] contains all cats for the given testimony and we need to make filtered lists
            for every section in the selector.         */
            for (var j = 0; j < wot.grouping.length; j++) {
                if (wot.grouping[j].omnipresent || wot.grouping[j].dynamic) continue;  // skip omni grouping for obvious reason
                var section_id = wot.grouping[j].name;
                omni_per_section[section_id] = omni_to_show.filter(function (elem, i , arr) {
                    var cat = wot.get_category(elem);
                    if (cat.excludegroupings) {
                        var excludegroupings = cat.excludegroupings.split(",");
                        return (excludegroupings.indexOf(section_id) < 0);
                    }
                    return true;
                });
            }

            // 3. Build dynamic group ("Do you agree with?") filtering out categories shown in omni-area
            var cached = _rw.getcached(),
                cats_object = cached.value.cats,
                dyn_cats = [],
                dyn_grp = wot.determ_grouping(null, "dynamic"), // find the dynamic group to identify "popover" DOM element
                filtered_dynamic = [];

            if (dyn_grp.groups && dyn_grp.groups.length) {
                for (var i= 0, gid; i < dyn_grp.groups.length; i++) {
                    gid = parseInt(dyn_grp.groups[i].name);
                    dyn_cats = dyn_cats.concat(wot.select_categories(gid, gid));
                }
            }

            if (!wot.utils.isEmptyObject(cats_object)) {
                var cats = wot.rearrange_categories(cats_object);   // list of categories' IDs
                // filter out categories that are in the omni-area already
                // and that are only voted but not identified by community
                filtered_dynamic = cats.trustworthy.concat(cats.childsafety).filter(function(elem){
                    var cat_id = parseInt(elem.id);
                    var fltr = elem.c;  // Identified cats have "c" attribute's value greater than zero;
                    fltr = fltr && !(dyn_cats.indexOf(cat_id) >= 0); // drop categories that are already in dyn_cats
                    return fltr;
                });

                filtered_dynamic = dyn_cats.concat(filtered_dynamic);
            }

            $_popover = $("li[grp-name="+dyn_grp.name+"] .popover", _this.$_cat_selector).first();
            $(".category", $_popover).detach(); // remove all previous categories from the popover
            _rw.cat_selector._build_from_list(filtered_dynamic, $_popover, false, true); // fill the dynamic popover with categories

            // Toggle visibility of the dynamic grouping based on presence of categories there
            $("li[grp-name="+dyn_grp.name+"]", _this.$_cat_selector).toggleClass("invisible", !filtered_dynamic.length);

            // 4. Append finally Omni Categories
            $(".category-selector .popover .omni").detach();    // remove all previous omni groups from all popovers

            // Create and attach omni categories to _all_ popovers (groupings)
            for (var si in omni_per_section) {
                if (omni_per_section[si]) {
                    $_popover = $(".category-selector li[grp-name=" + si + "] .popover");
                    _this._build_from_list(omni_per_section[si], $_popover, true, false);
                }
            }

            _this.highlight_identified(cats_object);    // assign CSS styles to identified categories
            _this.markup_voted();                       // assign extra data to voted categories
        },

        highlight_identified: function (cats_object) {
            // Highlights currently identified categories in the selector
            var _rw = wot.ratingwindow,
                _this = _rw.cat_selector,
                cats = wot.select_identified(cats_object);

            $(".category.identified", _this.$_cat_selector).removeClass("identified");

            for(var cat_id in cats) {
                $(".category[data-cat=" + cat_id + "]", _this.$_cat_selector)
                    .addClass("identified")
                    .removeClass("fullonly invisible"); // if a category is identified, show it in both full/short list modes and prevent to be hidden
            }
        },

        markup_voted: function () {
            // Hightlights user's votes for categories
            var _rw = wot.ratingwindow,
                _this = _rw.cat_selector;

            $(".category", _this.$_cat_selector).removeAttr("voted");

            for(var cat_id in _this.votes) {
                $(".category[data-cat=" + cat_id + "]", _this.$_cat_selector)
                    .removeClass("fullonly invisible")  // if a category is voted, show it in both full/short list modes
                    .attr("voted", _this.votes[cat_id].v);
            }
        },

        get_user_votes: function (return_object) {
            // Scans DOM for all visible categories in the category selector to filter out voted but invisible cats in future

            var _rw = wot.ratingwindow,
                _this = _rw.cat_selector,
                voted = [],
                voted_obj = {};

            $(".category", _this.$_cat_selector).each(function (i, elem) {
                var cid = $(this).attr("data-cat"), cat = null;
                if (cid && $(this).attr("voted")) {
                    cid = parseInt(cid);
                    if (voted_obj[cid] === undefined) {         // check for unique
                        cat = wot.get_category(cid);
                        cat.v = parseInt($(this).attr("voted"));
                        voted.push(cat);
                        voted_obj[cid] = cat.v;   // to be able to get a list of unique voted categories
                    }
                }
            });

            return return_object ? voted_obj : voted;  // return either object or array
        },

        update_categories_visibility: function () {
            var _rw = wot.ratingwindow,
                _this = _rw.cat_selector;

            // show / hide categories from short/full list
            $(".category.fullonly", _this.$_cat_selector).toggleClass("invisible", _this.short_list);
        },

        init: function() {
            var _rw = wot.ratingwindow,
                _this = _rw.cat_selector;

            _this.init_voted();

            $(".dropdown-menu").menuAim({
                active_selector: ".maintainHover",
                activate: _this.activate_submenu,
                deactivate: _this.deactivate_submenu
            });

            $(_this.$_cat_selector).on("click", ".category, .cat-vote-left, .cat-vote-right, .cat-vote-del", _this.vote);

            // show description of the hovered category
            $(_this.$_cat_selector).on("mouseenter mouseleave", ".category", _this.on_category_hover);

            _this.short_list = !_rw.prefs.get("show_fulllist");

            $("#chk-full-list").
                bind("change", _this.on_show_full).
                attr("checked", _this.short_list ? null : "checked");

            _this.$_cat_selector.toggleClass("shortlist", _this.short_list); // change appearance of the list

            _this.update_categories_visibility();

            this.inited = true;
        },

        on_category_hover: function (e) {

            var $_cat = $(e.currentTarget),
                $_category_title = $(".category-title"),
                $_cat_description = $(".category-description");

	        if ($_cat_description.hasClass("warning")) return;

            var cat_id = $_cat.attr("data-cat"),
                is_hovered = (e.type == "mouseenter") && (cat_id !== undefined);

            var cat_description = wot.get_category(cat_id).description;

            if (is_hovered && cat_description) {
                $_category_title.hide(0, function () {
                    $_cat_description.text(cat_description);
                    $_cat_description.show();
                });

            } else {
                $_cat_description.hide(0, function (){
                    $_category_title.show();
                });
            }
        },

        on_show_full: function () {
            var _rw = wot.ratingwindow,
                _this = _rw.cat_selector;

            _this.short_list = ($(this).attr("checked") != "checked");
            _rw.prefs.set("show_fulllist", !_this.short_list);  // store the value

            _this.$_cat_selector.toggleClass("shortlist", _this.short_list); // change appearance of the list

            _this.update_categories_visibility();
        },

        init_voted: function (cats) {
            var _rw = wot.ratingwindow,
                _this = _rw.cat_selector,
	            cached = {},
	            cats_object = {};

            if (!cats || wot.utils.isEmptyObject(cats)) {
	            cached = _rw.getcached();
	            cats_object = (cached && cached.value && cached.value.cats) ? cached.value.cats : {};
            } else {
	            cats_object = cats;
            }

            _this.votes = wot.select_voted(cats_object);
            _this.markup_voted();
        },

        destroy: function () {
            // destroys the selector
            var _rw = wot.ratingwindow,
                _this = _rw.cat_selector;

            if (_this.inited) {
                _this.votes = {};
                _this.$_cat_selector.children().detach();
                _this.inited = false;
            }
        },

        activate_submenu: function(elem) {
            var menu = $(".dropdown-menu");
            var category_title = $(".category-title");
            var $_external_container = $("#categories-selection-area");
            var selected_elem = $(elem);
            var sub_menu = selected_elem.find(".popover");

            selected_elem.addClass("maintainHover");

            var left_distance = 162; //menu.outerWidth() + (menu.offset().left - $_external_container.offset().left);
            var top_distance = 10;//menu.offset().top;

            //TO DO: what if user changes category manully.

            // Show the submenu
            sub_menu.css({
                top: top_distance,
                left: left_distance  // main should overlay submenu
            }).show();
        },

        deactivate_all: function () {
            var _this = wot.ratingwindow.cat_selector;
            $(".category-selector .maintainHover").each(function(i, elem){
                _this.deactivate_submenu(elem);
            });
        },

        deactivate_submenu: function(elem) {
            var selected_elem = $(elem);
            var sub_menu = selected_elem.find(".popover");
            sub_menu.hide();
            selected_elem.removeClass("maintainHover");
        },

        _calc_vote_result: function (vs, vy, vn, dynamic, vc) {
            // Calculates the resulting vote depending on what was clicked and current vote state
            var fy = vy * Math.min(vy, vy - vs);
            var fn = vn * Math.max(-1, -vn - vs);
	        var fc = 0;

	        if (vc) {
		        if (dynamic) {
			        fc = vs < 0 ? 0 : -1;
		        } else {
			        fc = vs != 1 ? 1 : 0;
		        }
	        }

//            var fc = vc * ((vs + 2) % 3 - 1);
            return fy + fn + fc;
        },

        vote: function(event) {
            // Sets attr "voted" on categories tags
            var _this = wot.ratingwindow.cat_selector,
                $_clicked = $(this),
                $_current_cat = $_clicked.closest(".category").first(),
                currently_voted = $_current_cat.attr("voted"),
                cat_id = $_current_cat.attr("data-cat"),
                $_cats = $(".category[data-cat="+cat_id+"]");

            event.stopPropagation();    // don't bubble the event (causes undesired effects)

            var vy = $_clicked.hasClass("cat-vote-left") ? 1 : 0;      // clicked Yes
            var vn = $_clicked.hasClass("cat-vote-right") ? 1 : 0;     // clicked No
            var vc = $_clicked.hasClass("category") ? 1 : 0;          // Clicked Category line
            var vd = $_clicked.closest(".category").hasClass("dynamic") ? 1 : 0;       // Clicked "delete" vote
            var vs = currently_voted ? parseInt(currently_voted) : 0; // current vote state for the clicked category
            var new_vote = _this._calc_vote_result(vs, vy, vn, vd, vc);

            if (new_vote != 0) {
                $_cats.attr("voted", new_vote);
                _this.votes[cat_id] = wot.get_category(cat_id);
                _this.votes[cat_id].v = new_vote;
            } else {
                $_cats.removeAttr("voted");
                if (_this.votes[cat_id]) delete _this.votes[cat_id];
            }

            var is_illogical = _this.calc_illogicality();
	        _this.warn_illogicality(is_illogical);  // set or remove warning about wrong categories choice

	        wot.ratingwindow.update_submit_button(null, is_illogical); // enable/disable "Save" button
        },

	    calc_illogicality: function () {
		    var _this = wot.ratingwindow.cat_selector,
		        user_votes = _this.get_user_votes(true),    // get user votes as an object
			    warns = {},
			    upvoted = 0;

		    _this.is_illogical = false;

		    for (var cat1 in user_votes) {
			    if (!user_votes.hasOwnProperty(cat1) || user_votes[cat1] != 1) continue;
			    upvoted++;
			    for (var cat2 in user_votes) {
				    if (!user_votes.hasOwnProperty(cat2) || user_votes[cat2] != 1) continue;
				    if (wot.cat_combinations[cat1] && wot.cat_combinations[cat1][cat2]) {
					    warns[wot.cat_combinations[cat1][cat2]] = true;
				    }
			    }
		    }

		    if (upvoted > _this.MAX_UPVOTED_BEFORE_WARN) {
			    warns["6a"] = true;
		    } else {
			    delete warns["6a"];
		    }

		    // now take the most important warning according to defined priorities
		    for (var p = 0; p < wot.cat_combinations_prio.length; p++) {
			    if (warns[wot.cat_combinations_prio[p]]) {
				    _this.is_illogical = wot.cat_combinations_prio[p];
				    break;
			    }
		    }

		    return _this.is_illogical;
	    },

	    warn_illogicality: function (warning) {

		    var warn_text = wot.i18n("ratingwindow", "check_"+String(warning));

		    if (warning && !warn_text) return; // do nothing if there is no warning text

		    var _this = wot.ratingwindow.cat_selector,
			    $_category_title = $(".category-title"),
			    $_cat_description = $(".category-description"),
			    previously_warned = $_cat_description.hasClass("warning");

		    _this.$_cat_selector.closest(".category-selector").toggleClass("warning", !!warning);
		    $_cat_description.toggleClass("warning", !!warning);
		    $("#btn-submit").toggleClass("warning", !!warning);

		    if (warning) {
			    $_category_title.hide(0, function () {
				    $_cat_description.text(warn_text);
				    $_cat_description.show();
			    });
		    } else {
			    if (previously_warned) {
				    $_cat_description.hide(0, function () {
					    $_category_title.show();
				    });
			    }
		    }
	    }
    }, /* end of cat_selector {} */

    /* Start of Comments API and Comments UI code */
    comments: {
        allow_commenting: true,
        is_banned: false,
        captcha_required: false,
        MIN_LIMIT: 30,
        MIN_LIMIT_WG: 10,
	    MIN_TAGS: 1,        // minimal amount of tags in the comment
	    MAX_TAGS: 10,       // maximum amount of tags in the comment
        MAX_LIMIT: 20000,
        posted_comment: {},

	    caret_left: null,
		caret_top: null,
		caret_bottom: null,
	    AUTOCOMPLETE_OFFSET_X: -20,

	    get_comment_value: function (need_html) {
		    var $elem = $("#user-comment"),
			    s = need_html ? $elem.html() : $elem.get(0).innerText; // this is different in FF

		    s = typeof(s) == "string" ? s.trim() : "";

		    return s;
	    },

		set_comment: function (text) {
			$("#user-comment").get(0).innerText = text;
		},

        is_commented: function() {
            // comment can be there, but it can be invalid (outside of limits restrictions, etc)
            return (wot.ratingwindow.comments.get_comment_value().length > 0);
        },

	    is_changed: function () {
		    var rw = wot.ratingwindow,
			    _this = rw.comments,
			    cached = rw.getcached(),
			    prev_comment = "",
			    current_comment = _this.get_comment_value();

		    prev_comment = (cached.comment && cached.comment.comment) ? cached.comment.comment : "";

		    return current_comment != prev_comment;
		},

        get_comment: function (target) {
            var bg = wot.ratingwindow.get_bg(),
                bgwot = bg.wot;

//            bg.console.log("RW: wot.ratingwindow.comments.get_comment(target)", target);

            bgwot.api.comments.get(target);
        },

        remove_comment: function () {
            // TODO: to be implemented when there will be a button "remove the comment" in UI
        },

	    get_minlen: function (is_wg) {
		    var _this = wot.ratingwindow.comments;
		    return is_wg ? _this.MIN_LIMIT_WG : _this.MIN_LIMIT;
	    },

	    get_maxlen: function (is_wg) {
		    var _this = wot.ratingwindow.comments;
		    return _this.MAX_LIMIT;
	    },

        update_hint: function () {
	        // shows / hides a error hint if comment parameters don't fit our requirements
            var rw = wot.ratingwindow,
                _this = rw.comments,
                $_hint = $("#comment-bottom-hint"),
	            is_wg = wot.ratingwindow.modes.is_current("wgcomment") || rw.is_wg_allowed,
	            is_wg_mode = wot.ratingwindow.modes.is_current("wgcomment"),
	            len = _this.get_comment_value().length,
                error_text = 0,
	            errors = [],
                cls = "";

	        var _wg = rw.wg,
		        tags = rw.is_wg_allowed ? _wg.get_tags() : [],    // count tags only if WG is enabled for the user
		        tags_num = tags.length,
		        valid_tagged = rw.is_wg_allowed && tags_num >= _this.MIN_TAGS;

	        var min_len = _this.get_minlen(valid_tagged),
		        max_len = _this.get_maxlen(valid_tagged);

	        errors.push({ text: error_text, cls: cls });    // initial "no errors" state

			if (len > 0 && len < min_len) {
	            errors.push({
		            text: String(len - min_len).replace("-", "&#8211; "), // readability is our everything
		            cls: "error min"
	            });
            } else if (len > max_len) {
	            errors.push({
		            text: len - max_len,
		            cls: "error max"
	            });
            }

	        // in WG comment mode we check number of hashtags first
	        if (is_wg_mode && len > 0) {
		        if (tags_num < _this.MIN_TAGS) {
			        errors.push({
				        text: "&#8211; " + String(_this.MIN_TAGS - tags_num) + " #",
				        cls: "error min"
			        });
		        } else if (tags_num > _this.MAX_TAGS) {
			        errors.push({
				        text: "> " + String(tags_num - _this.MIN_TAGS) + " #",
				        cls: "error max"
			        });
		        }
	        }

            var err_to_show = errors.slice(-1)[0]; // take the last error to show
	        $_hint.attr("class", err_to_show.cls).html(err_to_show.text);
        },

        update_button: function (mode, enabled) {
            var _this = wot.ratingwindow.comments,
                $_button = $("#btn-comment");

            $_button.toggleClass("disabled", !(enabled && _this.allow_commenting)); // take into account other restrictions like "banned"

            switch (mode) {
                case "rate":
                    if (_this.is_commented()) {
                        $_button.text(wot.i18n("ratingwindow", "editcomment"));
                    } else {
                        $_button.text(wot.i18n("ratingwindow", "addcomment"));
                    }

                    break;
                case "comment":
                    if (wot.ratingwindow.has_1upvote()) {
                        $_button.text(wot.i18n("ratingwindow", "backtoratings"));
                    } else {
                        $_button.text(wot.i18n("ratingwindow", "backtoratings_category"));
                    }
                    break;
            }

            $_button.toggle(!_this.is_banned);  // don't show this button to banned users
        },

        has_valid_comment: function () {
            var _this = wot.ratingwindow.comments,
	            _wg = wot.ratingwindow.wg,
	            is_wgcommenting = wot.ratingwindow.is_wg_allowed,
	            comment = _this.get_comment_value(),
	            minlen = _this.get_minlen(false),
	            minlen_withtags = _this.get_minlen(true),
	            maxlen = _this.get_maxlen(false),
	            maxlen_withtags = _this.get_maxlen(true);

	        if (is_wgcommenting) {
		        var tags = _wg.get_tags(comment);

		        if (tags.length) {
			        return (comment.length >= minlen_withtags &&
				        comment.length < maxlen_withtags &&
				        tags.length >= _this.MIN_TAGS &&
				        tags.length <= _this.MAX_TAGS);
		        }
	        }

	        // testing only length of text
	        return (comment.length >= minlen && comment.length < maxlen);
        },

        focus: function () {
	        setTimeout(function(){
		        $("#user-comment").get(0).focus();
	        }, 200);
        },

        show_normal_hint: function () {
            $("#comment-register").hide();
            $("#comment-captcha").hide();
            $("#comment-side-hint").show();
            $("#user-comment").removeClass("warning").attr("disabled", null);
        },

        show_register_invitation: function () {
            $("#comment-side-hint").hide();
            $("#user-comment").addClass("warning");
            $("#comment-register").show();
        },

        show_captcha_invitation: function () {
            $("#comment-side-hint").hide();
            $("#user-comment").addClass("warning").attr("disabled", "1");
            $("#comment-captcha").show();
        },

	    update_caret: function (event, element) {
		    var _this = wot.ratingwindow.comments,
			    sel = window.getSelection(),
			    range = sel.getRangeAt(0);

		    if (!range) {
			    _this.caret_top = null;
			    _this.caret_left = null;
			    return;
		    }

		    var cr = range.getClientRects();

		    if (!cr || !cr[0] || cr[0].width !== 0) {   // width == 0 means there is no selected text but only caret position
			    _this.caret_top = null;
			    _this.caret_left = null;
			    return;
		    }

		    _this.caret_left = cr[0].left;
		    _this.caret_top = cr[0].top;// - parent.offsetTop + b.top;
		    _this.caret_bottom = cr[0].bottom;// - parent.offsetTop + b.top;
	    },

	    on_paste: function (e) {
		    // Use custom paste handler to get plain text content from clipboard and paste it to the current position
		    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
		    e.preventDefault();
	    }
    },

	wg: {   // WOT Groups functionality

		init_handlers: function () {
			var rw = wot.ratingwindow,
				_this = rw.wg;

			$(document).on("click", ".wg-tag", _this.navigate_tag);

			$("#wg-change, #wg-addmore").on("click", function (e) {
				rw.modes.wgcomment.activate();
			});

			$("#wg-about").on("click", function (e) {
				rw.modes.wg_about.activate();
			});

			$("#wg-about-ok").on("click", function (e) {
				rw.modes.auto();
			});

			$("#wg-about-learnmore").on("click", function (e) {
				rw.navigate(wot.urls.wg_about, wot.urls.contexts.wg_about_learnmore)
			});

			$("#wg-expander")
				.on("click", function () {
					var $this = $(this);

					if (wot.ratingwindow.modes.current_mode != "wgexpanded") {
						$this.data("prev-mode", wot.ratingwindow.modes.current_mode);
						rw.modes.wgexpanded.activate();
					} else {
						rw.modes[$this.data("prev-mode")].activate(true);
					}

				});

			$(document).on("mouseenter", ".wg-tag.info", _this.on_info_tag_hover);
			$(document).on("mouseleave", ".wg-tag.info", _this.on_info_tag_leave);
			$(document).on("mouseenter", "#wg-viewer", _this.on_wgviewer_hover);
			$(document).on("mouseleave", "#wg-viewer", _this.on_wgviewer_leave);

		},

		get_tags: function (text) {
			var _comments = wot.ratingwindow.comments;
			text = text ? text : _comments.get_comment_value();

			return wot.tags.get_tags(text);
		},

		get_all_my_tags: function () {
			// returns all user's tags

			var rw = wot.ratingwindow,
				bgwot = rw.get_bg("wot");

			return bgwot.core.tags.mytags.map(function(item){
				// update the "index" value of the tag (make it normalized)
				item.value_indx = String(item.value).toLocaleLowerCase();
				return item;
			});
		},

		get_popular_tags: function () {

			var rw = wot.ratingwindow,
				bgwot = rw.get_bg("wot");

			return bgwot.core.tags.popular_tags.map(function(item){
				// update the "index" value of the tag (make it normalized)
				item.value_indx = String(item.value).toLocaleLowerCase();
				return item;
			});
		},

		update_mytags: function (force) {
			var rw = wot.ratingwindow,
				bgwot = rw.get_bg("wot");

			if (!force &&
				bgwot.core.tags.mytags_updated !== null &&
				bgwot.core.tags.MYTAGS_UPD_INTERVAL + bgwot.core.tags.mytags_updated > Date.now()) {
				return false;
			}

			bgwot.api.tags.my.get_tags();
		},

		update_popular_tags: function (force) {
			var rw = wot.ratingwindow,
				bgwot = rw.get_bg("wot");

			if (!force &&
				bgwot.core.tags.popular_tags_updated !== null &&
				bgwot.core.tags.POPULARTAGS_UPD_INTERVAL + bgwot.core.tags.popular_tags_updated > Date.now()) {
				return false;
			}

			bgwot.api.tags.popular.get_tags();
		},

		is_group: function (tag) {
			var _this = wot.ratingwindow.wg,
				popular_groups = _this.get_popular_tags(),
				res = popular_groups.filter(function(item){
					if (item.value_indx == tag.toLocaleLowerCase()) return true;
				});

			return res.length > 0;
		},

		is_mytag: function (tag) {
			var _this = wot.ratingwindow.wg,
				tags = _this.get_tags(),
				res = tags.filter(function(item){
					if (item.value_indx == tag.toLocaleLowerCase()) return true;
				});

			return res.length > 0;
		},

		get_info: function (tag_value) {
//			var infos = {
//				"drupal": {
//					info: "http://en.m.wikipedia.org/wiki/Drupal"
//				},
//				"programming": {
//					info: "http://en.m.wikipedia.org/wiki/Computer_programming"
//				},
//				"finland": {
//					info: "http://en.m.wikipedia.org/wiki/Finland"
//				},
//				"php": {
//					info: "http://en.m.wikipedia.org/wiki/Php"
//				},
//				"javascript": {
//					info: "http://en.m.wikipedia.org/wiki/Javascript"
//				},
//				"jquery": {
//					info: "http://en.m.wikipedia.org/wiki/Jquery"
//				},
//				"opensource": {
//					info: "http://en.m.wikipedia.org/wiki/Opensource"
//				},
//				"html": {
//					info: "http://en.m.wikipedia.org/wiki/Html"
//				},
//				"ransomeware": {
//					info: "http://en.m.wikipedia.org/wiki/Ransomware_(malware)"
//				},
//				"lapsi": {
//					info: "http://en.m.wikipedia.org/wiki/Lapsi"
//				},
//				"cycling": {
//					info: "http://en.m.wikipedia.org/wiki/Cycling"
//				}
//
//			};
//
//			var ltag = tag_value ? tag_value.trim().toLowerCase() : null;
//
//			if (ltag) {
//				return infos[ltag];
//			}

			return null;
		},

		navigate_tag: function (e) {
			var _rw = wot.ratingwindow,
				tag_text = $(this).text();

			_rw.navigate(wot.urls.wg + "?query=" + tag_text, wot.urls.contexts.wg_tag);
		},

		on_info_tag_hover: function (e) {

			var rw = wot.ratingwindow;

			if (rw.wg_viewer_timer) {
				window.clearTimeout(rw.wg_viewer_timer);
			}

			if (rw.wg_infotag_timer) window.clearTimeout(rw.wg_infotag_timer);

			var $this = $(this);

			rw.wg_infotag_timer = window.setTimeout(function() {
				var $wgviewer = $("#wg-viewer"), $viewer_frame = $("#wg-viewer-frame");
				var info = $this.data("wg-info");

				$viewer_frame.attr("src", info);

				$wgviewer.show();

				$viewer_frame
					.toggleClass("mini", !$viewer_frame.hasClass("shown"))
					.show({ duration: 0, complete: function () {
						setTimeout(function (){
							$viewer_frame
								.removeClass("mini")
								.addClass("shown");

						}, 200);
					} });
			}, 1000);   // wait a bit to avoid unnecessary showing

		},

		on_info_tag_leave: function () {

			var rw = wot.ratingwindow;

			if (rw.wg_viewer_timer) {
				window.clearTimeout(rw.wg_viewer_timer);
			}

			if (rw.wg_infotag_timer) window.clearTimeout(rw.wg_infotag_timer);

			rw.wg_viewer_timer = window.setTimeout(function (){
				$("#wg-viewer").hide();
				$("#wg-viewer-frame").removeClass("mini shown");
			}, 300);
		},

		on_wgviewer_hover: function () {
			if (wot.ratingwindow.wg_viewer_timer) {
				window.clearTimeout(wot.ratingwindow.wg_viewer_timer);
			}
		},

		on_wgviewer_leave: function () {
			if (wot.ratingwindow.wg_viewer_timer) {
				window.clearTimeout(wot.ratingwindow.wg_viewer_timer);
			}

			wot.ratingwindow.wg_viewer_timer = window.setTimeout(function (){
				$("#wg-viewer").hide();
				$("#wg-viewer-frame").removeClass("mini shown");
			}, 300);
		},

		update_wg_visibility: function () {
			var _this = wot.ratingwindow,
				$rw = $("#wot-ratingwindow"),
				$wg_area = $("#wg-area");

			$rw.toggleClass("wg", _this.is_wg_allowed);

			if (_this.is_wg_allowed) {
				var visible = !$rw.hasClass("commenting") && !$rw.hasClass("thanks") && !$rw.hasClass("rate");
				$wg_area.toggle(visible);
			} else {
				$wg_area.hide();
			}
		},

		suggest_tags: function () {
			// autocomplete feature for WG comment
			// TODO: enable only if WG is enabled

			var rw = wot.ratingwindow,
				_wg = rw.wg,
				tags_ac = [];

			if (rw.is_wg_allowed) {

				var mytags = _wg.get_all_my_tags(),
					popular_tags = _wg.get_popular_tags();

				// make a tag list from tags assigned to the website
				tags_ac = rw.tags.map(function(item){
					return item.value;
				});

				// add all user's tags if they are not in the list yet
				tags_ac = tags_ac
					.concat(
						mytags
							.map(function(item){
								return item.value;
							})
							.filter(function (el, index, arr) {
								return (tags_ac.indexOf(el) < 0);
							}));

				// then add all popular tags if they are not in the list yet (this is why this concat is separated from above)
				tags_ac = tags_ac
					.concat(
						popular_tags
							.map(function(item){
								return item.value;
							})
							.filter(function (el, index, arr) {
								return (tags_ac.indexOf(el) < 0);
							})
					);

//				tags_ac.sort();

				tags_ac = tags_ac.map(function (item) { return "#" + item });  // prepend with # char since it is required by the autocomplete feature

//			console.log(tags_ac);
			}

			return tags_ac;
		},

		update_wg_tags: function () {
			var rw = wot.ratingwindow,
				_wg = rw.wg,
				mytags = _wg.get_tags(),    // get list of user tags for the current website
				$tags = $("#wg-tags"),
				tagmap = [
					{ list: mytags },
					{ list: rw.tags, group: true }
				],
				has_tags = 0,
				prev = {};

			$tags.empty();  // clean the tags' section

			for (var i = 0; i < tagmap.length; i++) {
				var list = tagmap[i].list;

				for (var j = 0; j < list.length; j++) {

					var $tag, info,
						tag = list[j],
						tag_value = tag.value,
						tag_value_indx = tag_value.toLocaleLowerCase();

					if (prev[tag_value_indx]) continue;  // don't show one tag more than one time (if it was in mytags list)

					$tag = $("<li></li>")
						.addClass("wg-tag")
						.toggleClass("group", tagmap[i].group || _wg.is_group(tag_value))
						.toggleClass("mytag", _wg.is_mytag(tag_value));

					info = _wg.get_info(tag_value);

					if (info) {
						// this is a group with additional info linked
						var $tag_inner = $("<span></span>");
						$tag_inner.text(tag_value);
						$tag
							.append($tag_inner)
							.addClass("info")
							.data("wg-info", info.info);

					} else {
						$tag.text(tag_value);   // this is generic tag/group
					}


					$tags.append($tag);
					prev[tag_value_indx] = true;         // remember that we showed the tag
				}

			}

			has_tags = $tags.children().length > 0;

			var $wg_edit = $("#wg-change"),
				$wg_addmore = $("#wg-addmore");

			$wg_edit.text( mytags.length > 0 ? wot.i18n("wg", "edit") : wot.i18n("wg", "add") );
			$wg_addmore.toggleClass("hidden", has_tags);
			$tags.toggle(has_tags);

			var e_tags = $tags.get(0);
			var is_partially = e_tags && e_tags.scrollHeight > e_tags.clientHeight; // test whether there are tags that don't fit

			$("#wg-expander").toggleClass("hidden", !is_partially);
		},

		show_tagautocomplete: function () {

			var _comments = wot.ratingwindow.comments;

			var top, left,
				pos = this.$element.position(),
				area_height = this.$element[0].offsetHeight,
				area_width = this.$element[0].offsetWidth;

			if (_comments.caret_left == null || _comments.caret_bottom == null) {
				top = pos.top;
				left = pos.left;
			} else {
				top = _comments.caret_bottom;
				left = _comments.caret_left + _comments.AUTOCOMPLETE_OFFSET_X;

				// TODO: ajust the position on the edges
			}

			this.$menu
				.appendTo('body')
				.show()
				.css({
					position: "absolute",
					top: "99999px",
					left: "99999px"
				});

			// adjust position and avoid going beyond the right and bottom edges of the text area
			var popup_height = this.$menu.height(),
				popup_width = this.$menu.width();

			if (left + popup_width > pos.left + area_width) {
				left = pos.left + area_width - popup_width;
			}

			if (top + popup_height > pos.top + area_height) {
				top = _comments.caret_top - popup_height - 20;
			}

			this.$menu.css({
				top: top + "px",
				left: left + "px"
			});

			this.shown = true;
			return this;
		}
	}   // End of wg object

}});

// Remove this part in Firefox when merging the code
$(document).ready(function() {
    wot.ratingwindow.onload();
});
