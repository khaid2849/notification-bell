/** @odoo-module **/

import { browser } from "@web/core/browser/browser";
import { useService } from "@web/core/utils/hooks";
import {
  Component,
  onWillStart,
  onMounted,
  useState,
  onWillUnmount,
} from "@odoo/owl";
import { formatDateTime, deserializeDateTime } from "@web/core/l10n/dates";
import { session } from "@web/session";

export class NotificationBell extends Component {
  static template = "notification_bell.BellIcon";
  static props = {};

  setup() {
    this.orm = useService("orm");
    this.action = useService("action");
    this.busService = useService("bus_service");

    this.formatDateTime = (dateStr) => {
      if (!dateStr) return "";
      try {
        const luxonDate = deserializeDateTime(dateStr);
        if (!luxonDate || !luxonDate.isValid) {
          return "";
        }
        return formatDateTime(luxonDate, { format: "short" });
      } catch (error) {
        console.error("Error formatting date:", error);
        return "";
      }
    };

    this.state = useState({
      notifications: [],
      unreadNotifications: [],
      unreadCount: 0,
      isOpen: false,
    });

    onWillStart(async () => {
      await this.fetchNotifications();
      await this.fetchUnreadCount();
    });

    onMounted(() => {
      this._registerBusEvents();
      this._updateInterval = browser.setInterval(
        this.fetchUnreadCount.bind(this),
        60000
      );

      document.addEventListener("click", this._handleClickOutside.bind(this));
    });

    onWillUnmount(() => {
      if (this._updateInterval) {
        browser.clearInterval(this._updateInterval);
      }

      document.removeEventListener(
        "click",
        this._handleClickOutside.bind(this)
      );
    });
  }

  /**
   * 
   * @private
   */
  _playNotificationSound() {
    try {
      this.notificationSound.currentTime = 0;
      this.notificationSound.play().catch(error => {
        console.warn("Could not play notification sound:", error);
      });
    } catch (error) {
      console.warn("Error playing notification sound:", error);
    }
  }


  _registerBusEvents() {
    const channel = `notification_bell_${session.user_id}`;
    this.busService.addChannel(channel);
    this.busService.addEventListener(
      "notification",
      ({ detail: notifications }) => {
        const notificationBellNotifs = notifications.filter(
          (notif) => notif.type === "new_notification"
        );

        if (notificationBellNotifs.length) {
          this.fetchUnreadCount();

          if (this.state.isOpen) {
            this.fetchNotifications();
          }

          this._playNotificationSound();
        }
      }
    );
  }

  async fetchNotifications() {
    try {
      const result = await this._performRpc(
        "/notification_bell/get_notifications"
      );
      this.state.notifications = result.notifications || [];
      this.state.unreadNotifications = this.state.notifications.filter(
        (n) => n.state === "unread"
      );
      this.state.unreadCount = result.unread_count || 0;
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  }

  async fetchUnreadCount() {
    try {
      const result = await this._performRpc(
        "/notification_bell/get_unread_count"
      );
      this.state.unreadCount = result.unread_count || 0;
    } catch (error) {
      console.error("Error fetching unread count:", error);
    }
  }

  /**
   * @private
   */
  async _performRpc(route, params = {}) {
    return this.orm.call("user.notification", "json_rpc", [route, params]);
  }

  toggleDropdown(ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();

      if (ev.target.closest(".nav-link")) {
        return;
      }
    }

    if (!this.state.isOpen) {
      this.fetchNotifications();
    }
    this.state.isOpen = !this.state.isOpen;
  }

  async openNotification(ev) {
    ev.preventDefault();
    ev.stopPropagation();

    const notificationId = parseInt(ev.currentTarget.dataset.notificationId);

    try {
      const result = await this.orm.call(
        "user.notification",
        "action_open_record",
        [notificationId]
      );

      if (result && typeof result === "object" && result.type) {
        await this.action.doAction(result);
      }

      this.fetchUnreadCount();

      const notification = this.state.notifications.find(
        (n) => n.id === notificationId
      );
      if (notification) {
        notification.state = "read";
      }
    } catch (error) {
      console.error("Error opening notification:", error);
    }
  }

  async markAllAsRead(ev) {
    ev.preventDefault();
    ev.stopPropagation();

    try {
      await this._performRpc("/notification_bell/mark_as_read", {
        all_notifications: true,
      });

      this.state.notifications.forEach((notification) => {
        notification.state = "read";
      });
      this.state.unreadCount = 0;
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  }

  async viewAllNotifications(ev) {
    ev.preventDefault();
    ev.stopPropagation();

    try {
      this.state.isOpen = false;
      
      await this.action.doAction('notification_bell.action_my_notification');
    } catch (error) {
      console.error("Error opening notifications list view:", error);
    }
  }


  async markAsRead(ev) {
    ev.preventDefault();
    ev.stopPropagation();

    const notificationId = parseInt(ev.currentTarget.dataset.notificationId);

    try {
      await this.orm.call("user.notification", "mark_as_read", [
        [notificationId],
      ]);

      const notification = this.state.notifications.find(
        (n) => n.id === notificationId
      );
      if (notification) {
        notification.state = "read";
      }

      this.state.unreadNotifications = this.state.notifications.filter(
        (n) => n.state === "unread"
      );

      this.fetchUnreadCount();
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  }

  async dismissNotification(ev) {
    ev.preventDefault();
    ev.stopPropagation();

    const notificationId = parseInt(ev.currentTarget.dataset.notificationId);

    try {
      const result = await this._performRpc(
        "/notification_bell/dismiss_notification",
        {
          notification_id: notificationId,
        }
      );

      if (result.success) {
        this.state.notifications = this.state.notifications.filter(
          (n) => n.id !== notificationId
        );

        this.state.unreadNotifications = this.state.unreadNotifications.filter(
          (n) => n.id !== notificationId
        );

        this.state.unreadCount = result.unread_count || 0;
      }
    } catch (error) {
      console.error("Error dismissing notification:", error);
    }
  }

  _handleClickOutside(ev) {
    const dropdownEl = document.querySelector(".o_notification_bell_icon");

    if (dropdownEl && !dropdownEl.contains(ev.target) && this.state.isOpen) {
      this.state.isOpen = false;
    }
  }
}
