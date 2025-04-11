# User Notification Module

This module offers a user notification system within Odoo, akin to social media platforms.

## Overview

The User Notification module allows users to receive and manage notifications directly from the Odoo interface. Notifications can be marked as read or unread, and can link to specific records or URLs.

## Features

- **Notification Management:** Create, read, and manage notifications.
- **Real-time Updates:** Notifications update in real-time using Odoo Bus.
- **Actionable Notifications:** Notifications can open records, URLs, or Odoo action windows.

## User Instructions

### Viewing Notifications

- **Notification Icon:** A bell icon in the systray shows unread notification count.
- **Dropdown List:** Click the bell to view recent notifications.
- **Mark as Read:** Click a notification to mark it as read and open related records.

### Sending Notifications

Developers can send notifications using the `send_notification` method on the `user.notification` model.

**Example:**
```python
self.env['user.notification'].send_notification(
    user_id=target_user_id,
    name="New Approval Request",
    message="You have a pending approval request.",
    res_model='purchase.order',
    res_id=456,
    notification_type='info'
)
```

**Example for URL Notification:**
```python
self.env['user.notification'].send_url_action_notification(
    user_id=target_user_id,
    name="Check this out!",
    message="Here's a link to something interesting.",
    url="https://example.com",
    notification_type='info'
)
```

**Example for Record Notification:**
```python
self.env['user.notification'].send_record_action_notification(
    user_id=target_user_id,
    name="Record Update",
    message="A record has been updated.",
    res_model='res.partner',
    res_id=789,
    notification_type='success'
)
```

**Example for Odoo Window Action Notification:**
```python
self.env['user.notification'].send_window_action_notification(
    user_id=target_user_id,
    name="Open Window Action",
    message="This will open a window action.",
    action_xml_id='module_name.action_id',
    action_context={'key': 'value'},
    notification_type='info'
)
```

## Technical Information

- **Model:** `user.notification`
- **Controller:** `NotificationController`
- **OWL Component:** `NotificationBell`
- **Bus Channel:** `notification_bell_<user_id>`
