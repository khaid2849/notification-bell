/** @odoo-module **/

import { registry } from "@web/core/registry";
import { NotificationBell } from "./notification_bell";

const systrayRegistry = registry.category("systray");

systrayRegistry.add("notification_bell", {
  Component: NotificationBell,
  sequence: 10,
});
