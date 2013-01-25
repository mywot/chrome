/*
	content/my.js
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

wot.my = {
	oncontentloaded: function()
	{
		try {
			var clear = document.getElementById("wotsaverating");

			if (clear) {
				clear.addEventListener("click", function() {
					var target = clear.getAttribute("target");
					if (target) {
						wot.cache.clear(target);
					}
				});
			}
		} catch (e) {
			wot.log("my.oncontentloaded: failed with " + e);
		}
	},

	onload: function()
	{
		try {
			wot.addready("my", this);

			wot.bind("message:my:setcookies", function(port, data) {
				data.cookies.forEach(function(item) {
					// remove all extra session cookies for paths. See issue #80 for details.
					document.cookie = item + "; expires=Tue, 18-Oct-2005 06:31:14 GMT";

					// set a cookie for "/" path only
					document.cookie = item + "; path=/";
					wot.log("my: set cookie: " + item);
				});

				wot.my.ready(true);
			});

			wot.post("my", "update", { cookies: document.cookie });

			document.addEventListener("DOMContentLoaded", function() {
					wot.my.oncontentloaded();
				}, false);

			if (document.readyState == "complete") {
				wot.my.oncontentloaded();
			}
		} catch (e) {
			wot.log("my.onload: failed with " + e);
		}
	}
};

wot.my.onload();
