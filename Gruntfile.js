// vim: et sw=2 ts=2
/* global module, require */

const fs = require('fs');
const path = require('path');


function assert_exists(file) {
    if (!fs.existsSync(file)) {
        throw new Error(`File not found: ${file}`);
    }
    return file;
}

function add_prefix(left, right) {
    return assert_exists(path.join(left, right));
}


module.exports = function(grunt) {
  'use strict';

  const dist = 'dist';
  const static_dist = `${dist}/static`;

  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-sass');
  try {
    grunt.loadNpmTasks('grunt-contrib-watch');
  } catch(e) {
    console.warn("Grunt 'watch' is not available");
  }

  debugger;
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    concat: {
      app_deps: {
        src: [
          "jquery/dist/jquery.min.js",
          "long/dist/long.min.js",
          "bytebuffer/dist/ByteBufferAB.min.js",
          "protobuf/dist/ProtoBuf.min.js",
          "mustache/mustache.js", // DEPRECATION NOTICE
          "handlebars/handlebars.min.js",
          "underscore/underscore-min.js",
          "backbone/backbone.js",
          "backbone.typeahead.collection/dist/backbone.typeahead.min.js",
          "qrcode/qrcode.min.js",
          "moment/min/moment-with-locales.js",
          "../lib/backbone-indexeddb.js",
          "blueimp-load-image/js/load-image.all.min.js",
          "blueimp-md5/js/md5.min.js",
          "emojijs/lib/emoji.min.js",
          "jquery-oembed-all/jquery.oembed.js",
          "dompurify/dist/purify.min.js",
          "platform.js/platform.js",
          "../lib/forstadown.js",
          "../lib/async_queue.js",
          "raven-js/dist/raven.min.js"  // Ensure this is last.
        ].map(x => add_prefix('components', x)),
        dest: `${static_dist}/js/app/deps.js`
      },

      worker_deps: {
        src: [
          "long/dist/long.min.js",
          "bytebuffer/dist/ByteBufferAB.min.js",
          "protobuf/dist/ProtoBuf.min.js",
          "underscore/underscore-min.js",
          "backbone/backbone.js",
          "../lib/backbone-indexeddb.js",
          "blueimp-md5/js/md5.min.js",
          "../lib/async_queue.js"
        ].map(x => add_prefix('components', x)),
        dest: `${static_dist}/js/worker/deps.js`
      },

      lib_textsecure: {
        options: {
          banner: ";(function() {\n",
          footer: "})();\n",
        },
        src: [
          'init.js',
          'errors.js',
          'libsignal-protocol.js',
          'crypto.js',
          'protobufs.js',
          'websocket-resources.js',
          'helpers.js',
          'stringview.js',
          'event_target.js',
          'api.js',
          'account_manager.js',
          'message_receiver.js',
          'outgoing_message.js',
          'sendmessage.js',
          'contacts_parser.js',
          'ProvisioningCipher.js',
        ].map(x => add_prefix('lib/textsecure', x)),
        dest: `${static_dist}/js/lib/textsecure.js`
      },

      app_main: {
        src: [
          'ga.js',
          'version.js',
          'util.js',
          'templates.js',
          'ccsm.js',
          'database.js',
          'state.js',
          'store.js',
          'notifications.js',
          'models/ccsm.js',
          'models/users.js',
          'models/tags.js',
          'models/receipts.js',
          'models/messages.js',
          'models/threads.js',
          'models/state.js',
          'emoji.js',
          'router.js',
          'views/base.js',
          'views/header.js',
          'views/file_input.js',
          'views/list.js',
          'views/nav.js',
          'views/attachment.js',
          'views/timestamp.js',
          'views/message.js',
          'views/thread.js',
          'views/conversation.js',
          'views/poll.js',
          'views/announcement.js',
          'views/compose.js',
          'views/new_convo.js',
          'views/main.js',
          'easter.js',
          'foundation.js',
          'main.js'
        ].map(x => add_prefix('app', x)),
        dest: `${static_dist}/js/app/main.js`
      },

      app_install: {
        src: [
          'ga.js',
          'version.js',
          'util.js',
          'templates.js',
          'ccsm.js',
          'database.js',
          'state.js',
          'store.js',
          'models/ccsm.js',
          'models/users.js',
          'models/tags.js',
          'models/messages.js',
          'models/threads.js',
          'models/state.js',
          'views/base.js',
          'views/install.js',
          'easter.js',
          'foundation.js',
          'install.js'
        ].map(x => add_prefix('app', x)),
        dest: `${static_dist}/js/app/install.js`
      },

      worker_service: {
        src: [
          'worker/service/imports.js',
          'app/version.js',
          'app/util.js',
          'app/ccsm.js',
          'app/database.js',
          'app/state.js',
          'app/store.js',
          'app/notifications.js',
          'app/models/ccsm.js',
          'app/models/users.js',
          'app/models/tags.js',
          'app/models/receipts.js',
          'app/models/messages.js',
          'app/models/threads.js',
          'app/models/state.js',
          'app/foundation.js',
          'worker/service/main.js'
        ].map(assert_exists),
        dest: `${static_dist}/js/worker/service.js`
      }
    },

    sass: {
      stylesheets: {
        options: {
            sourcemap: 'inline'
        },
        files: [{
          expand: true,
          cwd: 'stylesheets',
          src: ['*.scss'],
          dest: `${static_dist}/stylesheets`,
          ext: '.css'
        }]
      }
    },

    copy: {
      root: {
        nonull: true,
        files: [{
          expand: true,
          src: ['html/**'],
          dest: dist
        }]
      },

      static: {
        nonull: true,
        files: [{
          expand: true,
          src: [
            'protos/**',
            'images/**',
            'fonts/**',
            'templates/**',
            'manifest.json',
          ],
          dest: static_dist
        }, {
          expand: true,
          cwd: 'components/emoji-data/',
          src: ['img-google-136/**'],
          dest: `${static_dist}/images/emoji`
        }]
      },

      semantic: {
        nonull: true,
        files: [{
          expand: true,
          cwd: 'semantic/dist',
          src: ['**'],
          dest: `${static_dist}/semantic`
        }]
      },
    },

    watch: {
      stylesheets: {
        files: [
          'stylesheets/*.scss',
        ],
        tasks: ['sass']
      },
      code: {
        files: [
          'lib/**',
          'app/**',
          'worker/**',
          'Gruntfile.js'
        ],
        tasks: ['concat', 'copy']
      },
      html: {
        files: [
          'protos/**',
          'images/**',
          'fonts/**',
          'templates/**',
          'html/**'
        ],
        tasks: ['copy']
      }
    }
  });

  grunt.registerTask('default', ['concat', 'sass', 'copy']);
};
