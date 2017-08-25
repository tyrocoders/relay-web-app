/*
 * vim: ts=4:sw=4:expandtab
 */
(function () {
    'use strict';

    self.F = self.F || {};

    const ErrorView = F.View.extend({
        template: 'views/messages-error.html',

        initialize: function(options) {
            F.View.prototype.initialize.apply(this, arguments);
            this.conversation = options.conversation;
            let found = [];
            for (let error of this.model.receipts.where({type: 'error'})) {
                if (found.indexOf(error.name) === -1) {
                    found.push(error);
                }
            }
            this.errors = found;
        },

        errorsManifest: {
            OutgoingIdentityKeyError: {
                icon: 'spy',
                actions: [
                    ['Verify New Identity', 'resolveOutgoingConflict']
                ]
            },
            IncomingIdentityKeyError: {
                icon: 'spy',
                actions: [
                    ['Verify New Identity', 'resolveIncomingConflict']
                ]
            },
            UnregisteredUserError: { // XXX the system should auto-remove them.
                icon: 'ban'
            },
            SendMessageNetworkError: {
                icon: 'unlinkify red',
                actions: [
                    ['Retry Send', 'retrySend']
                ]
            },
            MessageError: {
                icon: 'unlinkify red',
                actions: [
                    ['Retry Send', 'retrySend']
                ]
            },
            OutgoingMessageError: {
                icon: 'unlinkify red',
                actions: [
                    ['Retry Send', 'retrySend']
                ]
            },
            HTTPError: {
                icon: 'plug red',
            }
        },

        render_attributes: function() {
            return this.errors.map((m, idx) => {
                const error = m.get('error');
                const attrs = _.extend({idx}, error);
                const errorMani = this.errorsManifest[error.name];
                if (!errorMani) {
                    console.warn("Unhandled error type:", error.name);
                } else {
                    attrs.icon = errorMani.icon;
                    attrs.actions = errorMani.actions;
                }
                return attrs;
            });
        },

        render: async function() {
            await F.View.prototype.render.call(this);
            const _this = this; // Save for onCreate
            this.$('.f-error').popup({
                exclusive: true,
                on: 'click',
                onCreate: function() {
                    const popup = this;
                    popup.on('click', 'button', _this.onPopupAction.bind(_this));
                }
            });
            return this;
        },

        onPopupAction: async function(ev) {
            const fn = this[ev.target.name];
            const error = this.errors[ev.target.dataset.erroridx];
            if (fn) {
                ev.stopPropagation();
                // XXX convert errors here into user feedback ?
                await fn.call(this, error);
            } else {
                console.warn("No error click handler for:", error);
            }
        },

        resolveIncomingConflict: function(error) {
            throw new Error("Unsupported");
        },

        resolveOutgoingConflict: function(error) {
            this.model.resolveConflict(error.addr);
        },

        retrySend: function(error) {
            this.model.resend(error.addr);
        }

    });

    const TimerView = F.View.extend({
        className: 'timer',

        initialize: function() {
            if (this.model.isExpiring()) {
                this.render();
                const totalTime = this.model.get('expiration') * 1000;
                const remainingTime = this.model.msTilExpire();
                const elapsed = (totalTime - remainingTime) / totalTime;
                this.$el.append('<span class="hourglass"><span class="sand"></span></span>');
                this.$('.sand')
                    .css('animation-duration', remainingTime*0.001 + 's')
                    .css('transform', 'translateY(' + elapsed*100 + '%)');
                this.$el.css('display', 'inline-block');
            }
            return this;
        }
    });

    F.MessageItemView = F.View.extend({
        template: 'views/messages-item.html',

        id: function() {
            return this.model.id;
        },

        className: function() {
            return `event ${this.model.get('type')}`;
        },

        initialize: function(options) {
            const listen = (events, cb) => this.listenTo(this.model, events, cb);
            listen('change:html change:plain change:flags change:group_update', this.render);
            if (this.model.isOutgoing()) {
                listen('pending', () => this.setStatus('pending'));
            }
            listen('change:expirationStart', this.renderExpiring);
            listen('remove', this.onRemove);
            listen('expired', this.onExpired);
            this.listenTo(this.model.receipts, 'add', this.onReceipt);
            this.timeStampView = new F.ExtendedTimestampView();
        },

        events: {
            'click .f-retry': 'retryMessage',
            'click .f-user': 'onUserClick',
            'click .f-front .f-moreinfo-toggle': 'onMoreInfoShow',
            'click .f-back .f-moreinfo-toggle': 'onMoreInfoRemove'
        },

        render_attributes: async function() {
            let avatar;
            let senderName;
            if (this.model.isClientOnly()) {
                avatar = {
                    color: 'black',
                    url: '/@static/images/icon_256.png'
                };
                senderName = 'Forsta';
            } else {
                const sender = await this.model.getSender();
                senderName = sender.getName();
                avatar = await sender.getAvatar();
            }
            const attrs = F.View.prototype.render_attributes.call(this);
            const userAgent = this.model.get('userAgent') || '';
            return Object.assign(attrs, {
                senderName,
                mobile: !userAgent.match(new RegExp(F.product)),
                avatar,
                incoming: this.model.isIncoming(),
                meta: this.model.getMeta(),
                safe_html: attrs.safe_html && F.emoji.replace_unified(attrs.safe_html),
            });
        },

        render: async function() {
            await F.View.prototype.render.call(this);
            this.timeStampView.setElement(this.$('.timestamp'));
            this.timeStampView.update();
            if (this.model.isOutgoing()) {
                const status = (await this.isDelivered()) ? 'delivered' :
                               this.isSent() ? 'sent' : undefined;
                if (status) {
                    this.setStatus(status);
                }
            }
            this.renderEmbed();
            this.renderPlainEmoji();
            this.renderExpiring();
            await this.loadAttachments();
            await this.renderErrors();
            return this;
        },

        onReceipt: async function(receipt) {
            if (receipt.get('type') === 'error') {
                if (this.model.isIncoming()) {
                    await this.render();
                } else {
                    await this.renderErrors();
                }
            } else if (receipt.get('type') === 'delivery') {
                if (await this.isDelivered()) {
                    this.setStatus('delivered');
                } else if (this.isSent()) {
                    this.setStatus('sent');
                }
            }
        },

        isDelivered: async function() {
            /* Returns true if at least one device for each of the recipients has sent a
             * delivery reciept. */
            const recipients = (await this.model.getThread().getUserCount()) - 1;
            const delivered = new Set(this.model.receipts.where({type: 'delivery'}).map(x => x.get('source')));
            delivered.delete(F.currentUser.id);
            return delivered.size >= recipients;
        },

        isSent: async function() {
            /* Returns true when all recipeints in this thread have been sent to. */
            if (this.model.get('sourceDevice') !== await F.state.get('deviceId')) {
                return undefined;  // We can't know any better.
            }
            const recipients = (await this.model.getThread().getUserCount()) - 1;
            const sent = this.model.receipts.where({type: 'sent'}).length;
            return sent >= recipients;
        },

        onUserClick: async function() {
            const idx = this.model.attributes.sender;
            F.util.displayUserCard(idx);
        },

        onExpired: function() {
            this.model._expiring = true; // Prevent removal in onRemove.
            /* NOTE: Must use force-repaint for consistent rendering and timing. */
            this.$el
                .transition('force repaint')
                .transition('shake')
                .transition('fade out', this.remove.bind(this));
        },

        onRemove: function() {
            if (this.model._expiring) {
                return;
            }
            this.remove();
        },

        onMoreInfoShow: async function(ev) {
            const view = new F.MessageBacksideView({
                model: this.model
            });
            await view.render();
            this.$('.extra.text.back').append(view.el);
            this.$('.shape').shape(ev.target.dataset.transition);
        },

        onMoreInfoRemove: async function(ev) {
          this.$('.f-back-holder').remove();
          this.$('.shape').shape(ev.target.dataset.transition);
        },

        setStatus: function(status) {
            this.status = status;
            this.renderStatus();
        },

        renderStatus: function() {
            const icons = {
                pending: 'notched circle loading grey',
                sent: 'radio grey',
                delivered: 'check circle outline grey',
            };
            const icon = icons[this.status];
            console.assert(icon, `No icon for status: ${this.status}`);
            this.$('.f-status i').attr('class', `icon ${icon}`);
        },

        renderErrors: async function() {
            const errors = this.model.receipts.where({type: 'error'});
            const $errorbar = this.$('.icon-bar.errors');
            if (errors && errors.length) {
                const v = new ErrorView({
                    model: this.model,
                    el: $errorbar
                });
                await v.render();
            } else {
                $errorbar.empty();
            }
        },

        renderEmbed: function() {
            this.$('.extra.text a[type="unfurlable"]').oembed();
        },

        renderPlainEmoji: function() {
            /* We don't want to render plain as html so this safely replaces unicode emojis
             * with html after handlebars has scrubbed the input. */
            const plain = this.$('.extra.text.plain');
            if (plain.length) {
                plain.html(F.emoji.replace_unified(this.model.get('plain')));
            }
        },

        renderExpiring: function() {
            new TimerView({
                model: this.model,
                el: this.$('.icon-bar .timer')
            });
        },

        loadAttachments: async function() {
            await Promise.all(this.model.get('attachments').map(attachment => {
                const view = new F.AttachmentView({model: attachment});
                this.listenTo(view, 'update', function() {
                    if (!view.el.parentNode) {
                        this.$('.attachments').append(view.el);
                    }
                });
                this.$('.attachments').append(view.el);
                return view.render();
            }));
        }
    });

    F.MessageBacksideView = F.View.extend({
        template: 'views/messages-backside.html',

        initialize: function() {
            this.thread = F.foundation.getThreads().get(this.model.get('threadId'));
            this.head = this.getHead();
        },

        events: {
            'click .f-conversation-member': 'onUserClick',
            'click .f-purge' : 'purgeMessage'
        },

        onUserClick: async function(ev) {
            const idx = ev.currentTarget.id;
            F.util.displayUserCard(idx);
        },

        purgeMessage: function() {
            this.model.destroy();
        },

        getHead: function() {
            const type2 = "Message";
            if (this.model.get('type') === "outgoing") {
                return {
                    type1: "Outgoing",
                    type2,
                    time: F.tpl.help.fromnow(this.model.get('sent')),
                    adj: "Sent"
                };
            } else {
                return {
                    type1: "Incoming Message",
                    type2,
                    time: F.tpl.help.fromnow(this.model.get('received')),
                    adj: "Received"
                };
            }
        },

        getMembers: async function() {
            // XXX Let's store the recipients in storage since it can change on the thread.
            return await F.ccsm.userDirectoryLookup(await this.thread.getUsers());
        },

        render_attributes: async function() {
            const members = await this.getMembers();
            const receipts = this.model.receipts.models;
            const membersData = [];
            for (const member of members) {
                let time_rec;
                let delivered;
                if (receipts.length && F.currentUser.id !== member.id) {
                    let flag = false;
                    for (const receipt of receipts) {
                        if (receipt.attributes.addr === member.id) {
                            time_rec = `Received ${F.tpl.help.fromnow(receipt.attributes.timestamp)}`;
                            flag = true;
                        }
                    }
                    delivered = flag;
                }
                membersData.push(Object.assign({
                    avatar: await member.getAvatar(),
                    name: member.getName(),
                    domain: (await member.getDomain()).attributes,
                    time_rec,
                    delivered
                }, member.attributes));
            }
            return {
                thread: this.thread,
                head: this.head,
                members: membersData,
            };
        }
    });

    F.MessageView = F.ListView.extend({

        ItemView: F.MessageItemView,

        initialize: function(options) {
            this.observer = new MutationObserver(this.onMutate.bind(this));
            options.reverse = true;
            options.remove = false;
            return F.ListView.prototype.initialize.call(this, options);
        },

        render: async function() {
            await F.ListView.prototype.render.apply(this, arguments);
            this.observer.observe(this.el.parentNode, {
                attributes: true,
                childList: true,
                subtree: true,
                characterData: false
            });
            $(self).on(`resize #${this.id}`, this.onResize.bind(this));
            return this;
        },

        events: {
            'scroll': 'onScroll',
        },

        onMutate: function() {
            return this.maybeKeepScrollPinned();
        },

        onResize: function() {
            this.maybeKeepScrollPinned();
        },

        /*
         * Debounce scroll monitoring to give resize and mutate a chance
         * first.  We only need this routine to stop tailing for saving
         * the cursor position used for thread switching.
         */
        onScroll: _.debounce(function() {
            this.scrollTick();
            if (!this._scrollPin && this.el.scrollTop === 0) {
                console.info("Loading more data...");
                this.$el.trigger('loadMore');
            }
        }, 25),

        maybeKeepScrollPinned: function() {
            if (this._scrollPin) {
                this.el.scrollTop = this.el.scrollHeight;
            }
            return this._scrollPin;
        },

        scrollTick: function() {
            let pin;
            let pos;
            if (!this.el) {
                pos = 0;
                pin = true;
            } else {
                // Adjust for rounding and scale/zoom error.
                const slop = 2;
                pos = this.el.scrollTop + this.el.clientHeight;
                pin = pos >= this.el.scrollHeight - slop;
            }
            this._scrollPos = pos;
            if (pin != this._scrollPin) {
                console.info(pin ? 'Pinning' : 'Unpinning', 'message pane');
                this._scrollPin = pin;
            }
        },

        loadSavedScrollPosition: function() {
            if (!this.maybeKeepScrollPinned() && this._scrollPos) {
                this.el.scrollTop = this._scrollPos;
            }
        },

        resetCollection: async function() {
            this.scrollTick();
            await F.ListView.prototype.resetCollection.apply(this, arguments);
            this.maybeKeepScrollPinned();
        },

        addModel: async function(model) {
            this.scrollTick();
            await F.ListView.prototype.addModel.apply(this, arguments);
            this.maybeKeepScrollPinned();
        },

        removeModel: async function(model) {
            /* If the model is expiring it calls remove manually later. */
            if (!model._expiring) {
                return await F.ListView.prototype.removeModel.apply(this, arguments);
            }
        }
    });
})();
