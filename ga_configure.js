/*
 ga_configure.js
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


// this script must be placed right after wot.js
// it is separated from html to conform strict content policy

var _gaq = _gaq || [];
_gaq.push(['_setAccount', wot.ga_id]);
// provide version number to GA
_gaq.push(['_setCustomVar', 1, 'Version', String(wot.version), 2]); // scope = 2 (session level)
_gaq.push(['_setReferrerOverride', '']);    // clear the referrer in GA cookie. Issue #75 on GH.
_gaq.push(['_trackPageview']);

/* This adds logic for counting events to wot object */

$.extend(wot, { ga: {

	disable: false, // general switcher to stop counting stats
	_tracker: null,

	categories: {
		WS: "WarningScreen",
		RW: "RatingWindow",
		GEN: "General",
		INJ: "Injections",
		WT: "WelcomeTips",
		FBL: "FeedbackLoop"
	},

	actions: {
		RW_TESTIMONY:   "RW_testimony",
		RW_TESTIMONY_DEL: "RW_testimony_del",
		RW_COMMENTADDED: "RW_comment_posted",
		RW_COMMENTREMOVED: "RW_comment_removed",
		RW_COMMENTKEPT: "RW_comment_kept",      // the comment is kept locally

		RW_BTN_CLOSE:   "RW_btn_close",
		RW_MSG_CLICKED: "RW_msg_clicked",
		RW_DELETE:      "RW_delete",
		RW_DELETEALL:   "RW_delete_all",
		RW_ADDCOMMENT:  "RW_addcomment",
		RW_EDITCOMMENT: "RW_editcomment",
		RW_PICKACAT:    "RW_pickcategory",
		RW_BTNCANCEL:    "RW_btn_cancel",

		WS_SHOW:        "WS_shown",
		WS_BTN_ENTER:   "WS_btn_enter",
		WS_BTN_CLOSE:   "WS_btn_close",

		D_POPUP_SHOWN:  "D_popup_shown",
		GEN_INSTALLED:  "WOT_installed",
		GEN_LAUNCHED:   "WOT_launched",

		WT_INTRO_0_SHOWN: "WT_Intro0_shown",
		WT_INTRO_0_LEARN: "WT_Intro0_learnmore",
		WT_INTRO_0_OK:  "WT_Intro0_ok",
		WT_WS_SHOWN:    "WT_WS_shown",
		WT_WS_OK:       "WT_WS_ok",
		WT_WS_OPTEDOUT: "WT_WS_optedout",
		WT_WS_LEARN:    "WT_WS_learnmore",
		WT_RW_SHOWN:    "WT_RW_shown",
		WT_RW_OK:       "WT_RW_ok",
		WT_RW_LEARN:    "WT_RW_learnmore",
		WT_DONUTS_SHOWN:"WT_Donuts_shown",
		WT_DONUTS_OK:   "WT_Donuts_ok",
		WT_DONUTS_LEARN:"WT_Donuts_learnmore",

		FBL_shown:              "FBL_shown",
		FBL_submit:             "FBL_submit",
		FBL_closed:             "FBL_closed",
		FBL_dismiss:            "FBL_dismiss",
		FBL_optout_shown:       "FBL_optout_shown",
		FBL_optout_shown_smb:   "FBL_optout_shown:smb", // used for additional stats purposes: tells submittions number
		FBL_optout_yes:         "FBL_optout_yes",
		FBL_optout_yes_smb:     "FBL_optout_yes:smb",  // used for additional stats purposes: tells submittions number
		FBL_optout_no:          "FBL_optout_no",
		FBL_whatisthis:         "FBL_whatisthis",
		FBL_bottom_close:       "FBL_bottom_close",
		FBL_slidered:           "FBL_slidered",
		FBL_directclick:        "FBL_directclick",
		FBL_logo:               "FBL_logo",
		FBL_opportunity:        "FBL_opportunity"  // we could show the survey, but conditions are not met
	},

	init_tracker: function () {
		if (!wot.ga._tracker) {
			if (_gat) {
				try {
					wot.ga._tracker = _gat.getTrackerByName();
					wot.ga._tracker._setAccount(wot.ga_id);
				} catch (e) {
					// failed. No Problem.
				}
			}
		}

		return !!wot.ga._tracker;
	},

	fire_event: function (category, action, label) {

		if (wot.ga.disable) return;

		try {
			if (wot.ga.init_tracker()) {
				wot.ga._tracker._trackEvent(category, action, label);
			} else {
				// backup option, if AsyncTracker still isn't inited
				_gaq.push(['_trackEvent', category, action, label]);
			}
		} catch (e) {
			// silence...
			//console.log("Error in wot.ga.fire_event(). Msg: ", e);
		}
	},

	post_init: function() {
		// Finalize setting up GA environment after wot.core is initialized fully

		/* CustomVars slots:
		 *  1. version
		 *  2. partner = "undefined" | mailru
		 *  3. registered = yes | no    ; since 24.05.2013
		 *  4. experiments
		 *  5. FBL_QID (page level). Was accessible = acc | normal until 28.03.2013
   	     * */

		// let's measure how many "accessible" users do we have on Chrome
//		var accessible = wot.env.is_accessible ? "acc" : "normal",
		var partner = wot.prefs.get("partner") || "undefined";  // set partner

        var is_registered = wot.core.is_level("registered") ? "yes" : "no";

		_gaq.push(['_setCustomVar', 2, 'partner', partner, 2]); // scope = 2 (session level)
		_gaq.push(['_setCustomVar', 3, 'registered', is_registered, 2]); // scope = 2 (session level)

		wot.ga.set_experiments();
	},

	set_experiments: function () {
		// sets up custom variable with Experiments
		if (wot.exp) {
			var exps = wot.exp.exps_running_ga();
			if (exps && exps.length) {
				_gaq.push(['_setCustomVar', 4, 'Experiments', exps, 1]); // scope = 1 (visitor level)
			}
		}
	},

    set_fbl_question: function (question_id) {
        _gaq.push(['_setCustomVar', 5, 'FBL_QID', String(question_id), 3]); // scope = 3 (page level)
    }

}});

