/*
 background.js
 Copyright © 2014  WOT Services Oy <info@mywot.com>

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

$.extend(wot, { payments: {

	STATUS_PLAN: {
		UNKNOWN: 0,
		PAID: 1
	},

	UNLOCKING_AS: 500,

	UPDATE_INTERVAL: 60 * 60 * 1000,    // update config every hour
//	CONFIG_URL: "/test-1.json",
	CONFIG_URL: "https://api.mywot.com/tests/config.json",
	config: {},

	loader_timer: null,

	get_status_plan: function () {

		var _this = wot.payments;
		if (wot.core.is_level("") || wot.core.is_level("registered")) {
			return _this.STATUS_PLAN.UNKNOWN;
		} else if (wot.core.is_level("unregistered_paid") || wot.core.is_level("registered_paid")) {
			return _this.STATUS_PLAN.PAID;
		}
		return _this.STATUS_PLAN.UNKNOWN;
	},

	get_feature_status: function (feature) {
		// returns on of the options: trial | reminder | locked | unlocked

		var _this = wot.payments,
			status_plan = _this.get_status_plan(),
			timesinceinstall = wot.time_sincefirstrun();

		// Test for unlocking attributes
		if (wot.get_activity_score() >= _this.UNLOCKING_AS) {
			return wot.LOCK_STATE.UNLOCKED;
		}

		if (status_plan == _this.STATUS_PLAN.PAID) {
			return wot.LOCK_STATE.UNLOCKED;
		}

		// Test for time-related reminder attributes
		// TODO: in the future

		// Test whether current ID is listed as config (if not - feature is unlocked)
		var wot_id = wot.witness.id;
		if (!_this.config[wot_id]) return wot.LOCK_STATE.UNLOCKED;

		// here we are if the ID is found in the list
		return wot.LOCK_STATE.LOCKED;

	},

	get_price: function (feature) {
		var _this = wot.payments,
			id_config = _this.config[wot.witness.id] || {};

		return id_config.price || 10;
	},

	open_unlocker: function (data) {
		var url, path,
			_this = wot.payments,
			nonce = wot.crypto.getnonce('unlocker'),
			unlock_price = _this.get_price(),
			params = {
				id: wot.witness.id,
				nonce: nonce,
				version: wot.platform + "-" + wot.version,
				hosts: wot.crypto.encrypt(btoa(JSON.stringify({
					price: unlock_price,
					rule: data.rule
				})), nonce)

			};

		path = wot.urls.unlock + "?" + wot.utils.query_param(params);
		url = wot.urls.base + path + "&auth=" + wot.crypto.authenticate("/" + path);

		console.log("/" + path + "&auth=" + wot.crypto.authenticate("/" + path));

		chrome.tabs.create({ url: url });

	},

	open_premium_tos: function (data) {
		wot.core.open_mywot(wot.urls.premium_tos, data.ctx);
	},

	open_premium_readmore: function (data) {
		wot.core.open_mywot("https://www.mywot.com/forum/45536-WOT-freemium", data.ctx);
	},

	load_config: function () {

		var _this = wot.payments;

		$.getJSON(_this.CONFIG_URL, function (data) {
			if (data) {
				_this.config = data;
			}
		});

		if (!_this.loader_timer) {
			_this.loader_timer = window.setInterval(wot.payments.load_config, _this.UPDATE_INTERVAL);
		}
	}

}});
