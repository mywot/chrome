/*
	content/popup.js
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

const WOT_POPUP_HTML =
	"<div id=\"wot-logo\" class=\"{ACCESSIBLE}\"></div>" +
	"<div id=\"wot-ratings{ID}\" class=\"wot-ratings\">" +
		"<div id=\"wot-r0-stack{ID}\" class=\"wot-stack\">" +
			"<div id=\"wot-r0-header{ID}\" class=\"wot-header\">{POPUPTEXT0}</div>" +
			"<div id=\"wot-r0-rep{ID}\" class=\"wot-rep {ACCESSIBLE}\"></div>" +
			"<div id=\"wot-r0-cnf{ID}\" class=\"wot-cnf\"></div>" +
		"</div>" +
		"<div id=\"wot-r1-stack{ID}\" class=\"wot-stack\">" +
			"<div id=\"wot-r1-header{ID}\" class=\"wot-header\">{POPUPTEXT1}</div>" +
			"<div id=\"wot-r1-rep{ID}\" class=\"wot-rep {ACCESSIBLE}\"></div>" +
			"<div id=\"wot-r1-cnf{ID}\" class=\"wot-cnf\"></div>" +
		"</div>" +
		"<div id=\"wot-r2-stack{ID}\" class=\"wot-stack\">" +
			"<div id=\"wot-r2-header{ID}\" class=\"wot-header\">{POPUPTEXT2}</div>" +
			"<div id=\"wot-r2-rep{ID}\" class=\"wot-rep {ACCESSIBLE}\"></div>" +
			"<div id=\"wot-r2-cnf{ID}\" class=\"wot-cnf\"></div>" +
		"</div>" +
		"<div id=\"wot-r4-stack{ID}\" class=\"wot-stack\">" +
			"<div id=\"wot-r4-header{ID}\" class=\"wot-header\">{POPUPTEXT4}</div>" +
			"<div id=\"wot-r4-rep{ID}\" class=\"wot-rep {ACCESSIBLE}\"></div>" +
			"<div id=\"wot-r4-cnf{ID}\" class=\"wot-cnf\"></div>" +
		"</div>" +
	"</div>";

wot.popup = {
	cache:			{},
	version:		0,
	offsety:		15,
	offsetx:		0,
	height:			235,
	width:			137,
	ratingheight:	52,
	areaheight:		214,
	barsize:		20,
	offsetheight:	0,
	postfix:		"-" + Date.now(),
	id:				"wot-popup-layer",
	onpopup:		false,

	add: function(parentelem)
	{
		try {
			if (!wot.search.settings.show_search_popup) {
				return;
			}

			var id = this.id + this.postfix;

			if (document.getElementById(id)) {
				return;
			}

			parentelem = parentelem || document.body;

			if (!parentelem) {
				return;
			}

			var style = document.createElement("style");

			style.setAttribute("type", "text/css");
			style.innerText = "@import \"" +
				chrome.extension.getURL(wot.getincludepath("popup.css")) +
					"\";";

			var head = document.getElementsByTagName("head");

			if (head && head.length) {
				head[0].appendChild(style);
			} else {
				return;
			}

			var layer = document.createElement("div");

			layer.setAttribute("id", id);
			layer.setAttribute("class", "wot-popup-layer");
			layer.setAttribute("style", "display: none; cursor: pointer;");

			var accessible = wot.search.settings.accessible ?
								"accessible" : "";

			var replaces = [ {
					from: "ID",
					to: wot.popup.postfix
				}, {
					from: "ACCESSIBLE",
					to: accessible
				} ];

			wot.components.forEach(function(item) {
				replaces.push({
					from: "POPUPTEXT" + item.name,
					to: wot.i18n("components", item.name, true)
				});
			});

			layer = parentelem.appendChild(layer);

			layer.innerHTML = wot.warning.processhtml(WOT_POPUP_HTML, replaces);
			layer.addEventListener("click", this.onclick, false);

			document.addEventListener("mousemove", function(event) {
					wot.popup.onmousemove(event);
				}, false);
		} catch (e) {
			console.log("popup.add: failed with " + e + "\n");
		}
	},

	getelemposx: function(elem)
	{
	    var curtop = 0;

		try {
		    if (elem.offsetParent) {
		        while (elem.offsetParent) {
		            curtop += elem.offsetLeft;
		            elem = elem.offsetParent;
		        }
		    } else if (elem.x) {
		        curtop += elem.x;
		    }
		} catch (e) {
			console.log("popup.getelemposx: failed with " + e + "\n");
		}

	    return curtop;
	},

	getelemposy: function(elem)
	{
	    var curtop = 0;

		try {
		    if (elem.offsetParent) {
		        while (elem.offsetParent) {
		            curtop += elem.offsetTop;
		            elem = elem.offsetParent;
		        }
		    } else if (elem.y) {
		        curtop += elem.y;
		    }
		} catch (e) {
			console.log("popup.getelemposx: failed with " + e + "\n");
		}

	    return curtop;
	},

	updatecontents: function(cached)
	{
		try {
			if (!cached ||
					(cached.status != wot.cachestatus.ok &&
					 cached.status != wot.cachestatus.link)) {
				return false;
			}

			var bottom = null;
			this.offsetheight = 0;

			wot.components.forEach(function(item) {
				var r = cached.value[item.name] ?
							cached.value[item.name].r : -1;

				var elem = document.getElementById("wot-r" + item.name +
							"-rep" + wot.popup.postfix);

				if (elem) {
					elem.setAttribute("reputation",
						wot.getlevel(wot.reputationlevels, r).name);
				}

				var c = cached.value[item.name] ?
							cached.value[item.name].c : -1;

				elem = document.getElementById("wot-r" + item.name +
							"-cnf" + wot.popup.postfix);

				if (elem) {
					elem.setAttribute("confidence",
						wot.getlevel(wot.confidencelevels, c).name);
				}

				elem = document.getElementById("wot-r" + item.name + "-stack" +
							wot.popup.postfix);

				if (elem) {
					if (wot.search.settings["show_application_" + item.name]) {
						bottom = elem;
						bottom.style.display = "block";
					} else {
						wot.popup.offsetheight -= wot.popup.ratingheight;
						elem.style.display = "none";
					}
				}
			});

			if (bottom) {
				bottom.style.borderBottom = "0";
			}

			var ratings = document.getElementById("wot-ratings" +
							this.postfix);

			if (ratings) {
				ratings.style.height = wot.popup.offsetheight +
					wot.popup.areaheight + "px";
			}

			return true;
		} catch (e) {
			console.log("popup.updatecontents: failed with " + e + "\n");
		}

		return false;
	},

	update: function(target, oncomplete)
	{
		oncomplete = oncomplete || function() {};

		if (this.cache[target]) {
			if (this.updatecontents(this.cache[target])) {
				oncomplete();
			}
		} else {
			wot.cache.get(target, function(name, cached) {
				wot.popup.cache[target] = cached;

				if (wot.popup.updatecontents(cached)) {
					oncomplete();
				}
			});
		}
	},

	delayedshow: function(layer, posy, posx)
	{
		var version = this.version;

		window.setTimeout(function() {
				if (wot.popup.target && version == wot.popup.version) {
					layer.style.top  = posy + "px";
					layer.style.left = posx + "px";
					layer.style.display = "block";

					wot.log("popup.delayedshow: x = " + posx + ", y = " +
						posy + ", version = " + version + "\n");
				}
			}, wot.search.settings.popup_show_delay || 200);
	},

	show: function(layer)
	{
		try {
			var popupheight = this.height + this.offsetheight;

			layer.style.height = popupheight + "px";
			layer.style.width  = this.width  + "px";

			var height = window.innerHeight - this.barsize;
			var width  = window.innerWidth  - this.barsize;

			if (height < popupheight ||	width < this.width) {
				this.hide();
				return;
			}

			var vscroll = window.pageYOffset;
			var hscroll = window.pageXOffset;

			var y = this.getelemposy(this.target);
			var x = this.getelemposx(this.target);

			var posy = this.offsety + y + this.target.offsetHeight;
			var posx = this.offsetx + x + this.target.offsetWidth;

			if (posy + popupheight > height + vscroll) {
				posy = y - popupheight - this.offsety;
			}

			if (posx - hscroll < 0) {
				posx = hscroll;
			} else if ((posx + this.width) > (width + hscroll)) {
				posx = width - this.width + hscroll;
			}

			var version = ++this.version;

			if (layer.style.display != "none") {
				layer.style.top  = posy + "px";
				layer.style.left = posx + "px";
			} else {
				this.delayedshow(layer, posy, posx);
			}
		} catch (e) {
			console.log("popup.show: failed with " + e + "\n");
		}
	},

	delayedhide: function(layer)
	{
		if (layer.style.display != "none" && !this.waitingforhide) {
			this.waitingforhide = true;
			var version = this.version;

			window.setTimeout(function() {
					wot.popup.hide(version);
					wot.popup.waitingforhide = false;
				}, wot.search.settings.popup_hide_delay || 1000);
		}
	},

	hide: function(version, force)
	{
		try {
			var layer = document.getElementById(this.id + this.postfix);

			if (layer && (!version || version == this.version) &&
					(force || !this.onpopup)) {
				layer.style.display = "none";
				wot.log("popup.hide: version = " + version + "\n");
			}
		} catch (e) {
			console.log("popup.hide: failed with " + e + "\n");
		}
	},

	findelem: function(event)
	{
		try {
			var elem = event.target;
			var attr = null;
			var attrname = wot.search.getattrname("target");
			var onpopup = false;

			while (elem) {
				if (elem.attributes) {
					attr = elem.getAttribute(attrname);

					if (attr) {
						break;
					}

					attr = null;

					if (elem.id == (this.id + this.postfix)) {
						onpopup = true;
					}
				}

				elem = elem.parentNode;
			}

			this.onpopup = onpopup;
			return (elem && attr) ? elem : null;
		} catch (e) {
			console.log("popup.findelem: failed with " + e + "\n");
		}

		return null;
	},

	onmousemove: function(event)
	{
		try {
			var layer = document.getElementById(this.id + this.postfix);

			if (layer) {
				this.target = this.findelem(event);

				if (this.target) {
					var attr = wot.search.getattrname("target");
					var target = this.target.getAttribute(attr);

					if (target) {
						if (layer.style.display != "block" ||
								layer.getAttribute(attr + this.postfix) !=
									target) {
							layer.setAttribute(attr + this.postfix, target);

							this.update(target, function() {
								wot.popup.show(layer);
							});
						}
					} else {
						this.target = null;
						this.delayedhide(layer);
					}
				} else {
					this.delayedhide(layer);
				}
			}
		} catch (e) {
			console.log("popup.onmousemove: failed with " + e + "\n");
		}
	},

	onclick: function(event)
	{
		try {
			var layer = document.getElementById(wot.popup.id + wot.popup.postfix);

			if (layer) {
				var target = layer.getAttribute(wot.search.getattrname("target") +
									wot.popup.postfix);

				if (target) {
					wot.post("search", "openscorecard", { target: target });
					wot.popup.hide(wot.popup.version, true);
				}
			}
		} catch (e) {
			console.log("popup.onclick: failed with " + e + "\n");
		}
	}
};
