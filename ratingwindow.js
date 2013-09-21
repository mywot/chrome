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
    MAX_VOTED_VISIBLE: 4,   // how many voted categories we can show in one line
	sliderwidth: 154,
    slider_shift: -4,       // ajustment
    opened_time: null,
    was_in_ratemode: false,
    timer_save_button: null,
    state: {},  // rating state
    local_comment: null,
    is_registered: false,   // whether user has an account on mywot.com
    delete_action: false,   // remembers whether user is deleting rating
    prefs: {},  // shortcut for background preferences
    UPDATE_ROUND: 2,        // = 2 version when we launched WOT 2.0 in September 2013

    get_bg: function () {
        // just a shortcut
        return chrome.extension.getBackgroundPage();
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
        /* initialize on target change */
        if (this.state.target != target) {
            this.finishstate(false);
            this.state = { target: target, down: -1 };
            this.comments.set_comment("");  // reset comment field
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
        this.state = $.extend(state, this.state);
        this.cat_selector.init_voted(); // re-build user votes
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
                user_comment = $("#user-comment").val().trim(),
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

            if (bgwot.core.unseenmessage()) {
                bgwot.prefs.set("last_message", bg.wot.core.usermessage.id);
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

//            bg.console.log("testimonies_changed:", testimonies_changed);
//            bg.console.log("comment_changed:", comment_changed);
//            bg.console.log("is_rated:", is_rated);
//            bg.console.log("has_comment:", has_comment);

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
                } else {
                    bgwot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_TESTIMONY_DEL, submission_mode);
                }

            } else {
//                bg.console.log("No testimonies & votes to submit them. Ignored.");
            }

            if (unload) {  // RW was closed by browser (not by clicking "Save")
//                bg.console.log("RW triggered finish state during Unload");

                if (comment_changed) {
//                    bg.console.log("The comment seems to be changed");
                    // when comment body is changed, we might want to store it locally
                    bgwot.keeper.save_comment(target, user_comment, user_comment_id, votes, wot.keeper.STATUSES.LOCAL);
                    bgwot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_COMMENTKEPT);
                }

            } else { // User clicked Save
                // TODO: make it so, that if votes were changed and user have seen the comment, then submit the comment
                if (comment_changed && has_up_votes) {
                    // Comment should be submitted, if (either comment OR categories votes were changed) AND at least one up vote is given
                    if (has_comment) {
//                        bg.console.log("SUBMIT COMMENT");

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
//                        bg.console.log("REMOVE COMMENT");
                            bgwot.keeper.remove_comment(target);
                            if (rw.is_registered) {
                                bgwot.api.comments.remove(target);
                                bgwot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_COMMENTREMOVED);
                            }
                        }
                    }
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

    current: {},

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
            visible_hostname = bg.wot.url.decodehostname(normalized_target);
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
        var $_wot_message = $("#wot-message");
        // if we have something to tell a user
        if (msg.text) {
            var status = msg.type || "";
            $("#wot-message-text")
                .attr("url", msg.url || "")
                .attr("status", status)
                .text(msg.text);

            $_wot_message.attr("status", status).attr("msg_id", msg.id).show();
        } else {
            $_wot_message.hide();
        }

        /* content for user (messages / communications) */
        $(".wot-user").hide();

        // TODO: rewrite below: use activity score stored in Prefs instead.
        var index = 0,
            item = (bg.wot.core.usercontent && bg.wot.core.usercontent.length > 0) ? bg.wot.core.usercontent[0] : {},
            user_header = wot.i18n("activityscore","text"),
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

        $("#wot-user-0-header").text(wot.i18n("activityscore", "text"));
        $("#user-activityscore").text(user_as);

        $(".thanks-activityscore-text").text(user_header); // on the "Thank you" screen
        $(".thanks-activityscore-number").text(user_as);   // on the "Thank you" screen
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

            if (this.current.target && cached.status == wot.cachestatus.ok && cached.value) {
                var cats = cached.value.cats;
                if (cats != null) {
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
                var _rw = wot.ratingwindow;
                try {
                    if (tab.id == target.id) {

                        // TODO: check whether target is changed. If not, then don't update
                        /* update current rating state */
                        _rw.updatestate(data.target, data.cached); //_rw.getcached()

                        _rw.current = data || {};
                        _rw.updatecontents();
                        _rw.update_categories();

                        if (_rw.is_registered) {
                            // ask server if there is my comment for the website
                            _rw.comments.get_comment(data.target);
                        } else {
                            var bg = chrome.extension.getBackgroundPage();
                            bg.wot.core.update_ratingwindow_comment(); // don't allow unregistered addons to comment
                        }

                        _rw.modes.reset();
                        _rw.modes.auto();
                    }
                } catch (e) {
                    console.log("ratingwindow.update: failed with ", e);
                }
            });
        });
    },

    update_comment: function (cached, local_comment, captcha_required) {
        wot.log("update_comment()", cached);

        var _rw = wot.ratingwindow,
            _comments = wot.ratingwindow.comments,
            data = {},
            bg = chrome.extension.getBackgroundPage(),
            is_unsubmitted = false;

        _rw.current.cached = cached;    // update current cached state
        _rw.local_comment = local_comment;  // keep locally stored comment

        if (cached && cached.comment) {
            data = cached.comment;
            _rw.comments.captcha_required = captcha_required || false;
        }

        var error_code = data.error_code || 0;

        _comments.allow_commenting = ([
            wot.comments.error_codes.AUTHENTICATION_FAILED,
            wot.comments.error_codes.COMMENT_NOT_ALLOWED,
            wot.comments.error_codes.IS_BANNED
        ].indexOf(error_code) < 0); // if none of these codes are found

        _comments.is_banned = (error_code == wot.comments.error_codes.IS_BANNED);

        // If there is a locally stored comment, use it if it's newer than server-stored one
        if (local_comment && !wot.utils.isEmptyObject(local_comment)) {

            // If server-side comment is newer, than drop locally stored one
            if (local_comment.timestamp && data.timestamp && data.timestamp >= local_comment.timestamp) {
                // Remove a comment from keeper
                bg.wot.keeper.remove_comment(local_comment.target);
                _rw.local_comment = null;
            } else {
                data.comment = local_comment.comment;
                data.timestamp = local_comment.timestamp;
                data.wcid = data.wcid === undefined ? 0 : data.wcid;
                is_unsubmitted = true;
            }
        }

        // check whether comment exists: "comment" should not be empty, and wcid should not be null (but it can be zero)
        if (data && data.comment && data.wcid !== undefined) {
            _comments.posted_comment = data;
            _comments.set_comment(data.comment);
            $("#rated-votes").addClass("commented");

            // switch to commenting mode if we have unfinished comment
            if (is_unsubmitted) {
                _rw.modes.comment.activate();
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
            }
        }

        _comments.update_button(_rw.modes.current_mode, _comments.allow_commenting && !_comments.is_banned);
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
            { selector: "#wot-header-link-profile", text: wot.i18n("ratingwindow", "profile") },
            { selector: "#wot-title-text",          text: wot.i18n("messages", "initializing") },
            { selector: "#wot-rating-header-wot",   text: wot.i18n("ratingwindow", "wotrating") },
            { selector: "#wot-rating-header-my",    text: wot.i18n("ratingwindow", "myrating") },
            { selector: "#wot-scorecard-visit",     text: wot.i18n("ratingwindow", "viewscorecard") },
            { selector: "#wot-scorecard-comment",   text: wot.i18n("ratingwindow", "addcomment") },
//            { selector: "#wot-partner-text",        text: wot.i18n("ratingwindow", "inpartnership") },
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
            { selector: "#comment-side-hint",       html: wot.i18n("ratingwindow", "commenthints") },
            { selector: ".thanks-text",             text: wot.i18n("ratingwindow", "thankyou") },
            { selector: "#comment-register-text",   text: wot.i18n("ratingwindow", "comment_regtext") },
            { selector: "#comment-register-link",   text: wot.i18n("ratingwindow", "comment_register") },
            { selector: "#comment-captcha-text",   text: wot.i18n("ratingwindow", "comment_captchatext") },
            { selector: "#comment-captcha-link",   text: wot.i18n("ratingwindow", "comment_captchalink") }

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

        $_hand.addClass(vote == 1 ? "hand-up" : "hand-down");
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

        // 1. Either TR or CS are rated, OR none of them are rated (e.g. "delete my ratings")
        for (i in wot.components) {
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

        return passed;
    },

    update_submit_button: function (enable) {
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

            // If user wants to delete ratings, change the text of the button and hide "Delete ratings" button
            if (enable && !_rw.is_rated(_rw.state) && !_rw.comments.has_valid_comment()) {
                $_submit.text(wot.i18n("testimony", "delete"));
                $("#btn-delete").hide();
                delete_action = true; // remember the reverse of the label
            }
        }

        if (!delete_action) {
            $_submit.text(wot.i18n("buttons", "save"));
            $("#btn-delete").show();
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

        var first_opening = !_rw.prefs.get(wot.engage_settings.invite_to_rw.pref_name);

        wot.init_categories(_rw.prefs);

        _rw.is_registered = bg.wot.core.is_level("registered");

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
                wot.ratingwindow.navigate(wurls.base, wurls.contexts.rwlogo);
            }
        });

        $_wot_header_logo.bind("dblclick", function(event) {
            if (event.shiftKey) {
                wot.ratingwindow.navigate(chrome.extension.getURL("/settings.html"), wurls.contexts.rwlogo);
            }
        });

        $("#wot-header-link-settings").bind("click", function() {
            wot.ratingwindow.navigate(wurls.settings, wurls.contexts.rwsettings);
        });

        $("#wot-header-link-profile").bind("click", function() {
            wot.ratingwindow.navigate(wurls.profile, wurls.contexts.rwprofile);
        });

        $("#wot-header-link-guide").bind("click", function() {
            wot.ratingwindow.navigate(wurls.tour, wurls.contexts.rwguide);
        });

        $("#wot-header-link-forum").bind("click", function() {
            wot.ratingwindow.navigate(wurls.base + "forum", wurls.contexts.rwforum);
        });

        $("#wot-header-close").bind("click", function() {
            bg.wot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_BTN_CLOSE);
            _rw.hide();
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

        $(".rating-delete-icon, .rating-deletelabel").bind("click", _rw.rate_control.on_remove);

        $("#user-comment").bind("change keyup", function() {
            window.setTimeout(function(){
                wot.ratingwindow.comments.update_hint();

                // set the timeout to update save button when user stops typing the comment
                if (wot.ratingwindow.timer_save_button) {
                    window.clearTimeout(wot.ratingwindow.timer_save_button);
                }
                wot.ratingwindow.timer_save_button = window.setTimeout(wot.ratingwindow.update_submit_button, 200);

            }, 20);    // to react on any keyboard event after the text was changed
        });

        // Rate mode event handlers
        $("#btn-comment").bind("click", _rw.on_comment_button);
        $("#btn-submit").bind("click", _rw.on_submit);
        $("#btn-thanks-ok").bind("click", _rw.on_thanks_ok);
        $("#btn-cancel").bind("click", _rw.on_cancel);
        $("#btn-delete").bind("click", _rw.on_delete_button);
        $("#change-ratings, #voted-categories-content").bind("click", _rw.on_change_ratings);


        $("#comment-register-link").bind("click", function() {
            wot.ratingwindow.navigate(wurls.signup, wurls.contexts.rwcommreg);
        });

        $("#comment-captcha-link").bind("click", function() {
            if (wot.ratingwindow.current.target) {
                wot.ratingwindow.navigate(wot.urls.scorecard +
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

		var tts_wtip =  (first_opening || wot.firstrunupdate == _rw.UPDATE_ROUND) &&
						!(wt.settings.rw_ok || wt.settings.rw_shown > 0) &&
						wot.is_defined(["rw_text", "rw_text_hdr"], "wt");

//		tts_wtip = tts_wtip && (wot.get_activity_score() < bg.wot.wt.activity_score_max || wot.firstrunupdate == _rw.UPDATE_ROUND);

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

        // increment "RatingWindow shown" counter
        _rw.count_window_opened();
        bg.wot.core.badge.text = "";
        bg.wot.core.badge.type = null;

        // shown RatingWindow means that we shown a message => remove notice badge from the button
        // this was commented on 24.06.2013 to avoid concurrent changing of the badge
//        if (bg.wot.core.badge_status && bg.wot.core.badge_status.type == wot.badge_types.notice.type) {
//            bg.wot.core.set_badge(null, false);   // hide badge
//        }
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

        var _rw = wot.ratingwindow;
        wot.ratingwindow.finishstate(false);
        if (_rw.delete_action) {
            _rw.modes.auto();   // switch RW mode according to current state
        } else {
            _rw.modes.thanks.activate();
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
                var cached = _rw.getcached();
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
                    elems.helptext.text(helptext).show();
                    elems.helptext.attr("r", rep);
                } else {
                    elems.helptext.hide();
                }
            });

            _rw.update_submit_button();
        }
    },

    /* Modes are only visual helpers to render proper content in the Rating Window */
    modes: {

        current_mode: "",

        unrated: {
            visible: ["#reputation-info", "#user-communication", ".user-comm-social"],
            invisible: ["#rate-buttons", "#categories-selection-area", "#rated-votes",
                "#commenting-area", "#thanks-area", "#ok-button"],
            addclass: "view-mode unrated",
            removeclass: "rated commenting thanks rate",

            activate: function () {
                if (!wot.ratingwindow.modes._activate("unrated")) return false;
                return true;
            }
        },

        rated: {
            visible: ["#reputation-info", "#user-communication", "#rated-votes", ".user-comm-social"],
            invisible: ["#rate-buttons", "#categories-selection-area",
                "#commenting-area", "#thanks-area", "#ok-button"],
            addclass: "view-mode rated",
            removeclass: "unrated commenting thanks rate",

            activate: function () {
                if (!wot.ratingwindow.modes._activate("rated")) return false;
                wot.ratingwindow.update_uservoted();
                return true;
            }
        },

        rate: {
            visible: ["#rate-buttons", "#categories-selection-area"],
            invisible: ["#reputation-info", "#user-communication", "#rated-votes",
                "#commenting-area", "#thanks-area", "#ok-button"],
            addclass: "rate",
            removeclass: "view-mode rated unrated commenting thanks",

            activate: function () {
                var _rw = wot.ratingwindow,
                    prev_mode = _rw.modes.current_mode;

                if (!_rw.modes._activate("rate")) return false;

                // "Comment" mode can be the first active mode in session, so we have to init things still.
                if (prev_mode != "comment" || !_rw.cat_selector.inited) {
                    if (!_rw.cat_selector.inited) {
                        _rw.cat_selector.build();
                        _rw.cat_selector.init();
                    }
                    _rw.cat_selector.init_voted();
                    _rw.update_catsel_state();  // update the category selector with current state
                }

                _rw.update_submit_button();
                _rw.comments.update_button("rate", true);
                _rw.was_in_ratemode = true;

                _rw.reveal_ratingwindow(true);
                return true;
            }
        },

        comment: { // Not implemented yet
            visible: ["#rate-buttons", "#commenting-area", "#rated-votes"],
            invisible: ["#reputation-info", "#user-communication", "#categories-selection-area",
                "#thanks-area", "#ok-button"],
            addclass: "commenting",
            removeclass: "view-mode rated unrated rate thanks",

            activate: function () {
                var _rw = wot.ratingwindow,
                    prev_mode = _rw.modes.current_mode;
                if (!wot.ratingwindow.modes._activate("comment")) return false;

                // TODO: this piece of code is a duplication. Should be refactored.
                if (prev_mode == "" || !_rw.cat_selector.inited) {
                    if (!_rw.cat_selector.inited) {
                        _rw.cat_selector.build();
                        _rw.cat_selector.init();
                    }
                    _rw.cat_selector.init_voted();
                }

                _rw.was_in_ratemode = true; // since in comment mode user is able to change rating, we should set the flag
                _rw.comments.update_hint();
                _rw.comments.update_button("comment", true);
                _rw.update_submit_button();
                _rw.comments.focus();
                _rw.reveal_ratingwindow(true);
                return true;
            }
        },

        thanks: {
            visible: ["#thanks-area", "#rated-votes", "#ok-button"],
            invisible: ["#reputation-info", "#user-communication", "#categories-selection-area",
                "#commenting-area", "#rate-buttons"],
            addclass: "thanks view-mode",
            removeclass: "rated unrated rate commenting",

            activate: function () {
                var _rw = wot.ratingwindow;
                if (!_rw.modes._activate("thanks")) return false;

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

        show_hide: function (mode_name) {
            var _modes = wot.ratingwindow.modes;
            var visible = _modes[mode_name] ? _modes[mode_name].visible : [];
            var invisible = _modes[mode_name] ? _modes[mode_name].invisible : [];

            $(invisible.join(", ")).hide();
            $("#wot-ratingwindow").addClass(_modes[mode_name].addclass).removeClass(_modes[mode_name].removeclass);
            $(visible.join(", ")).show();
        },

        _activate: function (mode_name) {
            /* Generic func to do common things for switching modes. Returns false if there is no need to switch the mode. */
//            console.log("RW.modes.activate(" + mode_name + ")");

            var _rw = wot.ratingwindow;
            if (_rw.modes.current_mode == mode_name) return false;
            _rw.modes.show_hide(mode_name);
            _rw.modes.current_mode = mode_name;
            _rw.rate_control.update_ratings_visibility(mode_name);
            return true;
        },

        auto: function () {
            var _rw = wot.ratingwindow;

            if (_rw.local_comment && _rw.local_comment.comment) {
                _rw.modes.comment.activate();
            } else {
                // If no locally saved comment exists, switch modes between Rated / Unrated
                if (_rw.is_rated()) {
                    _rw.modes.rated.activate();
                } else {
                    _rw.modes.unrated.activate();
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
        inited: false,
        $_cat_selector: null,
        short_list: true,
        voted: {},

        build: function () {
            var _rw = wot.ratingwindow,
                _this = _rw.cat_selector,
                cats = [];

            _this.$_cat_selector = $(".category-selector .dropdown-menu"); // all operations are done on the menu actually
            $("*", _this.$_cat_selector).detach();  // remove everything if present

            // cycle through grouping to create main sections
            for (var gi = 0; gi < wot.grouping.length; gi++) {
                var grp = wot.grouping[gi];
                if (!grp.omnipresent && grp.text && grp.groups) {
                    var $_li = _this._build_grouping(grp.text, grp.name);

                    var $_popover = $("<div></div>").addClass("popover");   // container for a list of categories

                    // Iterate over list of groups in the grouping (section)
                    for(var a = 0; a < grp.groups.length; a++) {
                        var g = grp.groups[a], // g.name == id, g.type == css style
                            g_id = parseInt(g.name);

                        cats = wot.select_categories(g_id, g_id);   // list if categories' IDs
                        _rw.cat_selector._build_from_list(cats, $_popover, false);
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

        _build_from_list: function (cat_list, $_target_popover, omni) {
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
                        if (omni) {
                            $_po_cat.addClass("omni");
                        }

                        if (cat.fullonly) {
                            $_po_cat.addClass("fullonly");
                            $_po_cat.toggleClass("invisible", _this.short_list);
                        }

                        $("<div></div>")    // the category line
                            .text(wot.get_category_name(cat.id, true))
                            .addClass("cat-name")
                            .appendTo($_po_cat);

                        var $_cat_vote = $("<div></div>").addClass("cat-vote");

                        // TODO: use translations for strings
                        $("<div></div>").text(textvote_yes).addClass("cat-vote-left").appendTo($_cat_vote);
                        $("<div></div>").text(textvote_no).addClass("cat-vote-right").appendTo($_cat_vote);

                        $("<div></div>").addClass("delete-icon")
                            .appendTo($("<div></div>").addClass("cat-vote-del").appendTo($_cat_vote));

                        $_cat_vote.appendTo($_po_cat);

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
                _this = _rw.cat_selector;

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
                if (wot.grouping[j].omnipresent) continue;  // skip omni grouping for obvious reason
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
                dyn_grp = wot.determ_grouping(null, "dynamic"); // find the dynamic group to identify "popover" DOM element

            if (dyn_grp.groups) {
                for (var i= 0, gid; i < dyn_grp.groups.length; i++) {
                    gid = parseInt(dyn_grp.groups[i].name);
                    dyn_cats = dyn_cats.concat(wot.select_categories(gid, gid));
                }
            }

            if (!wot.utils.isEmptyObject(cats_object)) {
                var cats = wot.rearrange_categories(cats_object);   // list of categories' IDs
                // filter out categories that are in the omni-area already
                // and that are only voted but not identified by community
                var filtered_dynamic = cats.trustworthy.concat(cats.childsafety).filter(function(elem){
                    var cat_id = parseInt(elem.id);
                    var fltr = !(omni_to_show.indexOf(cat_id) >= 0);
                    fltr = fltr && elem.c;  // Identified cats have "c" attribute's value greater than than zero;
                    fltr = fltr && !(dyn_cats.indexOf(cat_id) >= 0); // drop categories that are already in dyn_cats
                    return fltr;
                });

                filtered_dynamic = dyn_cats.concat(filtered_dynamic);

                var $_popover = $("li[grp-name="+dyn_grp.name+"] .popover", _this.$_cat_selector).first();
                $(".category", $_popover).detach(); // remove all previous categories from the popover
                _rw.cat_selector._build_from_list(filtered_dynamic, $_popover, false); // fill the popover with categories
            }

            // 4. Append finally Omni Categories
            $(".category-selector .popover .omni").detach();    // remove all previous omni groups from all popovers

            // Create and attach omni categories to _all_ popovers (groupings)
            for (var si in omni_per_section) {
                if (omni_per_section[si]) {
                    var $_popover = $(".category-selector li[grp-name=" + si + "] .popover");
                    _this._build_from_list(omni_per_section[si], $_popover, true);
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

        init_voted: function () {
            var _rw = wot.ratingwindow,
                _this = _rw.cat_selector;

            var cached = _rw.getcached(),
                cats_object = (cached && cached.value && cached.value.cats) ? cached.value.cats : {};

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

        _calc_vote_result: function (vs, vy, vn, vd, vc) {
            // Calculates the resulted vote depending on what was clicked and current vote state
            if (vd == 1) return 0; // if "delete" is clicked
            var fy = vy * Math.min(vy, vy - vs);
            var fn = vn * Math.max(-1, -vn - vs);
            var fc = vc * ((vs + 2) % 3 - 1);
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
            var vd = $_clicked.hasClass("cat-vote-del") ? 1 : 0;       // Clicked "delete" vote
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

            wot.ratingwindow.update_submit_button(); // enable/disable "Save" button
        }
    }, /* end of cat_selector {} */

    /* Start of Comments API and Comments UI code */
    comments: {
        allow_commenting: true,
        is_banned: false,
        captcha_required: false,
        MIN_LIMIT: 30,
        MAX_LIMIT: 20000,
        is_changed: false,
        posted_comment: {},

        is_commented: function() {
            // comment can be there, but it can be invalid (outside of limits restrictions, etc)
            return ($("#user-comment").val().trim().length > 0);
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

        update_hint: function () {
            var rw = wot.ratingwindow,
                _this = rw.comments,
                $_comment = $("#user-comment"),
                $_hint = $("#comment-bottom-hint"),
                len = $_comment.val().trim().length,
                fix_len = 0,
                cls = "";

            if (len > 0 && len < _this.MIN_LIMIT) {
                fix_len = String(len - _this.MIN_LIMIT).replace("-", "– "); // readability is our everything
                cls = "error min"
            } else if (len > _this.MAX_LIMIT) {
                fix_len = len - _this.MAX_LIMIT;
                cls = "error max"
            } else {
                // we could show here something like "looks good!"
            }

            $_hint.attr("class", cls).text(fix_len);
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

        set_comment: function (text) {
            $("#user-comment").val(text);
        },

        has_valid_comment: function () {
            var comment = $("#user-comment").val().trim(),
                _this = wot.ratingwindow.comments;

            return (comment.length >= _this.MIN_LIMIT && comment.length < _this.MAX_LIMIT);
        },

        focus: function () {
            $("#user-comment").focus();
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
        }
    }

}});

$(document).ready(function() {
    wot.ratingwindow.onload();
});
