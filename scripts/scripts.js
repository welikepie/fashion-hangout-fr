/*global $:true, _:true, Backbone:true, gapi:true, Modernizr:true, flowplayer:true, _gaq:true */
window.init = function () {
	"use strict";

	_.templateSettings = {
		'interpolate' : /(?:&lt;|%3C|<)(?:%21|!)--(?:%21|!)(.+?)(?:%21|!)--(?:>|%3E|&gt;)/g,
		'evaluate' : /(?:&lt;|%3C|<)(?:%21|!)--%(.+?)%--(?:>|%3E|&gt;)/g
	};

		// Utility Belt
	var MessageBus,
		AppView,
		CollectionView,
		admin,

		// Data Models
		Video, Clothing,

		// Data Collections
		Playlist, Outfit,

		// Data Views & Controllers
		VideoFeed, PlaylistView,
		Catalogue, Wishlist,
		MessageDisplay,

		App;

	// MESSAGE BUS
	// A singleton for coordinating the communication
	// with other instances of the fashion hangout app - especially
	// the issue of syncing the admin status and playback.
	MessageBus = (function () {

		var Root = function () {

			var message_pass = function (ev) {
					this.receive(ev.message);
				}.bind(this);

			gapi.hangout.onApiReady.add(function () {
				gapi.hangout.data.onMessageReceived.add(message_pass);
			});

		};

		Root.prototype.statesToKeep = ['admin', 'playlist', 'playback'];

		Root.prototype.send = function (type) {

			var message, args = Array.prototype.slice.call(arguments, 1);
			if (args.length === 1) { args = args[0]; }
			message = ('' + type) + ':' + JSON.stringify(args);

			this.sendRaw(message);

		};

		Root.prototype.sendEcho = function (type) {
			var message, args = Array.prototype.slice.call(arguments, 1);
			if (args.length === 1) { args = args[0]; }
			message = ('' + type) + ':' + JSON.stringify(args);

			this.sendRaw(message);
			this.receive(message);
		};

		Root.prototype.sendRaw = gapi.hangout.data.sendMessage.bind(gapi.hangout.data);

		Root.prototype.receive = function (message) {
			var match = message.match(/^([a-zA-Z0-9_-]+):(.+)$/);
			if (match) {
				match = [
					match[1],
					JSON.parse(match[2])
				];
				if (_.contains(this.statesToKeep, match[0])) { this.state.set(match[0], match[1]); }
				this.trigger.apply(this, match);
			}
		};

		Root.prototype.state = function (stateName) {
			var val = gapi.hangout.data.getValue(stateName);
			if (typeof val !== 'undefined') { val = JSON.parse(val); }
			return val;
		};

		Root.prototype.state.set = function (stateName, stateValue) {
			gapi.hangout.data.setValue(stateName, JSON.stringify(stateValue));
		};

		_.extend(Root.prototype, Backbone.Events);
		return new Root();

	}());

	AppView = Backbone.View.extend({
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
		'appInitialize': function () {}
	});

	CollectionView = AppView.extend({
	
		'container': null,
		'template': null,
		
		'initialize': function (opts) {
		
			var temp, template_func;
			
			AppView.prototype.initialize.call(this, _.pick(opts, 'collection', 'el'));
			
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

	admin = function (wrapped) {
		if (typeof wrapped === 'function') {
			return function () {
				if (admin()) { return wrapped.apply(this, arguments); }
			};
		} else {
			var val = (typeof wrapped === 'string') ? wrapped : MessageBus.state('admin');
			return (App.local.id === val);
		}
	};

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

	Outfit = Backbone.Collection.extend({
	
		'model': Clothing,
		'comparator': 'id',

		'initialize': function (items, opts) {
			opts = opts || {};
			if ('comparator' in opts) { this.comparator = opts.comparator; }
			Backbone.Collection.prototype.initialize.apply(this, arguments);
		}
	
	});
	
	VideoFeed = AppView.extend((function () {
	
		var init_func,
			root = {
				'feed': null,
				'playlist': null,
				'initialize': function (opts) {
				
					AppView.prototype.initialize.apply(this, [_.pick(opts, 'collection', 'el', 'app')]);
					
					if (('playlist' in opts) && (opts.playlist instanceof PlaylistView)) {
						this.playlist = opts.playlist;
						this.playlist.feed = this;
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
					
					this.listenTo(this.collection, 'currentChanged', function (currentVideo) {
						this.render();
						if (admin()) { MessageBus.send('playlist', this.collection.indexOf(currentVideo)); }
					});
					
					init_func.apply(this, arguments);
				
				}
			};
		
		if (Modernizr.video) {
		
			init_func = function (opts) {

				var temp, template_func;
			
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
				
				} else { throw new Error('We need a feed!'); }
			
			};
			
			root.play = function () { $('video', this.feed).get(0).play(); };
			root.pause = function () { $('video', this.feed).get(0).pause(); };
		
			root.render = function () {
		
				var current = this.collection.getCurrent(),
					new_feed;
				
				if (current) {
					new_feed = this.template(current.toJSON());
				} else {
					new_feed = this.template({
						'name': ' ',
						'description': 'Click on any of the videos below to start the playback!',
						'poster': '',
						'sources': {}
					});
				}

				$('video', new_feed)
					//.on('ended', function () { if (admin()) { this.collection.nextVideo(); } }.bind(this))
					.on('play', function () { if (admin()) { MessageBus.send('playback', 'play'); } })
					.on('pause', function () { if (admin()) { MessageBus.send('playback', 'pause'); } });
				
				if (this.feed) {
					$(this.feed).replaceWith(new_feed);
				} else {
					this.$el.prepend(new_feed);
				}
				this.feed = new_feed;
			
			};
		
		} else {
		
			init_func = function (opts) {
			
				if (typeof opts.feed === 'object') {
					this.feed = opts.feed;
				} else {
					this.feed = $(opts.feed).appendTo(this.el).empty().get(0);
				}
				
				this.player = flowplayer(this.feed, 'scripts/other/flowplayer-3.2.15.swf', {
					'clip': { // Clip is an object, hence '{...}'
						'autoPlay': false,
						'autoBuffering': true,
						'scaling': 'fit',

						//'onFinish': this.collection.nextVideo.bind(this.collection),
						'onResume': function () { if (admin()) { MessageBus.send('playback', 'play'); } },
						'onPause': function () { if (admin()) { MessageBus.send('playback', 'pause'); } }
					}
				});
			
			};
			
			root.play = function () { this.player.resume(); };
			root.pause = function () { this.player.pause(); };
			
			root.render = _.debounce(function () {
		
				var current = this.collection.getCurrent(),
					video_url = current ? current.get('sources')['video/mp4'] || '' : '';
				
				this.player.play(video_url);
			
			}, 100);
		
		}
		
		return root;
	
	}()));

	/*VideoFeed = AppView.extend({
	
		'feed': null,
		'template': null,
		'playlist': null,
	
		'initialize': function (opts) {
		
			var temp, template_func;
		
			AppView.prototype.initialize.apply(this, [_.pick(opts, 'collection', 'el', 'app')]);
			
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
			
			this.listenTo(this.collection, 'currentChanged', function (currentVideo) {
				this.render();
				if (admin()) { MessageBus.send('playlist', this.collection.indexOf(currentVideo)); }
			});

		},

		'play': function () { $('video', this.feed).get(0).play(); },
		'pause': function () { $('video', this.feed).get(0).pause(); },
		
		'render': _.debounce(function () {
		
			var current = this.collection.getCurrent(),
				new_feed;
			
			if (current) {
				new_feed = this.template(current.toJSON());
			} else {
				new_feed = this.template({
					'name': ' ',
					'description': 'Click on any of the videos below to start the playback!',
					'poster': '',
					'sources': {}
				});
			}

			$('video', new_feed)
				.on('ended', this.collection.nextVideo.bind(this.collection))
				.on('play', function () { if (admin()) { MessageBus.send('playback', 'play'); } })
				.on('pause', function () { if (admin()) { MessageBus.send('playback', 'pause'); } });
			
			if (this.feed) {
				$(this.feed).replaceWith(new_feed);
			} else {
				this.$el.prepend(new_feed);
			}
			this.feed = new_feed;
		
		}, 10)
	
	});*/

	PlaylistView = CollectionView.extend((function () {
	
		var setup = {},
			thumbnail_offset,
			current_index = 0,
			//max_index = 0,
			adjust_position;
		
		adjust_position = _.debounce(function (index) {
		
			var items = this.$container.children(),
				new_offset, old_offset;

			// Obtain thumbnail offset for the first
			if (typeof thumbnail_offset === 'undefined') { thumbnail_offset = items.eq(1).position().left || 0; }
			
			// Adjust index
			if (index < 0) { index = 0; }
			if (index >= items.length) { index = items.length - 1; }
			/* uncomment later if (index > max_index) { index = max_index; } */

			new_offset = index * -thumbnail_offset;
			old_offset = this.$container.css('text-indent').match(/^(-?[0-9]+)(?:px)?$/i);
			if (old_offset) { old_offset = parseInt(old_offset[1], 10); } else { old_offset = 0; }
			
			/* uncomment later if ((contents_width - new_offset) < container_width) {
				new_offset = contents_width - container_width;
			}*/
			
			if (old_offset !== new_offset) {
				this.$container.css('text-indent', new_offset + 'px');
			}
			
			current_index = index;
		
		}, 250);
		
		setup.controls = null;

		setup.initialize = function (opts) {
		
			if (('collection' in opts) && (opts.collection instanceof Playlist)) {
			
				CollectionView.prototype.initialize.apply(this, arguments);
				
				if ('controls' in opts) {
					this.controls = {
						'prev': $('.prev', opts.controls),
						'next': $('.next', opts.controls)
					};
				}
				
				adjust_position = adjust_position.bind(this);
				
				this.listenTo(this.collection, 'currentChanged', this.render);
				this.controls.prev.on('click', admin(this.scrollPrev).bind(this));
				this.controls.next.on('click', admin(this.scrollNext).bind(this));
				this.render();

				this.listenTo(MessageBus, 'admin', function (id) {
					this.$el[admin(id) ? 'addClass' : 'removeClass']('active');
				});
			
			} else {
				throw new Error('Collection of type Playlist is required.');
			}
		
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

					el.on('click', function () {
						this.collection.setCurrent(model);
						if (this.feed) { this.feed.play(); }
					}.bind(this));
					//el.on('click', admin(this.collection.setCurrent).bind(this.collection, model));

					return el.get(0);
				
				}.bind(this)));
			
			return this;
		
		}, 10);
	
		return setup;
	
	}()));

	Catalogue = CollectionView.extend({

		'overCollection': false,
	
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
					
					var el = $(this.template(model.toJSON()))
						.on('click', this.trigger.bind(this, 'addedToWishlist', model));

					if (Modernizr.draganddrop) {

						el
							.on('dragstart', function (ev) {
								if (ev.dataTransfer) {
									ev.dataTransfer.effectAllowed = 'copy';
									ev.dataTransfer.setData("application/x-bookmark", model.id);
								}
								if (ev.originalEvent.dataTransfer) {
									ev.originalEvent.dataTransfer.effectAllowed = 'copy';
									ev.originalEvent.dataTransfer.setData("application/x-bookmark", model.id);
								}
							})
							.on('dragend', function () {
								if (this.overCollection) { this.trigger('addedToWishlist', model); }
								this.overCollection = false;
							}.bind(this));

					}

					return el.get(0);
				
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
				this.collection = new Outfit([], {'comparator': null});
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

								_gaq.push(['_trackEvent', 'Interaction', 'Collection Shared']);

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

			var col = this.collection.toArray().reverse();
		
			this.$container
				.empty()
				.append(_.map(col, function (model) {
				
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

	MessageDisplay = AppView.extend({
		'initialize': function (opts) {
			
			var template_func, temp;
			opts = opts || {};
			AppView.prototype.initialize.apply(this, arguments);
			
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

			this.messages = (function () {
				var t = _.extend([], Backbone.Events);
				t.push = function () {
					var result = Array.prototype.push.apply(this, arguments);
					this.trigger('add', arguments);
					return result;
				};
				t.unshift = function () {
					var result = Array.prototype.unshift.apply(this, arguments);
					this.trigger('add', arguments);
					return result;
				};
				t.pop = function () {
					var result = Array.prototype.pop.apply(this, arguments);
					this.trigger('remove', arguments);
					return result;
				};
				t.shift = function () {
					var result = Array.prototype.shift.apply(this, arguments);
					this.trigger('remove', arguments);
					return result;
				};
				return t;
			}());

			this.listenTo(this.messages, 'add', this.render);

		},
		'show': function (message, type) {
			if (typeof type === 'string') { type = 'alert-' + type; }
			else { type = ''; }
			this.messages.push({
				'message': message,
				'type': type
			});
		},
		'render': _.debounce(function () {
			var el, fade_func = function () { $(this).remove(); };
			while (this.messages.length) {
				el = $(this.template(this.messages.shift())).on('click', fade_func).get(0);
				window.setTimeout(fade_func.bind(el), 3000);
				this.$el.append(el);
			}
		}, 500)
	});

	gapi.hangout.onApiReady.add(function () { /*try {*/

		var playlist = new Playlist(),
			messages = new MessageDisplay({
				'el': $('#messages').get(0),
				'template': $('#messages div').get(0)
			});

		// Have message display show stuff from message bus
		messages.listenTo(MessageBus, 'message', messages.show);
		messages.listenTo(MessageBus, 'playback', function (state) {
			App.video[state]();
			messages.show('Video has been ' + (state === 'pause' ? 'paused.' : 'resumed.'));
		});

		App = Backbone.View.extend({
		
			'video': null,
			'catalogue': null,
			'wishlist': null,

			'local': gapi.hangout.getLocalParticipant(),
			
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

					// Bind the message bus on playlist & playback events to ensure
					// both are kept in sync with the current admin of the playlist.
					this.listenTo(MessageBus, 'playback', function (state) {
						if (!admin()) { this.video[state](); }
					});
					this.listenTo(MessageBus, 'playlist', function (index) {
						if (!admin()) {
							this.video.collection.setCurrent(index);
							MessageBus.receive('message:' + JSON.stringify('The video has been changed!'));
						}
					});
					
					// Bind the video change to display new catalogue.
					this.listenTo(this.collection, 'currentChanged', function (current) {
						if (current instanceof Video) {
							this.catalogue.collection = current.get('outfit');
						} else {
							this.catalogue.collection = null;
						}
						this.catalogue.render();
					}.bind(this));

					// Bind the event on item being added to wishlist
					this.listenTo(this.catalogue, 'addedToWishlist', function (item) {
						
						_gaq.push(['_setCustomVar', 1, 'Clothing Item', '' + item.get('id')]);
						_gaq.push(['_trackEvent', 'Interaction', 'Item Added']);
						_gaq.push(['_deleteCustomVar', 1]);

						this.wishlist.collection.add(item);

						if (item.get('name')) {
							MessageBus.send(
								'message',
								this.local.person.displayName +
								' has added ' + item.get('name') + ' to their wishlist.'
							);
						}
					
					}.bind(this));
				
				} else { throw new Error('Need a playlist.'); }

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
						local_id = this.local.id,
						oldest_id = _.chain(participants)
							.pluck('id')
							.min(function (id) { return (id in state) ? parseInt(state[id], 10) : (new Date()).getTime(); })
							.value();

					if (local_id === oldest_id) {
						MessageBus.sendEcho('admin', local_id);
					}

				};

				gapi.hangout.data.setValue(this.local.id, (new Date()).getTime() + '');
				gapi.hangout.onEnabledParticipantsChanged.add(admin_assignment.bind(this));
				window.setTimeout(admin_assignment.bind(this, gapi.hangout.getEnabledParticipants()), 1000);
			
			}
		
		});

		App = new App({

			'collection': playlist,
			'video': new VideoFeed({
		
				'collection': playlist,
				'el': $('#video').get(0),
				'feed': $('#video #feed').get(0),
				
				'playlist': new PlaylistView({
				
					'collection': playlist,
					'el': $('#video #playlist').get(0),
					'container': $('#video #playlist .items').get(0),
					'template': $('#video #playlist .items > *').get(0),
					'controls': $('#video #playlist .controls').get(0)
				
				})
			
			}),
			'catalogue': new Catalogue({
			
				'el': $('#catalogue').get(0),
				'container': $('#catalogue .items').get(0),
				'template': $('#catalogue .items li').get(0)
			
			}),
			'wishlist': new Wishlist({
			
				'el': $('.side').get(0),
				'container': $('.side #collection .items').get(0),
				'template': $('.side #collection .items li').get(0),
				'shareUrl': 'http://bethebuyer.topshop.com/share/'
			
			})

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
					// Sync current video
					var state = gapi.hangout.data.getState();
					if ('playlist' in state) { playlist.setCurrent(parseInt(state.playlist, 10)); }
				
				});
			
			$.ajax({
				'url': 'data/videos.jsonp',
				'type': 'GET',
				'dataType': 'jsonp',
				'jsonpCallback': 'jsonp1',
				'crossDomain': true,
				'success': function (data) {
					video_data = data;
					process_func();
				}
			});
			$.ajax({
				'url': 'data/clothing.jsonp',
				'type': 'GET',
				'dataType': 'jsonp',
				'jsonpCallback': 'jsonp2',
				'crossDomain': true,
				'success': function (data) {
					clothing_data = data;
					process_func();
				}
			});
		
		}());

		// Drag-n-drop
		if (Modernizr.draganddrop) {

			$('#collection .items')
				.on('dragover', function (ev) {
					ev.preventDefault();
					return false;
				})
				.on('dragenter', function (ev) {
					ev.preventDefault();
					ev.stopPropagation();
					if (ev.dataTransfer) { ev.dataTransfer.dropEffect = 'copy'; }
					if (ev.originalEvent.dataTransfer) { ev.originalEvent.dataTransfer.dropEffect = 'copy'; }
					App.catalogue.overCollection = true;
					return false;
				})
				.on('dragleave', _.debounce(function (ev) {
					ev.preventDefault();
					ev.stopPropagation();
					App.catalogue.overCollection = false;
					return false;
				}, 100));

		}

	/*} catch (e) { console.dir(e); }*/ });

};