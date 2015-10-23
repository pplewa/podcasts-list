var Evernote = require('evernote').Evernote;
var FeedParser = require('feedparser');
var request = require('request');
var moment = require('moment-timezone');
var config = require('./config');
var Q = require('q');

var dateFrom = moment().tz(config.TIMEZONE).startOf('day').subtract(Number(config.DAYS_AGO) + 6, 'day');
var dateTo = moment().tz(config.TIMEZONE).startOf('day').subtract(Number(config.DAYS_AGO) - 1, 'day');

console.log('from', dateFrom.toString());
console.log('to', dateTo.toString());

var evernote = new Evernote.Client({ token: process.env.EVERNOTE_TOKEN, sandbox: false });
var noteStore = evernote.getNoteStore();
function createNote(title, body) {
	var deferred = Q.defer();
	var content = '<?xml version="1.0" encoding="UTF-8"?>' 
		+ '<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">'
		+ '<en-note>' + body + '</en-note>';

	var note = new Evernote.Note({
		title: title,
		content: content
	});
	noteStore.createNote(note, function(error, note) {
		if (error) {
			return deferred.reject(new Error(error));
		} 
		deferred.resolve(note);
	});

	return deferred.promise;
}

var getPodcasts = function() {
	var deferred = Q.defer();
	var podcasts = [];
	var feedparsers = [];
	var readFeed = function(feedparser){
		feedparser.on('readable', function() {
			var stream = this;
			var meta = this.meta;
			var item;

			while (item = stream.read()) {
				var podcastDate = moment(new Date(item.pubDate));
				if (podcastDate.isAfter(dateFrom) && podcastDate.isBefore(dateTo)) {
					podcasts.push('<a href="' + item.link + '">' + meta.title + ' - ' + item.title + '</a>');
				}
			}
		});
		feedparser.on('end', function() {
			setTimeout(function() {
				var index = feedparsers.indexOf(feedparser);
				if (index !== -1) {
					feedparsers.splice(index, 1);
				}
				if (!feedparsers.length) {
					deferred.resolve(podcasts);
				}
			}, 1000);
		});
	};

	request({ url: process.env.PODCAST_STORE_URL, json: true }, function(error, response, podcastFeeds) {
		if (error) {
			return console.log(error);
		}
		podcastFeeds.forEach(function(feed){
			var req = request(feed);
			req.on('response', function (res) {
				if (res.statusCode != 200) {
					return console.log('loading feed failed: ', feed);
				}
				var stream = this;
				var feedparser = new FeedParser();
				feedparsers.push(feedparser);
				stream.pipe(feedparser);
				readFeed(feedparser);
			});
		});
	});

	return deferred.promise;
}

getPodcasts().then(function(podcasts){
	var title = 'Podcasts list for ' + dateTo.format('DD/MM/YYYY');
	var body = podcasts.join('<br />').replace(/&/g, '&amp;').replace(/"null"/g, '"#"');
	createNote(title, body).then(function(){
		console.log('ok');
	}).catch(function(err){
		console.log(err);
	});
});
