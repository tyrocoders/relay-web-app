// vim: ts=4:sw=4:expandtab
/* global Backbone */

(function () {
    'use strict';

    const AttachmentItemView = F.View.extend({

        template: 'views/attachment-item.html',

        events: {
            'click .f-load.button': 'onLoadClick',
            'click .f-download': 'onDownloadClick',
        },

        constructor: function(options) {
            F.View.prototype.constructor.call(this);
            Object.assign(this, options);
        },

        render_attributes: function() {
            this.assignURL();
            return Object.assign({
                contentType: this.contentType,
                fileType: this.fileType,
                url: this.url
            }, this.attachment);
        },

        saveFile: async function() {
            await this.loadAttachment();
            const link = document.createElement('a');
            link.download = this.attachment.name || ('Forsta_Attachment.' + this.fileType);
            link.href = this.url;
            link.style.display = 'none';
            document.body.appendChild(link);
            try {
                link.click();
            } finally {
                link.remove();
            }
        },

        assignURL: function() {
            if (this.url) {
                if (this._dataRef && Object.is(this._dataRef, this.attachment.data)) {
                    return;  // Same data, optimize out work.
                }
                URL.revokeObjectURL(this._url);
                this.url = null;
            }
            if (this.attachment.data) {
                const blob = new Blob([this.attachment.data], {type: this.attachment.type});
                this.url = URL.createObjectURL(blob);
                this._dataRef = this.attachment.data;
            }
        },

        loadAttachment: async function() {
            if (!this.attachment.data) {
                await this.message.loadAttachment(this.attachment.id);
            }
            this.assignURL();
        },

        onLoadClick: async function(ev) {
            const $button = $(ev.currentTarget);
            if ($button.hasClass('loading')) {
                return;
            }
            $button.addClass('loading');
            try {
                await this.loadAttachment();
                await this.render();
            } finally {
                $button.removeClass('loading');
            }
        },

        onDownloadClick: async function() {
            await this.saveFile();
        }
    });


    const FileView = AttachmentItemView.extend({

        getIcon: function() {
            switch (this.attachment.name && this.attachment.name.split(".").pop()) {
                case "asm":
                case "c":
                case "c++":
                case "cc":
                case "cpp":
                case "cs":
                case "css":
                case "f":
                case "go":
                case "h":
                case "html":
                case "java":
                case "js":
                case "json":
                case "m":
                case "pl":
                case "py":
                case "rb":
                case "scss":
                case "sh":
                case "swift":
                case "vb":
                case "xml":
                case "yaml":
                case "yml":
                    return "file code outline";
                case 'pdf':
                    return "file pdf outline";
                case 'ppt':
                case 'pptx':
                    return "file powerpoint outline";
                case 'doc':
                case 'docx':
                    return "file word outline";
                case 'xls':
                case 'xlsx':
                    return "file excel outline";
                case 'txt':
                case 'rtf':
                    return "file text outline";
                default:
                    return "file outline";
            }
        },

        render_attributes: function() {
            return Object.assign({
                isPreviewable: false,
                icon: this.getIcon(),
            }, AttachmentItemView.prototype.render_attributes.call(this));
        }
    });


    const ImageView = AttachmentItemView.extend({

        events: {
            'click img.link': 'onImageClick',
        },

        render_attributes: function() {
            return Object.assign({
                isPreviewable: true,
            }, AttachmentItemView.prototype.render_attributes.call(this));
        },

        onImageClick: async function() {
            if (await F.util.confirmModal({
                header: this.attachment.name,
                size: 'fullscreen',
                icon: 'image',
                content: `<img class="attachment-view" src="${this.url}"/>`,
                confirmLabel: 'Download'
            })) {
                await this.saveFile();
            }
        }
    });


    const MediaView = AttachmentItemView.extend({
        render_attributes: function() {
            return Object.assign({
                isPreviewable: true,
            }, AttachmentItemView.prototype.render_attributes.call(this));
        }
    });


    F.AttachmentView = Backbone.View.extend({
        className: 'attachment',

        constructor: function(options) {
            Backbone.View.prototype.constructor.call(this);
            const parts = options.attachment.type.split('/');
            options.contentType = parts[0];
            options.fileType = parts[1];
            const View = {
                image: ImageView,
                audio: MediaView,
                video: MediaView
            }[options.contentType] || FileView;
            this.itemView = new View(options);
        },

        render: async function() {
            await this.itemView.render();
            this.$el.append(this.itemView.$el);
            return this;
        }
    });


    F.AttachmentThumbnailView = F.View.extend({
        template: 'views/attachment-thumbnail.html',
        className: 'f-attachment-thumbnail ui message',

        preview_image_types: [
            'image/gif',
            'image/jpeg',
            'image/png',
            'image/webp'
        ],

        initialize: function(file, fileInput) {
            this.file = file;
            this.fileInput = fileInput;
            this.type = null;
            this.content = URL.createObjectURL(file);
            if (file.type.startsWith('audio/')) {
                this.thumbnail = F.util.versionedURL(F.urls.static + 'images/audio.svg');
                this.type = 'audio';
            } else if (file.type.startsWith('video/')) {
                this.thumbnail = F.util.versionedURL(F.urls.static + 'images/video.svg');
                this.type = 'video';
            } else if (this.preview_image_types.indexOf(file.type) !== -1) {
                this.thumbnail = URL.createObjectURL(file);
                this.type = 'image';
            } else {
                this.thumbnail = F.util.versionedURL(F.urls.static + 'images/paperclip.svg');
            }
        },

        render: async function() {
            await F.View.prototype.render.call(this);
            this.$el.popup({
                variation: 'flowing',
                html: [
                    `<h5>${this.file.name}</h5>`,
                    'Size: ', F.tpl.help.humanbytes(this.file.size), '<br/>',
                    'Type: ', this.file.type, '<br/>',
                    'Date: ', F.tpl.help.calendar(this.file.lastModifiedDate)
                ].join('')
            });
            return this;
        },

        events: {
            'click .close': 'onClose',
        },

        onClose: function() {
            this.fileInput.removeFile(this.file);
        },

        render_attributes: function() {
            return {
                thumbnail: this.thumbnail,
                content: this.content,
                audio: this.type === 'audio',
                video: this.type === 'video',
                file: this.file
            };
        }
    });
})();
