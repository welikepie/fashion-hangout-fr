/*global $:true, _:true, Backbone:true, gapi:true */
(function () {
	"use strict";
	
	_.templateSettings = {
		'interpolate' : /(?:&lt;|<)!--!(.+?)!--(?:>|&gt;)/g,
		'evaluate' : /(?:&lt;|<)!--%(.+?)%--(?:>|&gt;)/g
	};
	
	var SubView,
		CollectionView,
	
		Video,
		Playlist,
		VideoFeed,
		PlaylistView,
		
		Clothing,
		Outfit,
		Catalogue,
		Wishlist,

		MessageBus,
		
		AppView;

	SubView = Backbone.View.extend({
		'app': null,
		'setApp': function (app) {
			this.app = app;
			this.appInitialize(this.app);
			this.trigger('appSet', this.app);
		},
		'initialize': function (opts) {
			opts = opts || {};
			Backbone.View.prototype.initialize.apply(this, arguments);
			if ('app' in opts) { this.setApp(opts.app); }
		},
		'appInitialize': function (app) {}
	});
	
	CollectionView = SubView.extend({
	
		'container': null,
		'template': null,
		
		'initialize': function (opts) {
		
			var temp, template_func;
			
			SubView.prototype.initialize.call(this, _.pick(opts, 'collection', 'el'));
			
			if ('container' in opts) {
				if ((opts.container === this.el) || ($.contains(this.el, opts.container))) {
					this.container = opts.container;
					this.$container = $(this.container);
				} else if ((typeof opts.container === 'string') && $(opts.container, this.el).length) {
					this.$container = $(opts.container, this.el).eq(0);
					this.container = this.$container[0];
				}
			} else {
				this.container = this.el;
				this.$container = this.$el;
			}
			
			if ('template' in opts) {
				if (typeof opts.template === 'object') {
					temp = document.createElement('div');
					$(opts.template).remove().appendTo(temp);
					temp = temp.innerHTML;
				} else {
					temp = opts.template;
				}
				
				template_func = _.template(temp);
				this.template = function (data) {
					var temp = document.createElement('div');
					temp.innerHTML = template_func(data);
					return temp.removeChild(temp.childNodes[0]);
				};
			} else {
				this.template = function () { return document.createElement('div'); };
			}
		
		}
	
	});

	/**
	Backbone model used as representation of a single video.
	
	A representation of a video to be played in the app, this class contains several
	properties representative of that video. For informational purposes, name and short
	description. For video playback, URL to poster (image used in place of video before it
	starts being played) and collection of sources (URLs to videos of different codecs, along
	with their MIME types, for embedding into the app).
	Additionally, each video carries a Backbone collection of items that are being presented
	in said video. These items will be displayed on the screen along with the video to interact with.
	
	@class Video
	@extends Backbone.Model
	@constructor
	
	@param {Object} [attributes]  Initial values of the model.
	@param {Object} [options]     Additional configuration options.
	**/
	Video = Backbone.Model.extend({
	
		/* MODEL PROPERTIES */
		
		/**
		Unique identifier of the video, also used to determine the video's position when ordering the {{#crossLink "Playlist"}}{{/crossLink}}.
		@property id
		@type Integer
		**/
		/**
		Name of the video.
		@property name
		@type String
		**/
		/**
		Short description of the video, couple of words to describe its contents.
		@property description
		@type String
		**/
		/**
		Collection of all items of clothing shown in the video.
		@property outfit
		@type Outfit
		**/
		/**
		URL of an image used as video placeholder before the video starts playing.
		@property poster
		@type String
		**/
		/**
		Collection of all video files representing the video in different file formats.
		Key is a MIME type of the file, while value is its URL.
		@property sources
		@type Object
		@example
			{
				'video/mp4': 'http://example.com/video.mp4',
				'video/webm': 'http://example.com/video.webm',
				'video/ogg': 'http://example.com/video.ogv'
			}
		**/

		/**
		Implementation of `Backbone.Model.validate()` method.
		
		Validation ensures all the parameters are accounted for, as well as their types.
		
		`id` needs to be a positive integer.  
		`name`, `description` and `poster` need to be valid strings.  
		`sources` needs to have all its entries adhere to format of `[MIME type] => [video file URL]`.  
		`outfit` needs to be an instance of `Outfit` collection.
		
		@method validate
		@param  {Object} attrs      Model's attributes to be validated.
		@return {undefined|String}  Error description if validation failed, nothing otherwise.
		@private
		**/
		'validate': function (attrs) {
			
			// ID must be an integer equal or bigger than 0
			if (!(
				('id' in attrs) &&
				(typeof attrs.id === 'number') &&
				(attrs.id >= 0)
			)) {
				return 'ID is incorrect.';
			}
			
			// Name, description and poster are simple strings
			if (!_.all(['name', 'description', 'poster'], function (str) {
				return ((str in attrs) && (typeof attrs[str] === 'string'));
			})) {
				return 'Text fields are incorrect.';
			}
			
			// Sources have to be a hash of [video MIME type] => [URL]
			if (!(('sources' in attrs) && _.all(attrs.sources, function (val, key) {
				return (
					key.match(/^video\/[A-Za-z0-9]+$/) &&
					(typeof val === 'string')
				);
			}))) {
				return 'Sources are incorrect.';
			}
			
			// Outfit is a Backbone collection for clothing items
			if (!(
				('outfit' in attrs) &&
				(attrs.outfit instanceof Outfit)
			)) {
				return 'Outfit is incorrect.';
			}
			
		}
	
	});
	
	/**
	Backbone collection of multiple videos, acting as a controllable playlist.
	
	Ordered collection of videos, utilised by the playback interface both as means
	to easily manage the details for both view and preview, as well as to allow for
	an easier control of playback (by maintaining the state of current video, as well
	as methods to easily switch to previous or next one).
	
	@class Playlist
	@extends Backbone.Collection
	@constructor
	
	@param {Array}  [models]      Initial contents of the collection.
	@param {Object} [options]     Additional configuration options.
	**/
	Playlist = Backbone.Collection.extend({
	
		/**
		Playlist is assigned default model of `Video` by default.
		Can be changed via additional options on initialisation, if required.
		
		@property  model
		@type      Backbone.Model
		@default   Video
		@private
		**/
		'model': Video,
		
		/**
		Items in collection are, by default, ordered by their pre-assigned ID.
		Different property can be specified for sorting via additional options on
		initialisation (sorting can be disabled completely by passing `false`).
		
		@property  comparator
		@type      String|false
		@default   'id'
		@private
		**/
		'comparator': 'id',
		
		/**
		Collection initialisation is a pass-through too standard `Backbone.Collection.initialize()`,
		with the addition of two settings regarding current video. Both when initialised with
		default values and when using `reset()`, if there are values present in collection, current
		video is set to be the first one in the collection.
		
		@method initialize
		@private
		**/
		'initialize': function () {
		
			Backbone.Collection.prototype.initialize.apply(this, arguments);
			
			// Should there be objects in collection after initialising,
			// or on collection reset, set the current video to be the
			// first one from the set.
			this.on('reset', function (collection) {
				this.setCurrent((collection.length > 0) ? 0 : null);
			});

			// Trigger reset to fire all relevant events on initialisation
			this.trigger('reset', this);
		
		},
		
		/**
		Property holding the current video in the playlist (the one on the
		playback, essentially). Can be either an instance of `Video` in the
		collection or `null` if no videos are being played.
		
		@property  currentVideo
		@type      Video|null
		@default   null
		**/
		'currentVideo': null,
		
		/**
		Event triggered whenever current video in the playlist changes
		(playback starts from nothing, playback stops or different video is selected).
		Triggers with a single argument, which is the new playback, be it another instance
		of `Video` or `null` in case of nothing playing.
		
		@event  currentChanged
		@param  {Video|null}   currentVideo  Instance of `Video` kicking into playback or `null` if nothing is played.
		**/
		
		/**
		Retrieves the current video. Can be an instance of `Video` or `null`,
		depending on whether anything is on playback.
		
		@method  getCurrent
		@return  {Video|null}  Currently played video or `null` if nothing is played.
		**/
		'getCurrent': function () {
			return this.currentVideo;
		},
		
		/**
		Sets the currently played video (or stops the playback).
		
		This method behaves twofold. Given `null` as parameters, it will stop any playback.
		Given integer or instance of `Video` contained within the collection, it will change
		the currently played video either the provided instance (if `Video` was used as parameter)
		or to the video in collection at provided index (if integer was given as parameter).
		
		If the state of currently played video has changed, `currentChange` event will be fired
		(calls that wouldn't change the current video, for example using `Video` instance from
		`getCurrent()`, will effectively be a no-op).
		
		Usage of either an invalid index (out of range of values in collection) or invalid `Video`
		instance (not inside the collection) will result in no-op. Usage of anything but `null`,
		instance of `Video` or an integer will throw an error.
		
		@method setCurrent
		@param  {Video|Integer|null} item  Instance of `Video` to play, index of video in collection or `null` to stop playback.
		**/
		'setCurrent': function (item) {
		
			// Save old value for comparison after change
			var oldCurrent = this.currentVideo;
			
			// Disable playback on null
			if (item === null) {
			
				this.currentVideo = null;
			
			// If number, use it as an index and retrieve the value from collection
			// (if value can't be retrieved [out of range], it's a no-op)
			} else if (typeof item === 'number') {
			
				if (this.at(item)) {
					this.currentVideo = this.at(item);
				}
			
			// If instance of Video, check if in collection.
			// If in collection, set as current video, no-op otherwise.
			} else if (item instanceof this.model) {
			
				if (this.contains(item)) {
					this.currentVideo = item;
				}
			
			// Any other argument types should throw an error.
			} else {
				throw new Error('Incorrect argument; needs to be either index or Video model.');
			}
			
			// Compare new current video to old current video.
			// If any change is detected, trigger currentChanged event.
			if (this.currentVideo !== oldCurrent) {
				this.trigger('currentChanged', this.currentVideo);
			}
		
		},
		
		/**
		Change playback to the previous video in playlist.
		
		Playlist wraps around, so if currently at the first video, playback will be
		changed to the last one. Additionally, if no playback, last video will be
		made current.
		
		@method prevVideo
		**/
		'prevVideo': function () {
			if (this.currentVideo === null) {
				this.setCurrent(this.length - 1);
			} else {
				var inx = this.indexOf(this.currentVideo) - 1;
				if (inx < 0) { inx = this.length - 1; }
				this.setCurrent(inx);
			}
		},
		
		/**
		Change playback to the next video in playlist.
		
		Playlist wraps around, so if currently at the last video, playback will be
		changed to the first one. Additionally, if no playback, first video will be
		made current.
		
		@method nextVideo
		**/
		'nextVideo': function () {
			if (this.currentVideo === null) {
				this.setCurrent(0);
			} else {
				this.setCurrent((this.indexOf(this.currentVideo) + 1) % this.length);
			}
		}
	
	});
	
	PlaylistView = CollectionView.extend((function () {
	
		var setup = {},
		
			contents_width = 0,
			container_width = 0,
			adjust_width,
			
			current_index = 0,
			max_index = 0,
			adjust_position,

			admin_only = function (wrapped) {
				var admin = (this.app && this.app.admin);
				return function () {
					if (admin) { wrapped.apply(this, arguments); }
				};
			};
		
		adjust_width = _.debounce(function () {
		
			var items = this.$container.children(),
				width = 0,
				i;
			
			items.each(function () { width += $(this).width() + 16; });
			contents_width = width;
			
			for (i = width = 0; i < items.length; i += 1) {
				width += items.eq(i).width() + 16;
				if (contents_width - width < container_width) {
					max_index = i + 1;
					break;
				}
			}
		
		}, 250);
		
		adjust_position = _.debounce(function (index) {
		
			var items = this.$container.children(),
				new_offset, old_offset;
			
			// Adjust index
			if (index < 0) { index = 0; }
			if (index >= items.length) { index = items.length - 1; }
			/* uncomment later if (index > max_index) { index = max_index; } */
			
			// Obtain existing index
			old_offset = this.$container.css('left').match(/^(-?[0-9]+)px$/i);
			if (old_offset) { old_offset = parseInt(old_offset[1], 10); } else { old_offset = 0; }
			new_offset = items.eq(index).position().left;
			
			/* uncomment later if ((contents_width - new_offset) < container_width) {
				new_offset = contents_width - container_width;
			}*/
			
			if (old_offset !== new_offset) {
				this.$container.css('left', (new_offset * -1) + 'px');
			}
			
			current_index = index;
		
		}, 250);
		
		setup.controls = null;

		setup.initialize = function (opts) {
		
			if (('collection' in opts) && (opts.collection instanceof Playlist)) {

				admin_only = admin_only.bind(this);
			
				CollectionView.prototype.initialize.apply(this, arguments);
				
				if ('controls' in opts) {
					this.controls = {
						'prev': $('.prev', opts.controls),
						'next': $('.next', opts.controls)
					};
				}
				
				adjust_position = adjust_position.bind(this);
				adjust_width = adjust_width.bind(this);
				container_width = this.$container.width();
				
				this.listenTo(this.collection, 'currentChanged', this.render);
				this.controls.prev.on('click', admin_only(this.scrollPrev).bind(this));
				this.controls.next.on('click', admin_only(this.scrollNext).bind(this));
				this.render();
			
			} else {
				throw new Error('Collection of type Playlist is required.');
			}
		
		};

		setup.appInitialize = function (app) {
			console.log('App set to ', app);
			this.listenTo(app, 'setAdmin', function (admin) {
				console.log('setAdmin to ', admin);
				if (this.controls) { this.$el[admin ? 'addClass' : 'removeClass']('active'); }
			});
		};
		
		setup.scrollTo = function (index) {
			adjust_position(index);
		};
		
		setup.scrollPrev = function () {
			adjust_position(current_index - 1);
		};
		
		setup.scrollNext = function () {
			adjust_position(current_index + 1);
		};
		
		setup.render = _.debounce(function () {
		
			this.$container
				.empty()
				.append(this.collection.map(function (model) {
				
					var el = $(this.template(model.toJSON()));
					el
						.on('click', function () {
							if (this.app.admin) {
								this.collection.setCurrent(model);
								gapi.hangout.data.sendMessage('playlist:' + this.collection.indexOf(model));
							}
						}.bind(this))
						.find('img')
							.on('load', adjust_width);
					
					return el.get(0);
				
				}.bind(this)));
			
			return this;
		
		}, 10);
	
		return setup;
	
	}()));
	
	VideoFeed = SubView.extend({
	
		'feed': null,
		'template': null,
		'playlist': null,
	
		'initialize': function (opts) {
		
			var temp, template_func;
		
			SubView.prototype.initialize.apply(this, [_.pick(opts, 'collection', 'el', 'app')]);
			
			if ('feed' in opts) {
			
				if (typeof opts.feed === 'object') {
					this.feed = opts.feed;
					temp = document.createElement('div');
					$(opts.feed).clone().remove().appendTo(temp);
					temp = temp.innerHTML;
				} else {
					temp = opts.feed;
				}
				
				template_func = _.template(temp);
				this.template = function (data) {
					var temp = document.createElement('div');
					temp.innerHTML = template_func(data);
					return temp.removeChild(temp.childNodes[0]);
				};
			
			} else {
				throw new Error('We need a feed!');
			}
			
			if (('playlist' in opts) && (opts.playlist instanceof PlaylistView)) {
				this.playlist = opts.playlist;
				if (this.playlist.collection !== this.collection) {
					this.playlist.collection = this.collection;
					this.playlist.render();
				}
			} else {
				this.playlist = new PlaylistView({
					'collection': this.collection,
					'el': $(document.createElement('div')).appendTo(this.el).get(0)
				});
			}
			
			this.listenTo(this.collection, 'currentChanged', this.render);

		},

		'appInitialize': function (app) {
			if (this.playlist) {
				this.playlist.setApp(app);
			}
		},
		
		'render': _.debounce(function () {
		
			var current = this.collection.getCurrent(),
				new_feed;
			
			if (current) {
			
				new_feed = this.template(current.toJSON());
				$('video', new_feed).on('ended', this.collection.nextVideo.bind(this.collection));
			
			} else {
			
				new_feed = this.template({
					'name': ' ',
					'description': 'Click on any of the videos below to start the playback!',
					'poster': '',
					'sources': {}
				});
			
			}
			
			if (this.feed) {
				$(this.feed).replaceWith(new_feed);
			} else {
				this.$el.prepend(new_feed);
			}
			this.feed = new_feed;
		
		}, 10)
	
	});
	
	Clothing = Backbone.Model.extend({
	
		'validate': function (attrs) {
			
			// ID must be an integer equal or bigger than 0
			if (!(
				('id' in attrs) &&
				(typeof attrs.id === 'number') &&
				(attrs.id >= 0)
			)) {
				return 'ID is incorrect.';
			}
			
			// Name, description and photo are simple strings
			if (!_.all(['name', 'description', 'photo'], function (str) {
				return ((str in attrs) && (typeof attrs[str] === 'string'));
			})) {
				return 'Text fields are incorrect.';
			}
			
		}
	
	});
	
	Outfit = Backbone.Collection.extend({
	
		'model': Clothing,
		'comparator': 'id'
	
	});
	
	Catalogue = CollectionView.extend({
	
		'initialize': function () {
		
			CollectionView.prototype.initialize.apply(this, arguments);
			
			if (!(this.collection instanceof Outfit)) {
				this.collection = new Outfit();
			}
		
		},
		
		'render': _.debounce(function () {
		
			this.$container
				.empty()
				.append(this.collection.map(function (model) {
				
					var el = this.template(model.toJSON());
					$('a', el).on('click', this.trigger.bind(this, 'addedToWishlist', model));
					return el;
				
				}.bind(this)));
			
			return this;
		
		}, 10)
	
	});
	
	Wishlist = CollectionView.extend({
	
		'shareUrl': null,
		'shareButton': null,
	
		'initialize': function (opts) {
			
			CollectionView.prototype.initialize.apply(this, arguments);
			
			if (!(this.collection instanceof Outfit)) {
				this.collection = new Outfit();
			}
			
			if (('shareUrl' in opts) && (typeof opts.shareUrl === 'string')) {
				this.shareUrl = opts.shareUrl;
			} else {
				throw new Error('We need base for shares!');
			}
			
			if (this.$el.find('.share').length) {
				this.shareButton =
					this.$el
						.find('.share')
						.on('click', function () {
						
							if (this.collection.length) {
								window.open(
									'https://plus.google.com/share?url=' + encodeURIComponent(this.shareButton.fullUrl),
									'',
									'menubar=no,toolbar=no,resizable=yes,scrollbars=yes,height=600,width=600'
								);
							}
						
						}.bind(this));
			}
			
			this.listenTo(this.collection, 'add remove reset', this.render);
		
		},
		
		'render': _.debounce(function () {
		
			this.$container
				.empty()
				.append(this.collection.map(function (model) {
				
					var el = this.template(model.toJSON());
					$('a', el).on('click', function () {
						this.collection.remove(model);
					}.bind(this));
					return el;
				
				}.bind(this)));
			
			this.shareButton.fullUrl = this.shareUrl + '?c=' + this.collection.pluck('id').join(',');
			
			return this;
		
		}, 10)
	
	});

	MessageBus = SubView.extend({

		'template': null,
		'queue': null,

		'initialize': function (opts) {

			var debounced_render;

			opts = opts || {};
			SubView.prototype.initialize.apply(this, arguments);
			if ('template' in opts) {
				this.template = opts.template;
			}

			this.render = (function () {

				var queue = [],
					func = function () {
						var temp;
						while (queue.length) {
							temp = queue.shift();

							console.log('MESSAGE: ', temp);

						}
					}.bind(this),
					debounced = _.debounce(func, 1000);
				func.add = function (item) {
					queue.push(item);
					debounced();
				};

				return func;

			}.apply(this));

			this.queue = [];
			debounced_render = _.debounce(this.render.bind(this), 1000);
			gapi.hangout.data.onMessageReceived.add(function (ev) {
				this.process(ev.message);
			}.bind(this));

		},

		'process': function (message) {

			if ((typeof message === 'object') && ('message' in message)) { message = message.message; }
			var match = message.match(/^([^:]+):(.+)$/);

			console.log('Parsed message: ', message, match);

			// Display messages
			if (match[1] === 'message') {
				console.log('Dropping message.');
				this.render.add(match[2]);

			}

			// Playback
			else if (match[1] === 'playback') {
				this.app.video[match[2]]();
				console.log('Setting playback.');
				this.render.add('Video has been ' + (match[2] === 'pause' ? 'paused.' : 'started.'));
			}

			// Playlist change
			else if (match[1] === 'playlist') {
				console.log('Setting index ', parseInt(match[2], 10), ' at ', this.app.video.collection);
				this.app.video.collection.setCurrent(parseInt(match[2], 10));
				this.render.add('Video has changed to another one.');
			}

		},

		'render': function () {
			var temp;
			while (this.queue.length) {

				temp = this.queue.shift();
				console.log('MESSAGE: ', temp);

			}
		}

	});
	
	AppView = Backbone.View.extend({
	
		'video': null,
		'catalogue': null,
		'wishlist': null,
		'messages': null,

		'admin': false,
		
		'initialize': function (opts) {
		
			if (('collection' in opts) && (opts.collection instanceof Playlist)) {
			
				Backbone.View.prototype.initialize.apply(this, [{
					'el': document.getElementsByTagName('body')[0],
					'collection': opts.collection
				}]);
				
				if (('video' in opts) && (opts.video instanceof VideoFeed)) {
					this.video = opts.video;
					this.video.setApp(this);
				} else {
					throw new Error('We need a VideoFeed.');
				}
				
				if (('catalogue' in opts) && (opts.catalogue instanceof Catalogue)) {
					this.catalogue = opts.catalogue;
					this.catalogue.setApp(this);
				} else {
					throw new Error('We need a Catalogue.');
				}
				
				if (('wishlist' in opts) && (opts.wishlist instanceof Wishlist)) {
					this.wishlist = opts.wishlist;
					this.wishlist.setApp(this);
				} else {
					throw new Error('We need a Wishlist.');
				}

				if (('messages' in opts) && (opts.messages instanceof MessageBus)) {
					this.messages = opts.messages;
					this.messages.setApp(this);
				}
				
				this.listenTo(this.collection, 'currentChanged', function (current) {

					if (current instanceof Video) {
						this.catalogue.collection = current.get('outfit');
					} else {
						this.catalogue.collection = null;
					}
					
					this.catalogue.render();
				
				}.bind(this));

				this.listenTo(this.catalogue, 'addedToWishlist', function (item) {
				
					this.wishlist.collection.add(item);
					gapi.hangout.data.sendMessage(
						gapi.hangout.getLocalParticipant().person.displayName +
						' has added ' + item.get('name') + ' to their wishlist.'
					);
				
				}.bind(this));
			
			} else {
				throw new Error('Need a playlist.');
			}

			// ADMIN STATUS HANDLING
			// Bit of code to manage who arrives at what time to ensure the
			// user that has arrived first receives the admin status (and once
			// that person leaves, the second user receives the admin status and
			// so on).
			var admin_assignment = function (participants) {

				if ('enabledParticipants' in participants) {
					participants = participants.enabledParticipants; 
				}

				var state = gapi.hangout.data.getState(),
					local_id = gapi.hangout.getLocalParticipant().id,
					oldest_id = _.chain(participants)
						.pluck('id')
						.min(function (id) { return (id in state) ? parseInt(state[id], 10) : (new Date()).getTime(); })
						.value();

				console.log('Running admin assignment...');
				console.log('Local to oldest: ', local_id, oldest_id);
				console.dir(state);

				if (!this.admin && (local_id === oldest_id)) {
					console.log('setAdmin TRUE');
					this.admin = true;
					this.trigger('setAdmin', this.admin);
				} else if (this.admin && (local_id !== oldest_id)) {
					console.log('setAdmin FALSE');
					this.admin = false;
					this.trigger('setAdmin', this.admin);
				}

			}.bind(this);

			gapi.hangout.data.setValue(gapi.hangout.getLocalParticipant().id, (new Date()).getTime() + '');
			gapi.hangout.onEnabledParticipantsChanged.add(admin_assignment);
			admin_assignment(gapi.hangout.getEnabledParticipants());
		
		}
	
	});
	
	// Initialize functionality once the Hangouts API loads correctly
	var init_func = function () {

		console.log(
			'Same account? ',
			gapi.hangout.getLocalParticipant(),
			gapi.hangout.getEnabledParticipants(),
			gapi.hangout.getLocalParticipant() === gapi.hangout.getEnabledParticipants()[0]
		);

		// Initialise appropriate data sets
		var playlist = new Playlist();
	
		var app = new AppView({
		
			'collection': playlist,
			
			'video': new VideoFeed({
		
				'collection': playlist,
				'el': $('#playback').get(0),
				'feed': $('#playback .video').get(0),
				
				'playlist': new PlaylistView({
				
					'collection': playlist,
					'el': $('#playback .playlist').get(0),
					'container': $('#playback .playlist .items').get(0),
					'template': $('#playback .playlist .items li').get(0),
					'controls': $('#playback .controls').get(0)
				
				})
			
			}),
			
			'catalogue': new Catalogue({
			
				'el': $('#catalogue').get(0),
				'container': $('#catalogue .items').get(0),
				'template': $('#catalogue .items li').get(0)
			
			}),
			
			'wishlist': new Wishlist({
			
				'el': $('#wishlist').get(0),
				'container': $('#wishlist .items').get(0),
				'template': $('#wishlist .items li').get(0),
				'shareUrl': 'http://dev.welikepie.com/fashion-hangout-app/share/'
			
			}),

			'messages': new MessageBus()
		
		});

		(function () {
		
			var video_data,
				clothing_data,
				
				process_func = _.after(2, function () {
				
					var results;
					
					results = _.map(video_data, function (item) {
						item.outfit = new Outfit();
						return new Video(item);
					});
					
					_.each(clothing_data, function (item) {
					
						var clothing, outfits = item.outfits;
						delete item.outfits;
						clothing = new Clothing(item);
						
						_.chain(results)
							.filter(function (video) { return _.contains(outfits, video.get('outfit_id')); })
							.each(function (video) { video.get('outfit').add(clothing); });
					
					});
					
					_.invoke(results, 'unset', 'outfit_id');
					
					playlist.reset(results);
				
				});
			
			$.ajax({
				'url': 'data/videos.jsonp',
				'type': 'GET',
				'dataType': 'jsonp',
				'success': function (data) {
					video_data = data;
					process_func();
				}
			});
			$.ajax({
				'url': 'data/clothing.jsonp',
				'type': 'GET',
				'dataType': 'jsonp',
				'success': function (data) {
					clothing_data = data;
					process_func();
				}
			});
		
		}());
	
	};
	if (gapi.hangout.isApiReady()) { init_func(); }
	else { gapi.hangout.onApiReady.add(function () { try { init_func(); } catch (e) { console.log('ERROR: ', e); } }); }
		
	// Strictly interface bits below
	// (one-off, no need for Backbone.View.render)
	$('.toggle-wishlist').on('click', function () {
		var val = $(this).attr('data-switch');
		$(this).attr('data-switch', this.innerHTML);
		this.innerHTML = val;
		
		$('.sidebar').toggleClass('open');
	});

}());