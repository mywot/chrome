/*
	content/url.js
	Copyright © 2009  WOT Services Oy <info@mywot.com>

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

wot.url = {
	pending: {},

	gethostname: function(url, onget)
	{
		wot.bind("url:puthostname:" + url, onget);
		this.pending[url] = true;
		wot.post("url", "gethostname", { url: url });
	},

	onload: function()
	{
		wot.addready("url", this, function() {
			for (var i in this.pending) {
				return false;
			}
			return true;
		});

		wot.bind("message:url:puthostname", function(port, data) {
			delete(wot.url.pending[data.url]);
			wot.trigger("url:puthostname:" + data.url, [ data.target ], true);
			wot.url.ready();
		});
	}
};

wot.url.onload();
