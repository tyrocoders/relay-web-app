/*
 * vim: ts=4:sw=4:expandtab
 */
;(function() {
    'use strict';

    self.F = self.F || {};

    F.DeliveryReceipts = new (Backbone.Collection.extend({
        initialize: function() {
            this.on('add', this.onReceipt);
        },

        forMessage: function(conversation, message) {
            var recipients;
            if (conversation.isPrivate()) {
                recipients = [ conversation.id ];
            } else {
                recipients = conversation.get('members') || [];
            }
            var receipts = this.filter(function(receipt) {
                return (receipt.get('timestamp') === message.get('sent_at')) &&
                    (recipients.indexOf(receipt.get('source')) > -1);
            });
            this.remove(receipts);
            return receipts;
        },

        onReceipt: function(receipt) {
            var messages  = new F.MessageCollection();
            var groups    = new F.ConversationCollection();
            Promise.all([
                groups.fetchGroups(receipt.get('source')),
                messages.fetchSentAt(receipt.get('timestamp'))
            ]).then(function() {
                var ids = groups.pluck('id');
                ids.push(receipt.get('source'));
                var message = messages.find(function(message) {
                    return (!message.isIncoming() &&
                            _.contains(ids, message.get('conversationId')));
                });
                if (message) {
                    this.remove(receipt);
                    var deliveries = message.get('delivered') || 0;
                    message.save({
                        delivered: deliveries + 1
                    }).then(function() {
                        const c = message.getConversation();
                        if (c) {
                            c.trigger('newmessage', message);
                        }
                    });
                    // TODO: consider keeping a list of numbers we've
                    // successfully delivered to?
                }
            }.bind(this));
        }
    }))();
})();
