# -*- coding: utf-8 -*-
{
    'name': 'Notification Bell',
    'version': '1.0',
    'category': 'Extra Tools',
    'summary': 'A bell icon notification system similar to social media platforms',
    'description': """
Notification Bell
================
This module adds a notification bell icon to the navigation bar that displays 
notifications in a dropdown.

Features:
- Bell icon in the navigation bar
- Unread count displayed as a badge
- List of recent notifications
- Ability to mark notifications as read
- Real-time updates using Odoo's bus system
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
} 