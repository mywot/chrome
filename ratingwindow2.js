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
    was_in_ratemode: false,

    /* rating state */

    state: {},

    is_rated: function (state) {
        var ratings = wot.ratingwindow.getcached().value,
            is_rated = false;

//        console.log("is_rated()", state, ratings);

        state = state ? state : ratings;

        // Detect if the website is rated by user, to activate proper mode
        wot.components.forEach(function (i) {
            var name = i.name;
//            console.log(name, state[name]);
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

    setstate: function (component, t) {
        // This only changes the user's testimonies' state
        var new_value = {};
        if (t >= 0) {
            new_value = { t: parseInt(t) };
        } else {
            new_value = { t: -1 };
//			delete(this.state[component]);
        }

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
            new_votes_arr = _rw.cat_selector.get_user_votes();
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

    finishstate: function(unload)
    {
        try {
            var _rw = wot.ratingwindow;
            var bg = chrome.extension.getBackgroundPage();
            var bgwot = bg.wot, // shortage for perfomance and readability
                if_cond = false;

            /* message was shown */

            // on unload finishing, restore previous message or remove current
            if (unload && bgwot.core.usermessage && bgwot.core.usermessage.previous) {
                bgwot.core.usermessage = bgwot.core.usermessage.previous;
            }

            if (bgwot.core.unseenmessage()) {
                bgwot.prefs.set("last_message", bg.wot.core.usermessage.id);
            }

            if (_rw.state.target) {
                var votes_changed = _rw.cat_difference(_rw.is_rated(_rw.state));
//                bg.console.log("the Diff", votes_changed);

//                if_cond = (_rw.was_in_ratemode && (bgwot.cache.cacheratingstate(_rw.state.target, _rw.state, votes_changed) || votes_changed.length > 0)) &&
//                    _rw.is_allowed_submit();

                if_cond = (_rw.was_in_ratemode && (bgwot.cache.cacheratingstate(_rw.state.target, _rw.state, votes_changed) || votes_changed.length > 0));
            } else {
//                bg.console.log("finishstate: no state yet");
            }

//            bg.console.log("IF COND:", if_cond);

            /* if user's testimonies or categories were changed, store them in the cache and submit */
            if (if_cond) {

                // don't show warning screen immediately after rating and set "expire to" flag
                var warned_expire = (new Date()).getTime() + wot.expire_warned_after;
                bgwot.cache.setflags(_rw.state.target, {warned: true, warned_expire: warned_expire });

                /* submit new ratings */
                var params = {}, votes = "";

                wot.components.forEach(function(item) {
                    if (_rw.state[item.name]) {
                        params["testimony_" + item.name] =
                            _rw.state[item.name].t;
                    }
                });

                votes = _rw._make_votes(votes_changed);
                if (votes.length > 1) {
                    params.votes = votes;
                }

                bgwot.api.submit(_rw.state.target, params);
                // count testimony event
                // TODO: add either label or number to count voted categories AND/OR whether ratings were deleted
                bgwot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_TESTIMONY);
            } else {
//                bg.console.log("No testimonies & votes to submit them. Ignored.");
            }

            /* update all views */
            bgwot.core.update();
        } catch (e) {
            console.log("ratingwindow.finishstate: failed with ", e);
        }
    },

    /* helpers */

    navigate: function(url, context, keep_opened)
    {
        try {
            var contextedurl = wot.contextedurl(url, context);
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
        try {
            if (this.getcached().status == wot.cachestatus.ok) {
                var slider = $(".wot-rating-slider", stack);

                /* rating from slider position */
                var position = 100 * (e.clientX - slider.offset().left) /
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

    updatecontents: function()
    {
        var bg = chrome.extension.getBackgroundPage();
        var cached = this.getcached(),
            visible_hostname = "",
            rw_title = "";

        /* update current rating state */
        this.updatestate(this.current.target, cached);

        var $_hostname = $("#hostname-text"),
            $_wot_title_text = $("#wot-title-text");

        /* target */
        if (this.current.target && cached.status == wot.cachestatus.ok) {
            visible_hostname = bg.wot.url.decodehostname(this.current.target);
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

            // WOT2.0: no need to show/hide components any more. All 2 are visible
//			if (bg.wot.prefs.get("show_application_" + item.name)) {
//				$("#wot-rating-" + item.name + ", #wot-rating-" + item.name +
//					"-border").css("display", "block");
//			} else {
//				$("#wot-rating-" + item.name + ", #wot-rating-" + item.name +
//					"-border").hide();
//			}

            $("#wot-rating-" + item.name + "-reputation").attr("reputation", rep_level);

            $("#wot-rating-" + item.name + "-confidence").attr("confidence",
                (cached.status == wot.cachestatus.ok) ?
                    wot.getlevel(wot.confidencelevels,
                        (cachedv && cachedv.c != null)? cachedv.c : -1).name : "c0");

            var $_rep_legend = $("#rep-" + item.name + " .rating-legend");
            $_rep_legend.attr("r", rep_level);
            $_rep_legend.text(wot.get_level_label(item.name, rep_level, false));

        });
        this.rate_control.updateratings();

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

        // TODO: rewrite below
        var index = 0,
            item = (bg.wot.core.usercontent && bg.wot.core.usercontent.length > 0) ? bg.wot.core.usercontent[0] : {},
            user_header = "",
            user_as = "",
            $_user_text = $("#wot-user-0-text");

        if (item.bar && item.length != null && item.label) {
            user_header = item.bar;
            user_as = item.label;
        }
        $("#wot-user-0-header").text(user_header);
        $("#user-activityscore").text(user_as);

        $_user_text.attr("url", item.url || "");

        if (item.notice) {
            $("#wot-user-0-notice").text(item.notice).show();
        } else {
            $("#wot-user-0-notice").hide();
        }

        if (item.text) {
            $_user_text.text(item.text);
            $("#wot-user-0").css("display", "block");
        }

        /* partner */
        $("#wot-partner").attr("partner", wot.partner || "");
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
                cat_text = wot.get_category_name(cat_id, true);

            if (cat_text) {
                $_new_cat.text(cat_text);
                $_new_cat.addClass(cgroup_style);   // set group style
                $_new_cat.addClass(cat_conf);   // set confidence style
                $_target.append($_new_cat);
            }
        }
        $_target.show();
    },

    update_categories: function () {
//        console.log("wot.ratingwindow.update_categories()");
        var _rw = wot.ratingwindow,
            cached = _rw.getcached(),
            $_tr_list = $("#tr-categories-list"),
            $_cs_list = $("#cs-categories-list");

        try {
            // delete categories from the visible area
            _rw.insert_categories({}, $_tr_list);
            _rw.insert_categories({}, $_cs_list);

            if (this.current.target && cached.status == wot.cachestatus.ok && cached.value) {
                var cats = cached.value.cats;
                if (cats != null) {
                    var sorted = wot.rearrange_categories(wot.select_identified(cats));    // sort categories and split into two parts (TR, CS)
                    _rw.insert_categories(sorted.trustworthy, $_tr_list);
                    _rw.insert_categories(sorted.childsafety, $_cs_list);
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
                        _rw.current = data || {};
                        _rw.updatecontents();
                        _rw.update_categories();
                        _rw.modes.reset();
                        _rw.modes.auto();
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

    localize: function () {
        /* texts */
        wot.components.forEach(function(item) {
            var n = item.name;
            $("#wot-rating-" + n + "-header").text(wot.i18n("components", n));
            $("#wot-myrating-"+ n +"-header").text(wot.i18n("ratingwindow", "question" + n));

            $("#wot-rating-" + n + "-boundleft").text(wot.i18n("testimony", item.name + "_levels_" + wot.getlevel(wot.reputationlevels, 0).name));
            $("#wot-rating-" + n + "-boundright").text(wot.i18n("testimony", item.name + "_levels_" + wot.getlevel(wot.reputationlevels, 100).name));
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
            }, {
                selector: "#btn-delete",
                text: wot.i18n("buttons", "delete")
            }, {
                selector: "#btn-delete",
                title: wot.i18n("buttons", "delete_title")
            }, {
                selector: "#btn-cancel",
                text: wot.i18n("buttons", "cancel")
            }, {
                selector: "#btn-submit",
                text: wot.i18n("buttons", "save")
            }, {
                selector: ".category-title",
                text: wot.i18n("ratingwindow", "categories")
            }, {
                selector: "#change-ratings",
                text: wot.i18n("ratingwindow", "rerate_change")
            }
        ].forEach(function(item) {
                var $elem = $(item.selector);
                if (item.text) {
                    $elem.text(item.text);
                } else if (item.html) {
                    $elem.html(item.html);
                } else if (item.title) {
                    $elem.attr("title", item.title);
                }
            });
    },

    update_uservoted: function () {
        var _rw = wot.ratingwindow;
        var res = "",
            yes_voted = [],
            cat = null,
            $_change = $("#change-ratings"),
            change_link_text = "";

        // try to get user's votes from the category selector (if there are any)
        var voted = _rw.cat_selector.get_user_votes();
        if (voted.length > 0) {
            for (var i = 0; i < voted.length; i++) {
                cat = voted[i];
//                console.log(cat);
                if (cat.v == 1) {
                    yes_voted.push(wot.get_category_name(cat.id, true));
                }
            }
        } else {
            // try to get user's votes from cache (server response)
            voted = wot.select_voted(_rw.getcached().value.cats);
            for(cat in voted) {
                if (voted[cat].v == 1) {
                    yes_voted.push(wot.get_category_name(cat, true));
                }
            }
        }

        if (yes_voted.length > 0) {
            res = yes_voted.join(", ");
            change_link_text = wot.i18n("ratingwindow", "rerate_change");
        } else {
            res = wot.i18n("ratingwindow", "novoted");
            change_link_text = wot.i18n("ratingwindow", "rerate_category");
        }

        $("#voted-categories-content").text(res).closest("#rated-votes").toggleClass("voted", (yes_voted.length > 0));
        $_change.text(change_link_text);
    },

    is_allowed_submit: function () {
        var _rw = wot.ratingwindow,
            testimonies = 0,
            passed = false;

        // 1. Either TR or CS are rated, OR none of them are rated (e.g. "delete my ratings")
        for (i in wot.components) {
            var cmp = wot.components[i].name;
            if (_rw.state[cmp] && _rw.state[cmp].t !== null && _rw.state[cmp].t >= 0) {
                testimonies++;
            }
        }

        if (testimonies > 0) {
            // At least one category must be voted as YES since user gives a rating
            passed = false; // if prev step gave true, set it back to false
            var voted = _rw.cat_selector.get_user_votes();
            for(i in voted) {
                if (voted[i].v == 1) {
                    passed = true;
                    break;
                }
            }
            return passed;
        } else {
            passed = true;
        }

        return passed;

    },

    update_submit_button: function (enable) {
        var _rw = wot.ratingwindow,
            $_submit = $("#btn-submit"),
            save_delete = false;

        if (enable) {
            $_submit.removeClass("disabled");
        } else if (enable === false) {
            $_submit.addClass("disabled");
        } else {
            enable = _rw.is_allowed_submit();
            $_submit.toggleClass("disabled", !enable);

            // If user wants to delete ratings, change the text of the button and hide "Delete ratings" button
            if (enable && !_rw.is_rated(_rw.state)) {
                $_submit.text(wot.i18n("testimony", "delete"));
                $("#btn-delete").hide();
                save_delete = true; // remember the reverse of the label
        }
        }

        if (!save_delete) {
            $_submit.text(wot.i18n("buttons", "save"));
            $("#btn-delete").show();
        }
    },

    onload: function()
    {
        var _rw = wot.ratingwindow;

        _rw.opened_time = new Date(); // remember time when RW was opened (for UX measurements)
        var bg = chrome.extension.getBackgroundPage();
        var first_opening = !bg.wot.prefs.get(wot.engage_settings.invite_to_rw.pref_name);

        wot.init_categories(bg.wot.prefs);

        /* accessibility */
        $("#wot-header-logo, " +
            "#wot-header-close, " +
            ".wot-header-link, " +
            "#hostname-text, " +
            ".wot-rating-reputation, " +
            ".wot-rating-slider, " +
            ".wot-rating-helplink, " +
            "#wot-scorecard-content, " +
            ".wot-scorecard-text, " +
            ".wot-user-text, " +
            "#wot-message-text")
            .toggleClass("accessible", bg.wot.prefs.get("accessible"));

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

        $("#wot-header-link-guide").bind("click", function() {
            wot.ratingwindow.navigate(wurls.settings + "/guide", wurls.contexts.rwguide);
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

        // Rate mode event handlers
        $("#btn-submit").bind("click", _rw.on_submit);
        $("#btn-cancel").bind("click", _rw.on_cancel);
        $("#btn-delete").bind("click", _rw.on_delete_button);
        $("#change-ratings, #voted-categories-content").bind("click", _rw.on_change_ratings);

        $(window).unload(wot.ratingwindow.on_unload);

        _rw.rate_control.init(); // init handlers of rating controls
        bg.wot.core.update();     // this starts main data initialization (e.g. before it there is no "cached" data)

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

        // TODO: uncomment and test after public beta launch:
//		var is_rtip_neutral = false; // default style for welcome tip = sticker
//
//		var tts_wtip = (locale === "ru" || locale === "en") &&
//						first_opening &&
//						!(wt.settings.rw_ok || wt.settings.rw_shown > 0) &&
//						wot.is_defined(["rw_text", "rw_text_hdr", "rw_ok"], "wt");
//
//		tts_wtip = tts_wtip && (wot.get_activity_score() < bg.wot.wt.activity_score_max);
//
//		if (tts_wtip && bg.wot.exp) {
//			// important to run experiment only no Tips were shown before
//			tts_wtip = bg.wot.exp.is_running("wtip-on");
//		}
//
//        if (bg.wot.prefs.get("super_wtips")) tts_wtip = true;  // override by super-setting
//
//		if (tts_wtip) {
//
//			var tip_type = "rtip-sticker"; // default style
//
//			// Decide what to show: normal rating window or welcome tip?
//			if (bg.wot.exp) {
//				is_rtip_neutral = bg.wot.exp.is_running("rtip-neu");
//				tip_type = is_rtip_neutral ? "rtip-neutral" : "rtip-sticker"; // reference to CSS style
//			}
//
//			// RW is opened first time - show welcome tip
//			_rw.show_welcome_tip(tip_type);
//
//			// set all welcome tip's preferences (== wt was shown)
//			wt.settings.rw_shown = wt.settings.rw_shown + 1;
//			wt.settings.rw_shown_dt = new Date();
//			wt.save_setting("rw_shown");
//			wt.save_setting("rw_shown_dt");
//		}

        // increment "RatingWindow shown" counter
        _rw.count_window_opened();

        // shown RatingWindow means that we shown a message => remove notice badge from the button
        if (bg.wot.core.badge_status && bg.wot.core.badge_status.type == wot.badge_types.notice.type) {
            bg.wot.core.set_badge(false);   // hide badge
        }

//        _rw.modes.auto();
        // DEBUG ONLY:
//        _this.modes.rate.activate();
    },

    on_delete_button: function () {
//        console.log("on_delete_button()");
        var _rw = wot.ratingwindow;

        wot.components.forEach(function(item){
            _rw.delete_testimony(item.name);
        });

        wot.ratingwindow.finishstate(false);
        _rw.modes.auto();   // switch RW mode according to current state

    },

    on_cancel: function () {
//        console.log("on_cancel()");
        var _rw = wot.ratingwindow,
            cached = _rw.getcached();

        // restore previous testimonies
        wot.components.forEach(function(item){
            var a = item.name;
            var t = (cached.value[a] && cached.value[a].t !== undefined) ? cached.value[a].t : -1;
            if (_rw.state[a]) {
                _rw.state[a].t = t;
            } else {
                _rw.state[a] = { t: t };
            }
        });

        _rw.rate_control.updateratings(_rw.state);  // restore user's testimonies visually
        _rw.cat_selector.init_voted(); // restore previous votes

        // TODO: restore previous comment (at some point)

        _rw.modes.auto();   // switch RW mode according to current state
//        console.log("state", _rw.state);
    },

    on_submit: function (e) {
//        console.log("on_submit()");

        if ($(e.currentTarget).hasClass("disabled")) return;    // do nothing is "Save" is not allowed

        var _rw = wot.ratingwindow;
        wot.ratingwindow.finishstate(false);
        _rw.modes.auto();   // switch RW mode according to current state
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
                mousemove: _this.rate_control.on_mousemove
            });
        },

        on_mousemove: function (e) {
            var _rw = wot.ratingwindow;

            if (_rw.state.down == -1) return;
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

            _rw.modes.rate.activate();

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

                var was_in_rate_mode = _rw.modes.rate.activate(),  // switch to rate mode
                    c = parseInt($(this).closest(".wot-rating-data").attr("component"));

                // TODO: show the warning that categories will be deleted also (?)
                _rw.delete_testimony(c);
            }
        },

        update_ratings_visibility: function (mode) {
            var _rw = wot.ratingwindow,
                $_ratingarea = $("#ratings-area");

            if (mode == "unrated") {
                var cached = _rw.getcached();
                if (cached.value && cached.value.target) {
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
            state = state || {};

            var _rw = wot.ratingwindow;

            /* update each component */
            wot.components.forEach(function(item) {
                if (state.name != null && state.name != item.name) {
                    return;
                }

                var elems = {},
                    rep = wot.getlevel(wot.reputationlevels, -1).name,
                    t = -1,
                    wrs = _rw.state[item.name];

                ["stack", "slider", "indicator", "deleteicon", "deletelabel", "helptext", "helplink"].forEach(function(elem) {
                    elems[elem] = $("#wot-rating-" + item.name + "-" + elem);
                });

                t = (wrs && wrs.t != null) ? wrs.t : t;

                if (t >= 0) {
                    /* rating */
                    elems.indicator.css("left", (t * _rw.sliderwidth / 100).toFixed() + "px");
                    elems.stack.addClass("testimony").removeClass("hover");
                    elems.deletelabel.text(wot.i18n("testimony", "delete"));
                    elems.deleteicon.closest(".rating-delete").removeClass("unrated");
                    elems.deleteicon.closest(".rating-delete").addClass("delete");
                    rep = wot.getlevel(wot.reputationlevels, t).name;

                } else if (state.name != null && state.t >= 0) {
                    /* temporary indicator position */
                    elems.indicator.css("left", (state.t * _rw.sliderwidth / 100).toFixed() + "px");
                    elems.stack.removeClass("testimony").addClass("hover");
                    rep = wot.getlevel(wot.reputationlevels, state.t).name;

                } else {
                    elems.stack.removeClass("testimony").removeClass("hover");
                    elems.deletelabel.text(wot.i18n("testimony", "unrated"));
                    elems.deleteicon.closest(".rating-delete").addClass("unrated");
                    elems.deleteicon.closest(".rating-delete").removeClass("delete");
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
            invisible: ["#rate-buttons", "#categories-selection-area", "#rated-votes"],
            addclass: "view-mode unrated",
            removeclass: "rated",

            activate: function () {
                if (!wot.ratingwindow.modes._activate("unrated")) return false;
                return true;
            }
        },

        rated: {
            visible: ["#reputation-info", "#user-communication", "#rated-votes"],
            invisible: ["#rate-buttons", "#categories-selection-area", ".user-comm-social"],
            addclass: "view-mode rated",
            removeclass: "unrated",

            activate: function () {
                if (!wot.ratingwindow.modes._activate("rated")) return false;
                wot.ratingwindow.update_uservoted();
                return true;
            }
        },

        rate: {
            visible: ["#rate-buttons", "#categories-selection-area"],
            invisible: ["#reputation-info", "#user-communication", "#rated-votes"],
            addclass: "rate",
            removeclass: "view-mode rated unrated",

            activate: function () {
                var _rw = wot.ratingwindow;
                if (!_rw.modes._activate("rate")) return false;

                if (!_rw.cat_selector.inited) {
                    _rw.cat_selector.build();
                    _rw.cat_selector.init();
                }
                _rw.cat_selector.init_voted();
                _rw.update_catsel_state();  // update the category selector with current state
                _rw.update_submit_button();
                _rw.was_in_ratemode = true;
                return true;
            }
        },

        comment: { // Not implemented yet
            visible: ["#rate-buttons"],
            invisible: ["#reputation-info", "#user-communication", "#categories-selection-area", "#rated-votes"],

            activate: function () {
                if (!wot.ratingwindow.modes._activate("comment")) return false;
                $("#wot-ratingwindow").removeClass("view-mode");
                // some logic here
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
            if (_rw.is_rated()) {
                _rw.modes.rated.activate();
            } else {
                _rw.modes.unrated.activate();
            }
        },

        reset: function () {
            wot.ratingwindow.modes.current_mode = "";
        }
    },

    cat_selector: {
        inited: false,
        $_cat_selector: null,
        voted: {},

        build: function () {
            var _rw = wot.ratingwindow,
                _this = _rw.cat_selector,
                cats = [];

            _this.$_cat_selector = $(".category-selector .dropdown-menu"); // all operations are done on the menu actually

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
                        _rw.cat_selector._build_from_list(cats, $_popover);
                    }

                    $_li.append($_popover);
                    _this.$_cat_selector.append($_li);
                }
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

                        $("<div></div>")    // the category line
                            .text(wot.get_category_name(cat.id, true))
                            .addClass("cat-name")
                            .appendTo($_po_cat);

                        var $_cat_vote = $("<div></div>").addClass("cat-vote");

                        // TODO: use translations for strings
                        $("<div></div>").text("Yes").addClass("cat-vote-left").appendTo($_cat_vote);
                        $("<div></div>").text("No").addClass("cat-vote-right").appendTo($_cat_vote);

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

            // 2. Create and show omni-part with CS categories based on user's CS testimony
            var omnigroupings = wot.determ_grouping(t0, "omnipresent");
            var omni_categories = [],
                omni_to_show = [];

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

            if (!wot.utils.isEmptyObject(cats_object) && omni_to_show && omni_to_show.length > 0) {
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

            // Create and attach omni categories to _all_ popovers (groupings) at one time
            _this._build_from_list(omni_to_show, $(".category-selector .popover"), true);
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
                $(".category[data-cat=" + cat_id + "]", _this.$_cat_selector).addClass("identified");
            }
        },

        markup_voted: function () {
            // Hightlights user's votes for categories
            var _rw = wot.ratingwindow,
                _this = _rw.cat_selector;

            $(".category", _this.$_cat_selector).removeAttr("voted");

            for(cat_id in _this.votes) {
                $(".category[data-cat=" + cat_id + "]", _this.$_cat_selector).attr("voted", _this.votes[cat_id].v);
            }
        },

        get_user_votes: function () {
            // Scans DOM for all visible categories in the category selector to filter out voted but invisible cats in future

            var _rw = wot.ratingwindow,
                _this = _rw.cat_selector,
                voted = [], _voted = {};

            $(".category", _this.$_cat_selector).each(function (i, elem) {
                var cid = $(this).attr("data-cat"), cat = null;
                if (cid && $(this).attr("voted")) {
                    cid = parseInt(cid);
                    if (!_voted[cid]) {         // check for unique
                        cat = wot.get_category(cid);
                        cat.v = parseInt($(this).attr("voted"));
                        voted.push(cat);
                        _voted[cid] = true;   // to be able to get a list of unique voted categories
                    }
                }
            });

            return voted;
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

            this.inited = true;

//            console.log("votes", _this.votes);
        },

        init_voted: function () {
            var _rw = wot.ratingwindow,
                _this = _rw.cat_selector;

            var cached = _rw.getcached(),
                cats_object = (cached && cached.value && cached.value.cats) ? cached.value.cats : {};

            _this.votes = wot.select_voted(cats_object);
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

            var left_distance = menu.outerWidth() + (menu.offset().left - $_external_container.offset().left);
            var top_distance = menu.offset().top - category_title.offset().top;

            //TO DO: what if user changes category manully.

            // Show the submenu
            sub_menu.css({
                top: top_distance + 1,
                left: left_distance - 1  // main should overlay submenu
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
    } /* end of cat_selector {} */

}});

$(document).ready(function() {
    wot.ratingwindow.onload();
});
