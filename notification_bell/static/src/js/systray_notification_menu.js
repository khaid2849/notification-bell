/** @odoo-module **/

import { registry } from "@web/core/registry";
import { NotificationBellComponent } from "./notification_bell";

const systrayRegistry = registry.category("systray");

systrayRegistry.add("notification_bell", {
  Component: NotificationBellComponent,
  sequence: 10,
});
