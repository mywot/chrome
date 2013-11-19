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
    captcha_required: false,

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

            if (!this.cache[name]) {
                this.cache[name] = {};
            }

            $.extend(this.cache[name], {
                updated: Date.now(),
                status: status || wot.cachestatus.error,
                value: value || {}
            });

			wot.trigger("cache:set", [ name, this.cache[name ] ]);
			return true;
		} catch (e) {
			console.log("cache.set: failed with ", e);
		}

		return false;
	},

    set_comment: function (name, comment_data) {
        wot.log("wot.cache.set_comment(name, comment_data)", name, comment_data);

        if (!this.cache[name]) {
            this.cache[name] = {}
        }

        $.extend(this.cache[name], {
            comment: comment_data
        });
    },

    update_comment: function (name, data) {
        wot.log("wot.cache.update_comment(name, comment_data)", name, data);

        if (this.cache[name] && this.cache[name].comment) {
            $.extend(this.cache[name].comment, data);
        } else {
            wot.log("WARN! wot.cache.update_comment() can't find comment data for ", name);
        }
    },

    remove_comment: function (name) {
        if (this.cache[name] && this.cache[name].comment) {
            delete this.cache[name].comment;
        }
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
			console.log("cache.get: failed with", e);
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
			console.log("cache.clear: failed with", e);
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
		wot.log("cache.purge");

		/* clear all expired items by going through them */
		this.each(function() {});

		window.setTimeout(function() {
				wot.cache.purge();
			}, this.maxage);
	},

	cacheratingstate: function(name, state, votes_changed)
    // Detects changes in user's ratings and stores them in local cache. Returns the flag whether the testimonies have been changed.
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

//                bg.console.log("testimonies, changed?", changed);

                if (!wot.utils.isEmptyObject(votes_changed)) {
                    for (var cid in votes_changed) {
                        if (!obj.value.cats[cid]) {
                            obj.value.cats[cid] = {
                                id: cid,
                                c: 0    // since it wasn't in the cache, then it is not identified (?)
                            }
                        }
                        obj.value.cats[cid].v = votes_changed[cid];
                    }
                    changed = true;
                }

//                bg.console.log("categories, changed?", changed);

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
					target: hosts[index || 0],
                    cats: {},
                    blacklist: []
				};

				if (!obj.target) {
					return;
				}

				var normalized = $(this).attr("normalized");

				if (normalized !== undefined) {
					normalized = wot.crypto.decrypt(normalized, nonce, index);

					if (/^[\x00-\xFF]*$/.test(normalized)) {
						obj.normalized = wot.url.decodehostname(normalized);
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

                // parse site's categories and user's votes
                $("category", this).each(function() {
                    var name = $(this).attr("name"),
                        c = $(this).attr("c"),
                        vote = $(this).attr("vote"),
                        inherited = $(this).attr("inherited");  // we don't use this right now

                    if (name) {
                        obj.cats[name] = {
                            id: parseInt(name),
                            c: $.isNumeric(c) ? parseInt(c) : 0,
                            v: $.isNumeric(vote) ? parseInt(vote) : undefined
                        };
                    }
                });

                // parse blacklisting info
                $("bl", this).each(function() {
                    var type = $(this).attr("type"),
                        time = $(this).attr("time");

                    if (type) {
                        obj.blacklist.push({
                            type: type,
                            time: time
                        });
                    }
                });

				// parse survey's question whether it exists
				$("question", this).each(function() {
					// "this" here contains <question> tag's content
					var question_type = $(this).attr("type");

					if (question_type !== undefined) {
						obj.question = {
							type: question_type
						};
					}
					return false;   // process only first element whether there are several
				});

				// FIXME: remove this debug code
//				obj.question = {
//					type: "submit"
//				};

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
