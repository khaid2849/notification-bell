/** @odoo-module **/

import { browser } from "@web/core/browser/browser";
import {
    Component, onWillStart, onMounted, useState, onWillUnmount,
} from "@odoo/owl";
import { session } from "@web/session";
import { useService } from "@web/core/utils/hooks";

export class NotificationBell extends Component {
    static template = "notification_bell.BellIcon";
    static props = {};


    setup() {
        super.setup()
        this.busService = this.env.services.bus_service;
        this.orm = useService('orm');
        this.rpc = useService('rpc');
        this.actionService = useService("action");

        this.state = useState({
            notifications: [], 
            unreadNotifications: [], 
            unreadCount: 0, 
            isOpen: false,
            activeTab: 'all',
        });

        onWillStart(async () => {
            await this.fetchUnreadCount();
            await this.fetchNotifications();
        });

        onMounted(() => {
            this._registerBusEvents();
            this._updateInterval = browser.setInterval(this.fetchUnreadCount.bind(this), 30000);
            document.addEventListener("click", this._handleClickOutside.bind(this));
        });

        onWillUnmount(() => {
            if (this._updateInterval) {
                browser.clearInterval(this._updateInterval);
            }
            document.removeEventListener("click", this._handleClickOutside.bind(this));
        });
    }

    /**
     *
     * @private
     */

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
                }
            }
        );
    }

    async fetchNotifications() {
        try {
            const result = await this.orm.call("user.notification", "get_notifications", []);
            if (result && result.notifications) {
                this.state.notifications = result.notifications;
                this.state.unreadNotifications = this.state.notifications.filter((n) => n.state === "unread");
                if (this.state.unreadNotifications.length > 0) {
                    this.state.unreadCount = this.state.unreadNotifications.length;
                }
                console.log("Fetched notifications, unread count:", this.state.unreadCount);
            }
        } catch (error) {
            console.error("Error fetching notifications:", error);
        }
    }

    async fetchUnreadCount() {
        try {
            const result = await this.orm.call("user.notification", "get_unread_count", []);
            if (result && typeof result.unread_count === 'number') {
                this.state.unreadCount = result.unread_count;
                console.log("Fetched unread count:", this.state.unreadCount);
            }
        } catch (error) {
            console.error("Error fetching unread count:", error);
        }
    }

    toggleDropdown(ev) {
        if (ev) {
            ev.preventDefault();
            ev.stopPropagation();
        }

        if (!this.state.isOpen) {
            this.fetchNotifications();
        }
        this.state.isOpen = !this.state.isOpen;
    }

    switchToAll(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        this.switchTab('all');
    }

    switchToUnread(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        this.switchTab('unread');
    }

    switchTab(tabName) {
        this.state.activeTab = tabName;
        
        const allTab = document.getElementById('all');
        const unreadTab = document.getElementById('unread');
        const allTabButton = document.getElementById('all-tab');
        const unreadTabButton = document.getElementById('unread-tab');
        
        if (tabName === 'all') {
            if (allTab) allTab.classList.add('show', 'active');
            if (unreadTab) unreadTab.classList.remove('show', 'active');
            if (allTabButton) allTabButton.classList.add('active');
            if (unreadTabButton) unreadTabButton.classList.remove('active');
        } else if (tabName === 'unread') {
            if (unreadTab) unreadTab.classList.add('show', 'active');
            if (allTab) allTab.classList.remove('show', 'active');
            if (unreadTabButton) unreadTabButton.classList.add('active');
            if (allTabButton) allTabButton.classList.remove('active');
        }
    }

    async openNotification(ev) {
        ev.preventDefault();
        ev.stopPropagation();

        const notificationId = parseInt(ev.currentTarget.dataset.notificationId);

        try {
            const result = await this.orm.call("user.notification", "action_open_record", [notificationId]);

            if (result && typeof result === "object" && result.type) {
                await this.actionService.doAction(result);
            }

            const notification = this.state.notifications.find((n) => n.id === notificationId);
            if (notification) {
                notification.state = "read";
            }
            
            this.state.unreadNotifications = this.state.notifications.filter((n) => n.state === "unread");
            this.state.unreadCount = this.state.unreadNotifications.length;
            this.fetchUnreadCount();
        } catch (error) {
            console.error("Error opening notification:", error);
        }
    }

    async markAllAsRead(ev) {
        ev.preventDefault();
        ev.stopPropagation();

        try {
            await this.orm.call("user.notification", "mark_all_as_read", []);

            this.state.notifications.forEach((notification) => {
                notification.state = "read";
            });
            this.state.unreadNotifications = [];
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
            await this.actionService.doAction("notification_bell.action_my_notification");
        } catch (error) {
            console.error("Error opening notifications list view:", error);
        }
    }

    async markAsRead(ev) {
        ev.preventDefault();
        ev.stopPropagation();

        const notificationId = parseInt(ev.currentTarget.dataset.notificationId);

        try {
            await this.orm.call("user.notification", "mark_as_read", [[notificationId],]);

            const notification = this.state.notifications.find((n) => n.id === notificationId);
            if (notification) {
                notification.state = "read";
            }

            this.state.unreadNotifications = this.state.notifications.filter((n) => n.state === "unread");
            this.state.unreadCount = this.state.unreadNotifications.length;
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
            const result = await this.orm.call("user.notification", "dismiss_notification", [notificationId]);

            if (result.success) {
                this.state.notifications = this.state.notifications.filter((n) => n.id !== notificationId);
                this.state.unreadNotifications = this.state.notifications.filter((n) => n.state === "unread");
                this.state.unreadCount = this.state.unreadNotifications.length;
                
                if (result.unread_count !== undefined) {
                    this.state.unreadCount = result.unread_count;
                }
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

