/*global _:true, Backbone:true */
(function () {
    "use strict";
    
    var Video,
        Playlist,
        /*VideoFeed,
        
        Clothing,*/
        Outfit,
        /*Wishlist,*/
        
        E;
    
    E = function (tag, attrs/*, content*/) {
    
        var i, node = document.createElement('tag');
        
        if ((typeof attrs !== 'undefined') && (attrs !== null)) {
            for (i in attrs) {
                if (attrs.hasOwnProperty(i)) {
                    node.setAttribute(i, attrs[i]);
                }
            }
        }
        
        if (arguments.length > 2) {
            for (i = 2; i < arguments.length; i += 1) {
            
                if (typeof arguments[i] === 'string') {
                    node.innerHTML += arguments[i];
                } else if (('nodeType' in arguments[i]) && (arguments[i].nodeType === 1)) {
                    node.appendChild(arguments[i]);
                }
            
            }
        }
        
        return node;
    
    };

    Video = Backbone.Model.extend({
    
        'validate': function (attrs) {
        
            /* LIST OF ATTRIBUTES:
             * id           - positive integer
             * name         - name of the video
             * description  - short description of the video
             *
             * outfit       - Backbone collection with clothing items visible in the video
             *
             * poster       - URL to poster for the <video> element
             * sources      - video sources; hash with key being MIME type, 
             */
            
            // ID must be an integer equal or bigger than 0
            if (!(('id' in attrs) &&
                  (typeof attrs.id === 'number') &&
                  (attrs.id >= 0))) {
                return 'ID is incorrect.';
            }
            
            // Name, description and poster are simple strings
            if (!_.all(['name', 'description', 'poster'], function (str) {
                return ((str in attrs) && (typeof attrs[str] === 'string'));
            })) {
                return 'Text fields are incorrect.';
            }
            
            // Sources have to be a hash of [video MIME type] => string pairs
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
    
    Playlist = Backbone.Collection.extend({
    
        'model': Video,
        'comparator': 'id'
    
    });

}());