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
      core.bus.on("notification", this, this._onBusNotification);
      this.call("bus_service", "startPolling");
    },

    _onBusNotification: function (notifications) {
      var self = this;
      notifications.forEach(function (payload) {
        var message, message_type;
        if (
          Array.isArray(payload) &&
          payload.length === 2 &&
          typeof payload[1] === "object"
        ) {
          var channel_name = payload[0];
          var expected_channel = "notification_bell_" + session.uid;
          if (channel_name === expected_channel) {
            message = payload[1];
            message_type = message.type;
          }
        } else if (typeof payload === "object" && payload.type) {
          message_type = payload.type;
          message = payload;
        }

        if (message_type === "new_notification") {
          self._handleNewNotification(message);
        }
      });
    },

    _handleNewNotification: function (notificationData) {
      var self = this;
      this._fetchUnreadCount().then(function () {
        if (self.isOpen) {
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
          args: [],
        })
        .then(function (result) {
          if (result && result.notifications) {
            self.notifications = result.notifications;
            self.unreadNotifications = self.notifications.filter(
              (n) => n.state === "unread"
            );
            console.log("Fetched notifications");
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
            if (changed) {
              self._updateCounterDOM();
            }
          }
        })
        .catch(function (error) {
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
      this.$(".o_notification_dropdown_items_placeholder").replaceWith(
        QWeb.render("notification_bell.DropdownItems", {
          widget: this,
        })
      );
      this._updateActiveTabVisuals();
    },

    _updateActiveTabVisuals: function () {
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
      this._renderDropdown();
    },

    _onSwitchToUnread: function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      this.activeTab = "unread";
      this._renderDropdown();
    },

    _onOpenNotification: function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var self = this;
      var $currentTarget = $(ev.currentTarget);
      var notificationId = parseInt(
        $currentTarget.attr("data-notification-id")
      );

      if (!notificationId) return;

      framework.blockUI();
      rpc
        .query({
          model: "user.notification",
          method: "action_open_record",
          args: [notificationId],
        })
        .then(function (result) {
          framework.unblockUI();

          if (result && typeof result === "number") {
            self.unreadCount = result;
            self._updateCounterDOM();
          }

          if (result && typeof result === "object" && result.type) {
            self._closeDropdown();
            self.do_action(result);
          } else {
            var notification = self.notifications.find(
              (n) => n.id === notificationId
            );
            if (notification && notification.state !== "read") {
              notification.state = "read";
              self.unreadNotifications = self.notifications.filter(
                (n) => n.state === "unread"
              );
              self._renderDropdown();
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
      var notificationId = parseInt($item.attr("data-notification-id"));

      if (!notificationId) return;

      framework.blockUI();
      rpc
        .query({
          model: "user.notification",
          method: "mark_as_read",
          args: [[notificationId]],
        })
        .then(function (result) {
          framework.unblockUI();
          var notification = self.notifications.find(
            (n) => n.id === notificationId
          );
          if (notification) notification.state = "read";
          self.unreadNotifications = self.notifications.filter(
            (n) => n.state === "unread"
          );

          self._renderDropdown();

          if (result && typeof result === "number") {
            self.unreadCount = result;
            self._updateCounterDOM();
          }
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
      var notificationId = parseInt($item.attr("data-notification-id"));

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
            self.notifications = self.notifications.filter(
              (n) => n.id !== notificationId
            );
            self.unreadNotifications = self.notifications.filter(
              (n) => n.state === "unread"
            );

            self._renderDropdown();

            if (result && typeof result === "number") {
              self.unreadCount = result;
              self._updateCounterDOM();
            }
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
        .then(function (result) {
          framework.unblockUI();
          self.notifications.forEach((notification) => {
            notification.state = "read";
          });
          self.unreadNotifications = [];

          self._renderDropdown();

          if (result && typeof result === "number") {
            self.unreadCount = result;
            self._updateCounterDOM();
          }
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

      this._closeDropdown();

      this.do_action("notification_bell.action_my_notification").catch(
        function (error) {
          console.error("Error opening notifications list view:", error);
          framework.crash_manager.show_warning({
            message: _t("Could not open the list of all notifications."),
          });
        }
      );
    },

    _updateCounterDOM: function () {
      if (!this.$el) return;

      var $counter = this.$el.find(".o_notification_counter");
      if ($counter.length > 0) {
        if (this.unreadCount > 0) {
          var countText =
            this.unreadCount > 99 ? "99+" : this.unreadCount.toString();
          $counter.text(countText).show();
        } else {
          $counter.hide();
        }
      } else {
        console.error(
          "NotificationBell: Counter element .o_notification_counter not found in $el when trying to update DOM."
        );
      }
    },
  });

  SystrayMenu.Items.push(NotificationBell);

  return NotificationBell;
});
