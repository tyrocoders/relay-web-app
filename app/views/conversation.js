// vim: ts=4:sw=4:expandtab
/* global platform relay */

(function () {
    'use strict';

    self.F = self.F || {};

    F.ConversationView = F.ThreadView.extend({
        template: 'views/conversation.html',

        events: {
            'click .f-title-display': 'onTitleClick',
            'click .f-title-edit .icon': 'onTitleEditSubmit',
            'keypress .f-title-edit input': 'onTitleEditKeyPress',
            'blur .f-title-edit': 'onTitleEditBlur',
            'loadMore': 'fetchMessages',
            'paste': 'onPaste',
            'drop': 'onDrop',
            'dragover': 'onDragOver',
            'dragenter': 'onDragEnter',
            'dragleave': 'onDragLeave'
        },

        initialize: function(options) {
            this.drag_bucket = new Set();
            var onFocus = function() {
                if (!this.isHidden()) {
                    this.markRead();
                }
            }.bind(this);
            addEventListener('focus', onFocus);
            addEventListener('beforeunload', function () {
                removeEventListener('focus', onFocus);
                this.remove();
                this.model.messages.reset([]);
            }.bind(this));
        },

        render: async function() {
            await F.ThreadView.prototype.render.call(this);
            this.msgView = new F.MessageView({
                collection: this.model.messages,
                el: this.$('.f-messages')
            });
            this.composeView = new F.ComposeView({
                el: this.$('.f-compose'),
                model: this.model
            });
            this.listenTo(this.composeView, 'send', this.onSend);
            await Promise.all([
                this.msgView.render(),
                this.composeView.render()
            ]);
            this.$dropZone = this.$('.f-dropzone');
            this.listenTo(this.model, 'remove', this.onRemove);
            this.listenTo(this.model, 'opened', this.onOpened);
            this.listenTo(this.model, 'closed', this.onClosed);
            this.listenTo(this.model, 'expired', this.onExpired);
            this.listenTo(this.model.messages, 'add', this.onAddMessage);
            this.listenTo(this.model.messages, 'expired', this.onExpiredCollection);
            const loaded = this.model.messages.length;
            const available = await this.model.messages.totalCount();
            const pageSize = this.model.messages.pageSize;
            if (loaded < Math.min(available, pageSize)) {
                await this.fetchMessages();
            }
            this.focusMessageField();
            return this;
        },

        onRemove: function() {
            this.onClosed();
        },

        onClosed: function(e) {
            for (const video of this.$('video')) {
                video.pause();
            }
        },

        onTitleClick: function(ev) {
            this.$('.f-title-display').hide();
            this.$('.f-title-edit').show().find('input').focus();
        },

        onTitleEditSubmit: async function(ev) {
            const $edit = this.$('.f-title-edit');
            const threadTitle = $edit.find('input').val();
            $edit.hide();
            this.$('.f-title-display').show();
            await this.model.save({title: threadTitle});
            await this.model.sendUpdate({threadTitle});
        },

        onTitleEditKeyPress: function(ev) {
            if (ev.keyCode === /*enter*/ 13) {
                this.onTitleEditSubmit();
                return false;
            }
        },

        onTitleEditBlur: async function(ev) {
            await relay.util.sleep(1);  // Mostly to let click event win
            this.$('.f-title-edit').hide();
            this.$('.f-title-display').show();
        },

        onPaste: function(ev) {
            const data = ev.originalEvent.clipboardData;
            /* Only handle file attachments and ONLY if there isn't an html option.
             * The HTML option may seem wrong (and it might be) but excel on OSX send
             * cell content as an image in addition to html.  We prefer the html over
             * the image content in this case. */
            if (!data.files.length || data.types.indexOf('text/html') !== -1) {
                return;
            }
            ev.preventDefault();
            this.composeView.fileInput.addFiles(data.files);
            this.focusMessageField(); // Make <enter> key after paste work always.
        },

        onDrop: function(ev) {
            if (!this._dragEventHasFiles(ev)) {
                return;
            }
            ev.preventDefault();
            const data = ev.originalEvent.dataTransfer;
            this.composeView.fileInput.addFiles(data.files);
            if (platform.name !== 'Firefox') {
                this.$dropZone.dimmer('hide');
            }
            this.drag_bucket.clear();
            this.focusMessageField(); // Make <enter> key after drop work always.
        },

        onDragOver: function(ev) {
            if (!this._dragEventHasFiles(ev)) {
                return;
            }
            /* Must prevent default so we can handle drop event ourselves. */
            ev.preventDefault();
        },

        onDragEnter: function(ev) {
            if (!this._dragEventHasFiles(ev) || platform.name === 'Firefox') {
                return;
            }
            this.drag_bucket.add(ev.target);
            if (this.drag_bucket.size === 1) {
                this.$dropZone.dimmer('show');
            }
        },

        onDragLeave: function(ev) {
            if (!this._dragEventHasFiles(ev) || platform.name === 'Firefox') {
                return;
            }
            this.drag_bucket.delete(ev.target);
            if (this.drag_bucket.size === 0) {
                this.$dropZone.dimmer('hide');
            }
        },

        onOpened: async function() {
            this.msgView.scrollRestore();
            this.focusMessageField();
            this.model.markRead();
            for (const video of this.$('video[autoplay][muted]')) {
                try {
                    await video.play();
                } catch(e) {
                    console.debug("Ignore video play error:", e);
                }
            }
        },

        focusMessageField: function() {
            if (!F.util.isCoarsePointer()) {
                this.composeView.focusMessageField();
            }
        },

        fetchMessages: async function() {
            if (this.model.messages.length >= await this.model.messages.totalCount()) {
                return;  // Nothing to fetch
            }
            const $dimmer = this.$('.f-loading.ui.dimmer');
            $dimmer.addClass('active');
            try {
                await this.model.fetchMessages();
            } finally {
                $dimmer.removeClass('active');
            }
        },

        onExpired: function(message) {
            var mine = this.model.messages.get(message.id);
            // XXX Suspect logic here.  Why do we need to make sure it's not the
            // same model as our collection's instance?
            if (mine && mine.cid !== message.cid) {
                mine.trigger('expired', mine);
            }
        },

        onExpiredCollection: function(message) {
            this.model.messages.remove(message.id);
        },

        onAddMessage: function(message) {
            message.setToExpire();
            if (!this.isHidden()) {
                this.markRead();
            }
        },

        onSend: async function(plain, safe_html, files, mentions) {
            this.msgView.scrollTail(/*force*/ true);
            if (this.model.get('left')) {
                await this.model.createMessage({
                    safe_html: '<i class="icon warning sign red"></i>' +
                               'You are not a member of this thread.',
                    type: 'clientOnly'
                });
                return;
            }
            await this.model.sendMessage(plain, safe_html, files, mentions);
        }
    });
})();
