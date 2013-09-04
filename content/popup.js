/*
 content/popup.js
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

const WOT_POPUP_HTML =
    '<div id="wot-logo">{POPUPHEADERTEXT}</div>' +
        '<div id="wot-ratings{ID}" class="wot-ratings">' +
        '<div id="wot-hostname"></div>' +
        '<div id="wot-r0-stack{ID}" class="wot-stack wot-stack-left">' +
        '<div id="wot-r0-header{ID}" class="wot-header">{POPUPTEXT0}</div>' +
        '<div id="wot-r0-rep{ID}" class="wot-rep"></div>' +
        '<div id="wot-r0-cnf{ID}" class="wot-cnf"></div>' +
        '<div class="rating-legend-wrapper">' +
            '<div class="rating-legend">{REPTEXT0}</div>' +
        '</div>' +

        '</div>' +
        '<div id="wot-r4-stack{ID}" class="wot-stack wot-stack-right">' +
        '<div id="wot-r4-header{ID}" class="wot-header">{POPUPTEXT4}</div>' +
        '<div id="wot-r4-rep{ID}" class="wot-rep"></div>' +
        '<div id="wot-r4-cnf{ID}" class="wot-cnf"></div>' +
        '<div class="rating-legend-wrapper">' +
        '<div class="rating-legend">{REPTEXT4}</div>' +
        '</div>' +

        '</div>' +
        '</div>' +
        '<div id="wot-categories">' +
        '<div id="wot-cat-text">{POPUPNOCAT}</div>' +
        '<ul id="wot-cat-list"></ul>' +
        '</div>' +
        '<div class="wot-corners-wrapper">' +
        '<div id="wot-pp-tr" class="wot-pp-tr"></div>' +
        '<div id="wot-pp-cs" class="wot-pp-cs"></div>' +
        '</div>';

wot.popup = {
    cache:			{},
    version:		0,
    offsety:		-15,
    offsetx:		0,
    height:			200,    // minimal reserved height for the popup
    width:			300,    // minimal reserved width for the popup
    ratingheight:	52,
    areaheight:		214,
    barsize:		20,
    offsetheight:	0,
    postfix:		"-" + Date.now(),
    id:				"wot-popup-layer",
    onpopup:		false,
    rule_name:      null,
    show_wtip:      false,
    layer:          null,
    MAX_CATEGORIES: 5,      // FIXME: WTF is that? why 5?

    add: function(parentelem, rule_name)
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

            if (!parentelem || parentelem.isContentEditable) {
                return;
            }

            if (!document.getElementById("wot-popup-style")) {
                var style = document.createElement("style");

                style.setAttribute("type", "text/css");
                style.setAttribute("id", "wot-popup-style");
                style.innerText = "@import \"" +
                    chrome.extension.getURL(wot.getincludepath("popup.css")) +
                    "\";";

                var head = document.getElementsByTagName("head");

                if (head && head.length) {
                    head[0].appendChild(style);
                } else {
                    return;
                }
            }

            this.rule_name = rule_name;

            var layer = document.createElement("div");
            var accessible_cls = wot.search.settings.accessible ? " wot-popup-layer-accessible" : "";

            layer.setAttribute("id", id);
            layer.setAttribute("class", "wot-popup-layer" + accessible_cls);
            layer.setAttribute("style", "display: none;");


            var replaces = [
                {
                    from: "ID",
                    to: wot.popup.postfix
                }, {
                    from: "POPUPHEADERTEXT",
                    to: wot.i18n("popup", "headertext")
                }, {
                    from: "POPUPNOCAT",
                    to: wot.i18n("popup", "nocattext")
                }
            ];

            wot.components.forEach(function(item) {
                replaces.push({
                    from: "POPUPTEXT" + item.name,
                    to: wot.i18n("components", item.name, false)
                });
            });

            layer = parentelem.appendChild(layer);

            layer.innerHTML = wot.utils.processhtml(WOT_POPUP_HTML, replaces);
            layer.addEventListener("click", this.onclick, false);

			document.addEventListener("mousemove", function(event) {
				wot.popup.onmousemove(event);
			}, false);

            var rate_link = document.getElementById("wot-cat-text");
            if (rate_link) {
                rate_link.addEventListener("click", wot.popup.on_rate_click);
            }

        } catch (e) {
            console.error("popup.add: failed with " + e);
        }
    },

    updatecontents: function(cached)
    {
        try {
            if (!cached ||
                (cached.status != wot.cachestatus.ok &&
                    cached.status != wot.cachestatus.link)) {
                return false;
            }

            var tr_t = "", cs_t = ""; // user's testimonies for trust and child safety to show in bottom corners
            this.offsetheight = 0;

            var normalized_target = cached.value.normalized ? cached.value.normalized : cached.value.decodedtarget;

            var hostname_elem = document.getElementById("wot-hostname");
            if (hostname_elem && normalized_target) {
                hostname_elem.textContent = normalized_target;
            }

            wot.components.forEach(function(item) {

                var cachedv = cached.value[item.name];

                var r = (cachedv && cachedv.r != null) ? cachedv.r : -1;

                var elem = document.getElementById("wot-r" + item.name +
                    "-rep" + wot.popup.postfix);

                if (elem) {
                    elem.setAttribute("reputation",
                        wot.getlevel(wot.reputationlevels, r).name);
                }

                var c = (cachedv && cachedv.c != null) ? cachedv.c : -1;

                elem = document.getElementById("wot-r" + item.name +
                    "-cnf" + wot.popup.postfix);

                if (elem) {
                    elem.setAttribute("confidence",
                        wot.getlevel(wot.confidencelevels, c).name);
                }

                try {
                    // set testimonies for TR and CS to bottom corners of the popup
                    if (item.name == 0) {
                        tr_t = (cachedv && cachedv.t != null) ? cachedv.t : -1;
                        tr_t = wot.getlevel(wot.reputationlevels, tr_t).name;
                    } else if (item.name == 4) {
                        cs_t = (cachedv && cachedv.t != null) ? cachedv.t : -1;
                        cs_t = wot.getlevel(wot.reputationlevels, cs_t).name;
                    }
                } catch (e) {
                    console.error(e);
                }
            });

            if (wot.search.settings["super_showtestimonies"]) {
                var tr_t_corner = document.getElementById("wot-pp-tr");
                if (tr_t_corner && tr_t) {
                    tr_t_corner.setAttribute("r", tr_t);
                }

                var cs_t_corner = document.getElementById("wot-pp-cs");
                if (cs_t_corner && cs_t) {
                    cs_t_corner.setAttribute("r", cs_t);
                }
            }

            // Update categories in the popup
            var cats = wot.select_identified(cached.value.cats),
                cat_list = document.getElementById("wot-cat-list"),
                cat_text = document.getElementById("wot-cat-text");

            if (cats && !wot.utils.isEmptyObject(cats) && cat_list) {
                var ordered_cats = wot.rearrange_categories(cats);
                cat_text.style.display = "none";
                if (this.update_categories(cat_list, ordered_cats.all) > 0) {
                    this.toggle_categories(true); // show categories
                } else {
                    this.toggle_categories(false);
                }

            } else {
                this.toggle_categories(false); // hide categories list
            }

            return true;
        } catch (e) {
            console.error("popup.updatecontents: failed with " + e);
        }

        return false;
    },

    update_categories: function (list_node, categories) {
        var cnt = 0;

//        console.log("update_categories()", categories);

        // remove all list items
        while(list_node.firstChild) {
            list_node.removeChild(list_node.firstChild);
        }

        for (var k in categories) {
            if (cnt >= this.MAX_CATEGORIES) break;

            var cat = categories[k],
                cid = cat.id,
                li = document.createElement("li"),
                cls = ["cat-item"],
                cat_name = wot.get_category_name(cid, true);

            if (!cat_name) {
                continue;   // skip undefined categories, don't take them into account
            }

            cls.push(wot.get_category_css(cid));
            var cl = wot.getlevel(wot.confidencelevels, cat.c).name;
            cls.push(cl);

            li.textContent = cat_name;
            li.setAttribute("class", cls.join(" "));

            cnt++;
            list_node.appendChild(li);
        }

        return cnt;
    },

    toggle_categories: function (show) {
        var cat_list = document.getElementById("wot-cat-list"),
            cat_text = document.getElementById("wot-cat-text");
        if (cat_list && cat_text) {
            if (show) {
                cat_text.style.display = "none";
                cat_list.style.display = "block";
            }
            else {
                cat_text.style.display = "block";
                cat_list.style.display = "none";
            }
        }
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

                wot.post("search", "popup_shown", { label: wot.popup.rule_name });

                wot.log("popup.delayedshow: x = " + posx + ", y = " +
                    posy + ", version = " + version);
            }
        }, wot.search.settings.popup_show_delay || 200);
    },

    elem_position: function (elem, win_width, win_height, popupwidth, popupheight, offset_x, offset_y) {
        // more accurate way to calc position
        // got from http://javascript.ru/ui/offset
        if (elem == null) {
            return {};
        }
        var box = elem.getBoundingClientRect();
        var body = document.body;
        var docElem = document.documentElement;

        var vscroll = window.pageYOffset;
        var hscroll = window.pageXOffset;

        var y_offset = 0;

        var scrollTop = vscroll || docElem.scrollTop || body.scrollTop;
        var scrollLeft = hscroll || docElem.scrollLeft || body.scrollLeft;
        var clientTop = docElem.clientTop || body.clientTop || 0;
        var clientLeft = docElem.clientLeft || body.clientLeft || 0;
        var y  = box.top +  scrollTop - clientTop;
        var x = box.left + scrollLeft - clientLeft;

        offset_x = (offset_x === undefined) ? this.offsetx : offset_x;
        offset_y = (offset_y === undefined) ? this.offsety : offset_y;

        var posy = offset_y + y;//  + this.target.offsetHeight;
        var posx = offset_x + x + elem.offsetWidth;

        if (posy < vscroll) {
            // if placeholder's top doesn't fit into view, align it to the view
            posy = vscroll;
        }

        // If the bottom of the popup doesn't fit to current view
        if (posy + popupheight + offset_y > win_height + vscroll) {
            // If the donut at least is in the viewframe
            if (posy < win_height + vscroll) {
                y_offset = win_height + vscroll - y;
            }
            posy = y - popupheight + y_offset;
        }

        if (posx - hscroll < 0) {
            posx = hscroll;
        } else if ((posx + popupwidth) > (win_width + hscroll)) {
            posx = win_width - popupwidth + hscroll;
        }

        return { posx: posx, posy: posy, y_offset: y - posy }
    },

    show: function(layer)
    {
        try {
            var popupheight = Math.max(layer.style.height + this.offsetheight,  this.height),
                popupwidth = layer.style.width || this.width;

            var win_height = window.innerHeight - this.barsize;
            var win_width  = window.innerWidth  - this.barsize;

            if (win_height < popupheight ||	win_width < popupwidth) {
                this.hide();
                return;
            }

            var elem = this.target,
                pos = null,
                wt_params = wot.wt.donuts;

            if (this.show_wtip && wot.search.on_update_callback) {
                // Have to show welcome tip instead of normal popup here
                pos = this.elem_position(elem, win_width, win_height, wt_params.tip_width, wt_params.tip_height,
                    wt_params.offset_x, wt_params.offset_y);

                if(!pos) {
                    return;
                }

                this.layer = layer;     // keep it to be able to show popup after "OK" button is clicked
                wot.search.on_update_callback(pos.posx, pos.posy, pos.y_offset, wot.popup.rule_name);

            } else {
                // Show normal popup
                pos = this.elem_position(elem, win_width, win_height, popupwidth, popupheight);

                if (!pos) {
                    return;
                }

                if (layer.style.display != "none") {
                    layer.style.top  = pos.posy + "px";
                    layer.style.left = pos.posx + "px";
                    wot.post("search", "popup_shown", { label: wot.popup.rule_name });
                } else {
                    this.delayedshow(layer, pos.posy, pos.posx);
                }
            }


        } catch (e) {
            console.error("popup.show: failed with " + e);
        }
    },

    delayedhide: function(layer)
    {
        if (this.show_wtip && wot.search.on_update_callback) {
            wot.wt.donuts.delayed_hide();
            return;
        }

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
                wot.log("popup.hide: version = " + version);
            }
        } catch (e) {
            console.error("popup.hide: failed with " + e);
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
            console.error("popup.findelem: failed with " + e);
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
            console.error("popup.onmousemove: failed with " + e);
        }
    },

    get_target: function() {
        try {
            var layer = document.getElementById(wot.popup.id + wot.popup.postfix);

            if (layer) {
                var target = layer.getAttribute(wot.search.getattrname("target") +
                    wot.popup.postfix);

                if (target) {
                    return target;
                }
            }
        } catch (e) {
            console.error("popup.get_target: failed with ", e);
        }
        return null;
    },

    onclick: function(event)
    {
        try {
           var target = wot.popup.get_target();

            if (target) {
                wot.post("search", "openscorecard", { target: target,
                    ctx: wot.urls.contexts.popupviewsc });

                wot.popup.hide(wot.popup.version, true);
            }
        } catch (e) {
            console.error("popup.onclick: failed with ", e);
        }
    },

    on_rate_click: function(event) {
        try {
            var target = wot.popup.get_target();

            if (target) {
                wot.post("search", "ratesite", { target: target,
                    ctx: wot.urls.contexts.popuprate });

                wot.popup.hide(wot.popup.version, true);
            }
            event.stopPropagation();
        } catch (e) {
            console.error("popup.onclick: failed with ", e);
        }
    }
};
