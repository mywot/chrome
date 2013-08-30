/*
 comments.js
 Copyright © 2013 -   WOT Services Oy <info@mywot.com>

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

$.extend(wot, { keeper: {

    STATUSES: {
        LOCAL: 1,
        SUBMITTING: 2
    },

    /* Comment-specific methods to work with Keeper */

    get_comment: function (target) {
        // returns comment data stored locally for the specified target. Comment data is {body, timestamp, votes, wcid}
        var data = wot.keeper.get_by_name(target, "comment");
        if (data) {
            return data;
        } else {
            return {};
        }
    },

    save_comment: function (target, comment_body, wcid, votes, status) {
//        console.log("keeper.save_comment()");

        var data = {
            timestamp: Date.now(),
            target: target,
            comment: comment_body,
            wcid: wcid,
            votes: votes,    // votes as object to be able to restore them to UI
            status: status || wot.keeper.STATUSES.LOCAL
        };

        this.store_by_name(target, "comment", data);
    },

    remove_comment: function (target) {
//        console.log("keeper.save_comment()");
        this.remove_by_name(target, "comment");
    },

    /* Generic methods to work with Keeper */

    get_by_name: function (target, name) {
        // generic method to get data from local by target and name
//        console.log("keeper.get_by_name()", target, name);

        return wot.prefs.get(wot.keeper._fullname(target, name)) || null;
    },

    store_by_name: function (target, name, data) {
//        console.log("keeper.store_by_name()", target, name, data);
        wot.prefs.set(wot.keeper._fullname(target, name), data);
    },

    remove_by_name: function (target, name) {
//        console.log("keeper.remove_by_name()", target, name);
        wot.prefs.clear(wot.keeper._fullname(target, name));
    },

    _fullname: function (target, name) {
        return "keeper:" + name + ":" + target;
    }

}});