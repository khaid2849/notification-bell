odoo.define("notification_bell.NotificationBell", function (require) {
  "use strict";

  var Widget = require("web.Widget");
  var session = require("web.session");
  var rpc = require("web.rpc");
  var core = require("web.core");
  var framework = require("web.framework");
  var SystrayMenu = require("web.SystrayMenu"); // Needed to add the widget to systray

  var _t = core._t;
  var QWeb = core.qweb;

  var NotificationBell = Widget.extend({
    template: "notification_bell.BellIcon", // Reference the QWeb template
    events: {
      click: "_onToggleDropdown", // Listen for clicks directly on the widget's root element
      'click .nav-link[href="#all-notifications"]': "_onSwitchToAll",
      'click .nav-link[href="#unread-notifications"]': "_onSwitchToUnread",
      "click .o_notification_item": "_onOpenNotification",
      "click .o_notification_mark_read": "_onMarkAsRead",
      "click .o_notification_dismiss": "_onDismissNotification",
      "click .o_notification_mark_all_read": "_onMarkAllAsRead",
      "click .o_notification_view_all": "_onViewAllNotifications",
    },

    init: function () {
      this._super.apply(this, arguments);
      this.notifications = [];
      this.unreadNotifications = [];
      this.unreadCount = 0;
      this.isOpen = false;
      this.activeTab = "all";
      this._updateInterval = null;
      this._handleClickOutside = this._handleClickOutside.bind(this); // Bind context
    },

    willStart: function () {
      var self = this;
      var def1 = this._fetchUnreadCount();
      var def2 = this._fetchNotifications(); // Fetch initial notifications list
      return this._super.apply(this, arguments).then(function () {
        return Promise.all([def1, def2]);
      });
    },

    start: function () {
      var self = this;
      return this._super.apply(this, arguments).then(function () {
        self._registerBusEvents();
        self._updateInterval = setInterval(
          self._fetchUnreadCount.bind(self),
          30000
        );
        document.addEventListener("click", self._handleClickOutside);
        self._renderDropdown(); // Initial render of dropdown content (hidden)
      });
    },

    destroy: function () {
      if (this._updateInterval) {
        clearInterval(this._updateInterval);
      }
      document.removeEventListener("click", this._handleClickOutside);
      // Unregister bus listener - specific method depends on exact bus implementation in v15
      // This might involve calling `off` on the bus instance if obtained
      var channel = "notification_bell_" + session.uid;
      this.call("bus_service", "removeChannel", channel);
      // Or using core.bus.off(...)
      core.bus.off("notification", this, this._onBusNotification);
      this._super.apply(this, arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    _registerBusEvents: function () {
      var self = this;
      var channel = "notification_bell_" + session.uid; // Use session.uid in v15
      // Option 1: Use bus_service if available and reliable
      // this.call('bus_service', 'addChannel', channel);
      // this.call('bus_service', 'onNotification', this, this._onBusNotification);

      // Option 2: Use core.bus (more common in v15 widgets)
      core.bus.on("notification", this, this._onBusNotification);
      // Note: Need to ensure the channel is added elsewhere or implicitly handled by bus polling
      // If explicit channel add needed: this.call('bus_service', 'addChannel', channel);
      // Ensure bus service polling is active
      this.call("bus_service", "startPolling");
    },

    _onBusNotification: function (notifications) {
      // In v15, notifications often arrive as an array payload
      var self = this;
      notifications.forEach(function (payload) {
        // Check if payload structure is [channel, message_payload]
        var message, message_type;
        if (
          Array.isArray(payload) &&
          payload.length === 2 &&
          typeof payload[1] === "object"
        ) {
          var channel_name = payload[0];
          var expected_channel = "notification_bell_" + session.uid;
          // Ensure the message is for this user's channel
          if (channel_name === expected_channel) {
            message = payload[1];
            message_type = message.type; // Assuming type is within the payload
          }
        } else if (typeof payload === "object" && payload.type) {
          // Direct message payload structure (less common for channel-specific)
          // Might still need filtering if listening globally
          message_type = payload.type;
          message = payload;
        }

        if (message_type === "new_notification") {
          self._handleNewNotification(message); // Pass the actual notification data
        }
      });
    },

    _handleNewNotification: function (notificationData) {
      // Logic to handle a single new notification received via bus
      // notificationData is the payload sent from _notify_user
      var self = this;
      this._fetchUnreadCount().then(function () {
        if (self.isOpen) {
          // Fetch full list and re-render if the dropdown is open
          self._fetchNotifications().then(self._renderDropdown.bind(self));
        }
      });
    },

    _fetchNotifications: function () {
      var self = this;
      return rpc
        .query({
          model: "user.notification",
          method: "get_notifications",
          args: [], // Fetches based on limit in user settings (done server-side)
        })
        .then(function (result) {
          if (result && result.notifications) {
            self.notifications = result.notifications;
            self.unreadNotifications = self.notifications.filter(
              (n) => n.state === "unread"
            );
            // Don't update unreadCount here, rely on _fetchUnreadCount
            console.log("Fetched notifications");
            // Don't re-render the whole widget, only the dropdown content via _renderDropdown
            // self.renderElement();
          }
        })
        .catch(function (error) {
          console.error("Error fetching notifications:", error);
          framework.crash_manager.show_warning({
            message: _t("Could not fetch notifications."),
          });
        });
    },

    _fetchUnreadCount: function () {
      var self = this;
      return rpc
        .query({
          model: "user.notification",
          method: "get_unread_count",
          args: [],
        })
        .then(function (result) {
          if (result && typeof result === "number") {
            var newCount = result;
            var changed = self.unreadCount !== newCount;
            self.unreadCount = newCount;

            if (self.$el && changed) {
              var $counter = self.$el.find(".o_notification_counter");
              if ($counter.length > 0) {
                if (self.unreadCount > 0) {
                  var countText =
                    self.unreadCount > 99 ? "99+" : self.unreadCount.toString();
                  $counter.text(countText).show();
                } else {
                  $counter.hide();
                }
              } else {
                console.error(
                  "NotificationBell: Counter element .o_notification_counter not found in $el after widget start."
                );
              }
              // --- End DOM Update Logic ---
            }
          }
        })
        .catch(function (error) {
          // Prevent TypeError from breaking the promise chain if $el was the issue
          if (
            !(
              error instanceof TypeError &&
              error.message.includes("reading 'find'")
            )
          ) {
            console.error("Error fetching unread count:", error);
          }
        });
    },

    _renderDropdown: function () {
      // Renders/updates the content inside the dropdown menu
      this.$(".o_notification_dropdown_items_placeholder").replaceWith(
        QWeb.render("notification_bell.DropdownItems", {
          widget: this, // Pass widget state to template
        })
      );
      // Ensure correct tab is shown after render
      this._updateActiveTabVisuals();
    },

    _updateActiveTabVisuals: function () {
      // Updates classes based on this.activeTab
      this.$(".nav-link").removeClass("active");
      this.$(".tab-pane").removeClass("show active");
      this.$(
        '.nav-link[href="#' +
          (this.activeTab === "all" ? "all" : "unread") +
          '-notifications"]'
      ).addClass("active");
      this.$(
        "#" + (this.activeTab === "all" ? "all" : "unread") + "-notifications"
      ).addClass("show active");
    },

    _handleClickOutside: function (ev) {
      // Close dropdown if clicking outside the bell icon/dropdown itself
      if (this.isOpen && this.el && !this.el.contains(ev.target)) {
        this._closeDropdown();
      }
    },

    _closeDropdown: function () {
      this.isOpen = false;
      this.$(".o_notification_dropdown_menu").removeClass("show");
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    _onToggleDropdown: function (ev) {
      console.log("Notification Bell: _onToggleDropdown clicked!");
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }

      if (!this.isOpen) {
        // Fetch fresh list and render when opening
        var self = this;
        framework.blockUI();
        this._fetchNotifications()
          .then(function () {
            self.isOpen = true;
            self._renderDropdown();
            self.$(".o_notification_dropdown_menu").addClass("show");
            framework.unblockUI();
          })
          .catch(function () {
            framework.unblockUI();
          });
      } else {
        this._closeDropdown();
      }
    },

    _onSwitchToAll: function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      this.activeTab = "all";
      this._renderDropdown(); // Re-render content with the correct tab active
    },

    _onSwitchToUnread: function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      this.activeTab = "unread";
      this._renderDropdown(); // Re-render content with the correct tab active
    },

    _onOpenNotification: function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var self = this;
      var $currentTarget = $(ev.currentTarget);
      var notificationId = parseInt($currentTarget.data("notification-id"));

      if (!notificationId) return;

      framework.blockUI();
      rpc
        .query({
          model: "user.notification",
          method: "action_open_record",
          args: [notificationId],
        })
        .then(function (action) {
          framework.unblockUI();
          if (action && typeof action === "object" && action.type) {
            self._closeDropdown(); // Close dropdown before navigating
            self.do_action(action); // Use do_action for v15
          } else {
            // If no action returned, still mark as read visually and update count
            var notification = self.notifications.find(
              (n) => n.id === notificationId
            );
            if (notification && notification.state === "unread") {
              notification.state = "read";
              self.unreadNotifications = self.notifications.filter(
                (n) => n.state === "unread"
              );
              self._renderDropdown();
              self._fetchUnreadCount(); // Fetch count from server to update icon
            }
          }
        })
        .catch(function (error) {
          framework.unblockUI();
          console.error("Error opening notification:", error);
          framework.crash_manager.show_warning({
            message: _t("Could not open notification."),
          });
        });
    },

    _onMarkAsRead: function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var self = this;
      var $item = $(ev.currentTarget).closest(".o_notification_item");
      var notificationId = parseInt($item.data("notification-id"));

      if (!notificationId) return;

      framework.blockUI();
      rpc
        .query({
          model: "user.notification",
          method: "mark_as_read",
          args: [[notificationId]], // Pass IDs as a list
        })
        .then(function (result) {
          framework.unblockUI();
          // Visually update the item
          var notification = self.notifications.find(
            (n) => n.id === notificationId
          );
          if (notification) notification.state = "read";
          self.unreadNotifications = self.notifications.filter(
            (n) => n.state === "unread"
          );

          // Re-render dropdown content to reflect change & update count from server
          self._renderDropdown();
          self._fetchUnreadCount();
        })
        .catch(function (error) {
          framework.unblockUI();
          console.error("Error marking notification as read:", error);
          framework.crash_manager.show_warning({
            message: _t("Could not mark notification as read."),
          });
        });
    },

    _onDismissNotification: function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var self = this;
      var $item = $(ev.currentTarget).closest(".o_notification_item");
      var notificationId = parseInt($item.data("notification-id"));

      if (!notificationId) return;

      framework.blockUI();
      rpc
        .query({
          model: "user.notification",
          method: "dismiss_notification",
          args: [notificationId],
        })
        .then(function (result) {
          framework.unblockUI();
          if (result && result.success) {
            // Remove the item visually and update state
            self.notifications = self.notifications.filter(
              (n) => n.id !== notificationId
            );
            self.unreadNotifications = self.notifications.filter(
              (n) => n.state === "unread"
            );

            // Re-render dropdown and fetch server count
            self._renderDropdown();
            self._fetchUnreadCount();
          } else {
            framework.crash_manager.show_warning({
              message: _t("Could not dismiss notification."),
            });
          }
        })
        .catch(function (error) {
          framework.unblockUI();
          console.error("Error dismissing notification:", error);
          framework.crash_manager.show_warning({
            message: _t("Could not dismiss notification."),
          });
        });
    },

    _onMarkAllAsRead: function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var self = this;

      framework.blockUI();
      rpc
        .query({
          model: "user.notification",
          method: "mark_all_as_read",
          args: [],
        })
        .then(function () {
          framework.unblockUI();
          // Update state visually
          self.notifications.forEach((notification) => {
            notification.state = "read";
          });
          self.unreadNotifications = [];

          // Re-render dropdown and fetch server count
          self._renderDropdown();
          self._fetchUnreadCount();
        })
        .catch(function (error) {
          framework.unblockUI();
          console.error("Error marking all as read:", error);
          framework.crash_manager.show_warning({
            message: _t("Could not mark all notifications as read."),
          });
        });
    },

    _onViewAllNotifications: function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var self = this;

      this._closeDropdown(); // Close dropdown first

      this.do_action("notification_bell.action_my_notification").catch(
        function (error) {
          console.error("Error opening notifications list view:", error);
          framework.crash_manager.show_warning({
            message: _t("Could not open the list of all notifications."),
          });
        }
      );
    },
  });

  // Add the Widget to the Systray Menu
  SystrayMenu.Items.push(NotificationBell);

  // Export the widget
  return NotificationBell;
});
