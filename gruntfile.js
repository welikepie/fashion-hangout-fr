/*global module:false, require:true */
module.exports = function (grunt) {
	"use strict";
	
	grunt.initConfig({
	
		'clean': {
			'init': ['build'],
			'release': ['build/index.htm', 'build/styles']
		},
		
		'recess': {
		
			// Linting task runs RECESS without compilation, just for checking
			// the contents of all .less files, to report any errors or warnings.
			'lint': {
				'src': 'styles/*.less',
				'options': {
					'compile': false,
					'compress': false,
					'noIDs': false,
					'noUniversalSelectors': false
				}
			},
			
			// Compilation tasks should only use the main .less files as source;
			// RECESS doesn't process the @import statements, so compiling the file
			// already included with @import will cause duplicates to show up.
			
			// Tasks used for development should disable compression to increase readability.
			'dev': {
				'options': {
					'compile': true,
					'compress': false
				},
				'src': 'styles/*.less',
				'dest': 'build/styles/styles.css'
			},
			
			// Release tasks can match the dev tasks, with compression enabled.
			'release': {
				'options': {
					'compile': true,
					'compress': true
				},
				'src': '<%= recess.dev.src %>',
				'dest': '<%= recess.dev.dest %>'
			}
		
		},
		
		'jshint': {
		
			'options': {
				'immed': true,		// Complains about immediate function invocations not wrapped in parentheses
				'latedef': true,	// Prohibits using a variable before it was defined
				'forin': true,		// Requires usage of .hasOwnProperty() with 'for ... in ...' loops
				'noarg': true,		// Prohibits usage of arguments.caller and arguments.callee (both are deprecated)
				'eqeqeq': true,		// Enforces the usage of triple sign comparison (=== and !==)
				'bitwise': true,	// Forbids usage of bitwise operators (rare and, most likely, & is just mistyped &&)
				'strict': true,		// Enforces usage of ES5's strict mode in all function scopes
				'undef': true,		// Raises error on usage of undefined variables
				'plusplus': true,	// Complains about ++ and -- operators, as they can cause confusion with their placement
				'unused': true,		// Complains about variables and globals that have been defined, but not used
				'curly': true,		// Requires curly braces for all loops and conditionals
				'browser': true		// Assumes browser enviroment and browser-specific globals
			},
			
			'dev': {
				'options': {
					'devel': true,
					'unused': false
				},
				'files': {
					'src': ['gruntfile.js', 'scripts/*.js']
				}
			},
			'release': {
				'options': {
					'devel': false
				},
				'files': {
					'src': 'scripts/*.js'
				}
			}
		
		},
		
		'concat': {
		
			'custom': {
				'options': {'separator': ";\n\n"},
				'files': {'build/scripts/scripts.js':  'scripts/*.js'}
			},
			'vendor': {
				'options': {'separator': ";"},
				'files': {'build/scripts/vendor.js': 'scripts/vendor/**/*.js'}
			}
		
		},
		
		'uglify': {
			'options': {
				'mangle': true,
				'compress': true,
				'preserveComments': false
			},
			'release': {
				'files': {
					'build/scripts/scripts.js': 'scripts/*.js',
					'build/scripts/vendor.js': 'scripts/vendor/**/*.js'
				}
			}
		},
		
		'process': {
			'css': {
				'options': {
					'preprocess': function (content) {
						return content
							.replace(
								/<link(?:[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*|[^>]*href="([^"]+)"[^>]*rel="stylesheet"[^>]*)>/i,
								"<style type=\"text/css\"><%= grunt.file.read('build/$1') %></style>"
							).replace(
								/<!--<base(?:[^>]*)>-->/i,
								"<base href=\"https://raw.github.com/welikepie/fashion-hangout-app/v1/build/\">"
							);
					}
				},
				'files': {'build/index.htm': 'index.htm'}
			},
			'xml': {
				'files': {'build/app.xml': 'app.xml'}
			}
		},
		
		'copy': {
			'html': {
				'files': {'build/index.htm': 'index.htm'}
			}
		},
		
		'watch': {
			'less': {
				'files': 'styles/**/*.less',
				'tasks': ['recess:lint', 'recess:dev']
			},
			'js-main': {
				'files': 'scripts/*.js',
				'tasks': ['jshint:dev', 'concat:custom']
			},
			'js-vendor': {
				'files': 'scripts/vendor/**/*.js',
				'tasks': ['concat:vendor']
			},
			'html': {
				'files': 'index.htm',
				'tasks': ['copy:html']
			}
		}
	
	});
	
	grunt.registerTask('dev', ['clean:init', 'recess:lint', 'recess:dev', 'jshint:dev', 'concat', 'copy', 'watch']);
	grunt.registerTask('release', ['clean:init', 'recess:lint', 'recess:release', 'jshint:release', 'uglify:release', 'process', 'clean:release']);
	grunt.registerTask('default', 'dev');
	
	/* ************************************************ */
	
	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.loadNpmTasks('grunt-contrib-concat');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-contrib-watch');
	grunt.loadNpmTasks('grunt-recess');
	
	grunt.registerMultiTask('process', 'Process files using Grunt templating.', function() {
	
		var path = require('path'),
			helpers = require('grunt-lib-contrib').init(grunt),
		
			options,
			source_files,
			destination_path,
			base_path,
			single_file_source,
			destination_is_file;
	
		path.sep = path.sep || path.normalize('/');
		options = this.options({
			'cwd': false,
			'preprocess': null,
			'postprocess': null
		});
		grunt.verbose.writeflags(options, 'Options');
		
		source_files = grunt.file.expand(this.file.srcRaw);
		destination_path = this.file.dest;
		
		single_file_source = (source_files.length === 1) && (this.file.srcRaw[0] === source_files[0]);
		destination_is_file = !grunt.util._.endsWith(destination_path, path.sep);
		
		if (!destination_is_file) {
			base_path = helpers.findBasePath(source_files, options.basePath);
		}
		
		if (single_file_source) {
			grunt.verbose.or.write('Copying file' + ' to ' + destination_path.cyan + '...');
		} else {
			grunt.verbose.or.write('Copying files' + ' to ' + destination_path.cyan + '...');
		}
		
		source_files.forEach(function (filepath) {
		
			var content,
				destination,
				
				basename,
				dirname;
		
			if (destination_is_file) {
				if (single_file_source) {
			
					destination = destination_path;
			
				} else {
					grunt.fail.warn('Unable to process multiple files to the same destination filename, did you forget a trailing slash?');
				}
			} else {
			
				filepath = path.normalize(filepath);
				basename = path.basename(filepath);
				dirname = path.dirname(filepath);
				
				if (base_path) {
					dirname = grunt.util._(dirname).strRight(base_path).trim(path.sep);
				}
				
				destination = path.join(destination_path, dirname, basename);
			
			}
			
			content = grunt.file.read(filepath);
			if (typeof options.preprocess === 'function') { content = options.preprocess(content); }
			content = grunt.template.process(content);
			if (typeof options.postprocess === 'function') { content = options.postprocess(content); }
			grunt.file.write(destination, content);
		
		});
		
		grunt.verbose.or.ok();
	
	});
	
};