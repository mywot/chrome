$.extend(wot, { stats: {
    utils: 
    {
    	serialize: function(obj) 
        {
    		var str = [];
    		var length = 0;
    		for(var p in obj) {
    			if (obj.hasOwnProperty(p)) {
    				length++;
    				str.push(p + "=" + obj[p]);
    			}
    		}
    		return {
    			data: str.join("&"),
    			length:length
    		};
    	},

    	postRequest: function(url, data, length, callback) 
        {
            try {
                var http = new XMLHttpRequest();
                http.open("POST", url, true);
                http.setRequestHeader("Content-type", "application/x-www-form-urlencoded");

                http.onreadystatechange = function() {
                    if (http.readyState == 4) {
                        if(http.status == 200) {
                            if (callback) {
                                callback(true, http.responseText);
                            }
                        }
                        else {
                            if (callback) {
                                callback(false, http.responseText);
                            }
                        }
                    }
                };
                http.send(data);          
            }
            catch(e){
                // console.log("postRequest() - error." +e);
            }    			    
    	},

        dictionaryToQueryString: function(dict) 
        {
            var result = '';
            for(key in dict) {
                result += key + '=' + dict[key] + '&';
            }
            return result.slice(0, result.length - 1); 
        },

        createRandomString: function (string_size) 
        {
            var text = "";
            var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

            for (var i = 0; i < string_size; i++)
                text += possible.charAt(Math.floor(Math.random() * possible.length));

            return text;
        },

        RESPONSE_RECEIVED: 4,
        getRequest: function(url, callback) 
        {
            try {
                var xmlhttp = new XMLHttpRequest();
                xmlhttp.onreadystatechange = function() {
                    if (xmlhttp.readyState == wot.stats.utils.RESPONSE_RECEIVED) {
                        if (xmlhttp.status == 200) {
                            callback(true, xmlhttp.responseText);
                        }
                        else {
                            callback(false, xmlhttp.responseText);
                        }
                    }
                }
                xmlhttp.open("GET", url, true);
                xmlhttp.send();
            }
            catch(e){
                // console.log("getRequest() - error. " +e);
            }
        },

        getCurrentTime: function() 
        {
            return new Date().getTime();
        }
    },

	last_prev: "",
    enabled: false,
    statusKey: "ok",
    urlKey: "url",

    onload: function() 
    {
        try {
            var settings = this.getMonitoringSettings();
            if(settings != null && settings[this.statusKey] == 1) {
                this.startMonitoring();
            }
            this.fetchSettings();
        }
        catch(e) {
            // console.log("init() - error." + e);
        }
    },

    isWebURL: function(url) 
    { 
        return url.toLowerCase().indexOf("http") == 0;
    },

    getInstallTime: function() 
    {
        var installtime = wot.prefs.get("stats_installtime");
        if (!installtime) {
            wot.prefs.set("stats_installtime", this.utils.getCurrentTime());
        }
        installtime = wot.prefs.get("stats_installtime");
        return !installtime ? null : installtime; 
    },

    setMonitoringSettings: function(settings) 
    {
        if (settings) {
            wot.prefs.set("stats_settings", settings);
        }
    },

    getMonitoringSettings: function() 
    {
        var settings = wot.prefs.get("stats_settings");
        if (wot.prefs.get("stats_settings")) {
            try {
                var settingsJson = JSON.parse(settings);
                if(typeof settingsJson[this.statusKey] == "undefined" || settingsJson[this.statusKey] == null) {
                    return null;
                }
                if(typeof settingsJson[this.urlKey] == "undefined" || settingsJson[this.urlKey] == null) {
                    return null;
                }
                return settingsJson;
            }
            catch(e) {

            }
            return null;
        }
        return null;
    },

    startMonitoring: function() 
    {
        this.enabled = true;
    },

    fetchSettings: function() 
    {
        var url = wot.STATS.URL;
        var data = {
            "s":wot.STATS.SID,
            "ins":wot.stats.getInstallTime(),
            "ver":wot.STATS.VER
        };
        var queryString = this.utils.dictionaryToQueryString(data);
        url = url + "?" + queryString;
        this.utils.getRequest(url, this.onSettingsReceived);
    },

    onSettingsReceived: function(status, response) 
    {
        wot.stats.setMonitoringSettings(response);
        var settings = wot.stats.getMonitoringSettings();
        
        if(settings[wot.stats.statusKey] == 1) {
            wot.stats.startMonitoring();
        }
    },

    getUserId: function() 
    {
        var uid = wot.prefs.get("stats_uid");
        if (!uid){
            wot.prefs.set("stats_uid", this.utils.createRandomString(32));  
        }
        uid = wot.prefs.get("stats_uid");
        return !uid ? null : uid;
    },

    getSession: function() 
    {
        var session = wot.prefs.get("stats_sess");
        if (!session){
            session = this.createSession();
            this.saveSession(session); 
        }
        else {
            try {
                if (this.isSessionExpired()) {
                    session = this.createSession();
                    this.saveSession(session); 
                } else {
                    return JSON.parse(session);
                }
            }
            catch(e) {
                session = this.createSession();
                this.saveSession(session);
            }
        }
        return session;
    },

    isSessionExpired: function() 
    {
        var oldSession = wot.prefs.get("stats_sess");
        var currentTime = this.utils.getCurrentTime();
        if (oldSession) {
            var jsonOldSession = JSON.parse(oldSession);
            var oldSessionTs = jsonOldSession['ts'];

            if (typeof oldSessionTs != "undefined" && oldSessionTs && (currentTime - oldSessionTs) < wot.STATS.ST) {
                return false;
            }
        }
        return true;
    },

    touchSession: function(prev) 
    {
        var session = this.getSession();
        session['ts'] = this.utils.getCurrentTime();
        if(prev) {
            session['prev'] = encodeURIComponent(prev);
        }
        this.saveSession(session);
    },

    saveSession: function(session) 
    {
        wot.prefs.set("stats_sess", JSON.stringify(session)); 
    },

    createSession: function() 
    {
        var session = {
            "id" : wot.stats.utils.createRandomString(32),
            "ts" : wot.stats.utils.getCurrentTime(),
            "prev" : encodeURIComponent("")
        };

        session = JSON.stringify(session);
        session = JSON.parse(session);
        return session;
    },

	loc: function(url, ref) 
    {
		if(this.isWebURL(url)) {
			this.query(url, ref);
		}
	},	

	focus: function(url) 
    {
		if(typeof url == "string" && this.isWebURL(url)) {
			this.last_prev = url;	
		}
        this.touchSession();
	},	

	query: function(url, ref) 
    {
        if (!this.enabled) {
            return;
        }
        var settings = this.getMonitoringSettings();
        if (this.last_prev === "") {
            this.last_prev = decodeURIComponent(this.getSession()['prev']);
        }
        data = {
            "s":wot.STATS.SID,
            "md":21,
            "pid":wot.stats.getUserId(),
            "sess":wot.stats.getSession()['id'],
            "q":encodeURIComponent(url),
            "prev":encodeURIComponent(this.last_prev),
            "link":0,
            "sub": "chrome",
            "tmv": wot.STATS.VER,
            "hreferer" : encodeURIComponent(ref),
            "ts" : wot.stats.utils.getCurrentTime()
        };

        var requestDataInfo = this.utils.serialize(data);
        var requestData = requestDataInfo.data;
        var requestLength = requestDataInfo.length;

        var encoded = btoa(btoa(requestData));        
        if (encoded != "") {
            var data = "e=" + encodeURIComponent(encoded);
            var statsUrl = settings[this.urlKey] + "/valid";
            this.utils.postRequest(statsUrl, data, requestLength);
        }       
        this.last_prev = url;      
        this.touchSession(this.last_prev);
    }
}});

wot.stats.onload();