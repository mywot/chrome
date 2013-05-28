/*
	cache.js
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

$.extend(wot, { cache: {
	cache: {},
	flags: {},

	maxage: 30 * 60 * 1000, /* 30min */

	hasexpired: function(obj)
	{
		return ((Date.now() - obj.updated) > this.maxage);
	},

	isok: function(name)
	{
		return ((this.get(name) || {}).status == wot.cachestatus.ok);
	},

	setflags: function(name, flags)
	{
		try {
			this.flags[name] = this.flags[name] || {};
			$.extend(this.flags[name], flags || {});
		} catch (e) {
			console.log("cache.setflags: failed with ", e);
		}
	},

	set: function(name, status, value)
	{
		try {
			this.cache[name] = {
				updated: Date.now(),
				status: status || wot.cachestatus.error,
				value: value || {}
			};

			wot.trigger("cache:set", [ name, this.cache[name ] ]);
			return true;
		} catch (e) {
			console.log("cache.set: failed with ", e);
		}

		return false;
	},

	get: function(name)
	{
		try {
			var obj = this.cache[name];

			if (obj) {
				if (this.hasexpired(obj)) {
					this.clear(name);
				} else {
					obj = $.extend({}, obj, { flags: this.flags[name] || {} });
					wot.trigger("cache:get", [ name, obj ]);
					return obj;
				}
			}
		} catch (e) {
			console.log("cache.get: failed with ", e);
		}

		return null;
	},

	clear: function(name)
	{
		try {
			if (this.cache[name]) {
				delete(this.cache[name]);
				wot.trigger("cache:clear", [ name ]);
				return true;
			}
		} catch (e) {
			console.log("cache.clear: failed with ", e);
		}

		return false;
	},

	clearall: function()
	{
		this.cache = {};
	},

	each: function(func, params)
	{
		if (typeof(func) != "function") {
			return;
		}

		params = params || [];

		for (var i in this.cache) {
			var rv = func.apply(null,
						[ i, this.get(i) ].concat(params));

			if (rv) {
				return;
			}
		}
	},

	purge: function()
	{
		wot.log("cache.purge\n");

		/* clear all expired items by going through them */
		this.each(function() {});

		window.setTimeout(function() {
				wot.cache.purge();
			}, this.maxage);
	},

	cacheratingstate: function(name, state)
	{
		try {
			state = state || {};

			var obj = this.get(name);

			if (obj && obj.status == wot.cachestatus.ok) {
				var changed = false;

				wot.components.forEach(function(item) {
					if (state[item.name]) {
						obj.value[item.name] = obj.value[item.name] || {};

						if (obj.value[item.name].t != state[item.name].t) {
							obj.value[item.name].t  = state[item.name].t;
							changed = true;
						}
					}
				});

				if (changed) {
					this.set(name, obj.status, obj.value);
				}

				return changed;
			}
		} catch (e) {
			console.log("cache.cacheratingstate: failed with ", e);
		}

		return false;
	},

	cacheresponse: function(hosts, data, status)
	{
		var processed = 0;

		try {
			status = status || wot.cachestatus.ok;

			var nonce = data.firstChild.getAttribute("nonce");
			var targets = data.getElementsByTagName("target");

			$(targets).each(function() {
				var index = $(this).attr("index");

				var obj = {
					target: hosts[index || 0]
				};

				if (!obj.target) {
					return;
				}

				var normalized = $(this).attr("normalized");

				if (normalized !== undefined) {
					normalized = wot.crypto.decrypt(normalized, nonce, index);

					if (/^[\x00-\xFF]*$/.test(normalized)) {
						obj.normalized = normalized;
					}
				}

				$("application", this).each(function() {
					var name = parseInt($(this).attr("name"), 10);

					if (name >= 0) {
						var attrs = [ "r", "c", "t" ];
						var data  = {};

						for (var i = 0; i < attrs.length; ++i) {
							var value = parseInt($(this).attr(attrs[i]), 10);

							if (value >= 0) {
								data[attrs[i]] = value;
							} else {
								data[attrs[i]] = -1;
							}
						}

						if ($(this).attr("excluded")) {
							data.r = -2;
							data.c = -2;
						}

						obj[name] = data;
					}
				});

				// parse survey's question whether it exists
				$("question", this).each(function() {
					// "this" here contains <question> tag's content
					var question_id = parseInt($("questionId", this).text(), 10);
					var question_text = $("questionText", this).text().trim();
                    var dismiss_text = $("dismiss", this).text();
					var choices = [];

					$("choiceText", this).each(function() {
						// "this" here contains <choiceText> tag's content
						var choice_value = parseInt($(this).attr("value"), 10);
						var choice_text = $(this).text().trim();

						choices.push({ value: choice_value, text: choice_text });
					});

					if (question_id !== undefined && question_text && choices.length > 0) {
						obj.question = {
							id: question_id,
							text: question_text,
							choices: choices,
                            dismiss_text: dismiss_text
						};
					}
					return false;   // process only first element whether there are several
				});

				wot.cache.set(obj.target, status, obj);
				++processed;
			});
		} catch (e) {
			console.log("cache.cacheresponse: failed with ", e);
		}

		return processed;
	},

	onload: function()
	{
		wot.bind("message:cache:setflags", function(port, data) {
			wot.cache.setflags(data.target, data.flags);
		});
		
		wot.bind("message:cache:clear", function(port, data) {
			wot.cache.clear(data.target);
		});

		wot.bind("message:cache:get", function(port, data) {
			port.post("put", {
				target: data.target,
				data: wot.cache.get(data.target)
			});
		});

		wot.listen("cache");
	}
}});

wot.cache.onload();
