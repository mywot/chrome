/*
 settings.js
 Copyright © 2013  WOT Services Oy <info@mywot.com>

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

$.extend(wot, {
    settings_ui: {

        reset_cache: function () {
            var bg = chrome.extension.getBackgroundPage();
            bg.wot.cache.clearall();
            bg.wot.api.update();
            $("#cache-state").text("Cache is cleared.");
        },

        print_fbl: function () {
        },

        reset_fbl: function () {
            wot.surveys.reset_settings();
            $("#fbl-state").text("FBL settings were reset");
        },

        supers_wtips: function (event) {
            wot.prefs.set("super_wtips", event.currentTarget.checked);
        },

        supers_fbl: function (event) {
            wot.prefs.set("super_fbl", event.currentTarget.checked);
        },

        supers_showtestimonies: function (event) {
            var bg = chrome.extension.getBackgroundPage();
            wot.prefs.set("super_showtestimonies", event.currentTarget.checked);
            wot.prefs.clear("update:state");    // to force the variable update
            bg.wot.api.info.prefetch_link = event.currentTarget.checked;
            bg.wot.api.update();
            bg.wot.cache.clearall();    // clear cache
        },

        init: function () {
            wot.surveys.init();
            $("#btn-reset-fbl").click(wot.settings_ui.reset_fbl);

            $("#chk-super-wtips").
                click(wot.settings_ui.supers_wtips).
                attr("checked", wot.prefs.get("super_wtips"));

            $("#chk-super-fbl").
                click(wot.settings_ui.supers_fbl).
                attr("checked", wot.prefs.get("super_fbl"));

            $("#chk-user-showtestimonies").
                click(wot.settings_ui.supers_showtestimonies).
                attr("checked", wot.prefs.get("super_showtestimonies"));

            $("#btn-reset-cache").click(wot.settings_ui.reset_cache);
        }
    }
});

$(document).ready(wot.settings_ui.init);
