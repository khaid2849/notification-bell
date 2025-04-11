# -*- coding: utf-8 -*-
{
    'name': 'Notification Bell',
    'version': '1.0',
    'category': 'Extra Tools',
    'summary': 'A bell icon notification system similar to social media platforms',
    'description': """
# Notification Bell System

## Description
A modern notification system that brings social media-style notifications to your Odoo instance. This module adds an intuitive bell icon to the navigation bar that displays real-time notifications in a dropdown menu.

## Features
* Interactive bell icon in the navigation bar
* Real-time notification counter badge
* Dropdown menu with recent notifications list
* One-click mark as read functionality
* Real-time updates using Odoo's bus system
* Customizable notification settings

## Installation
1. Install the module through Odoo's module installation interface
2. Configure notification preferences in Settings
3. No additional configuration needed - works out of the box

## Usage
- Users will see a bell icon in their navigation bar
- New notifications appear in real-time
- Click on notifications to view details
- Mark notifications as read individually or all at once
- Configure notification preferences in user settings

## Support
For issues and feature requests, please contact the module author.

## License
This module is licensed under LGPL-3.
""",
    'author': 'Gout',
    'depends': ['base', 'web', 'bus', 'mail'],
    'data': [
        'security/notification_security.xml',
        'security/ir.model.access.csv',
        'views/notification_views.xml',
        'views/notification_settings_views.xml',
        'views/menuitem.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'notification_bell/static/src/scss/**/*',
            'notification_bell/static/src/js/notification_bell.js',
            'notification_bell/static/src/js/systray_notification_menu.js',
            'notification_bell/static/src/xml/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
    'images': [
        'static/description/images.png',
    ],
} 