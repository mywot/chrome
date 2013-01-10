
var question = {
	target: "test.me.mywot.com",
	decodedtarget: "test.me.name.mywot.com",
	question: {
		id: 9999,
		text: "Overall, how satisfied are you with %site%?",
		choices: [
			{"value":0, "text":"Extremely dissatisfied"},
			{"value":1, "text":"Moderately dissatisfied"},
			{"value":2, "text":"Slightly dissatisfied"},
			{"value":3, "text":"Neither satisfied nor dissatisfied"},
			{"value":4, "text":"Slightly satisfied"},
			{"value":5, "text":"Moderately satisfied"},
			{"value":6, "text":"Extremely satisfied"}
		]
	},
	stats: {
		impressions: 10,
		submissions: 4
	},
	url: "http://test.me.mywot.com/dummy/url/for/test"
};

var encoded = btoa(JSON.stringify(question));

var iframe = document.createElement("iframe");

iframe.setAttribute("id", "wot_surveys_wrapper");
iframe.setAttribute("scrolling", "no");
iframe.setAttribute("style", "position: fixed; top: 10px; left: 10px;width: 392px; height: 350px; z-index: 2147483647; border: none;");

iframe.setAttribute("name", encoded);

iframe.setAttribute("src", "/widgets/surveys.html");

var body = document.getElementsByTagName("body")[0];

body.appendChild(iframe);
