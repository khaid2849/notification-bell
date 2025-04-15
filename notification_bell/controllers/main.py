"""Notification Bell Controllers.

This module defines the controllers for handling notification
API requests from the frontend.
"""

from odoo import http
from odoo.http import request
from odoo import fields
import pytz
from odoo import api

class NotificationController(http.Controller):
    """Controller handling notification API endpoints.
    
    Provides routes for retrieving notifications, marking them as
    read/unread, and getting notification counts.
    """
    
    @http.route('/notification_bell/get_notifications', type='json', auth='user')
    def get_notifications(self, limit=None):
        """Lấy danh sách thông báo gần đây của người dùng hiện tại.
        
        Args:
            limit (int, optional): Số lượng thông báo tối đa sẽ trả về. Mặc định: 10.
            
        Returns:
            dict: Danh sách thông báo và số lượng thông báo chưa đọc
        """

        if not limit:
            settings = request.env['user.notification.settings'].get_user_settings(user_id=request.env.user.id)
            limit = settings.notifications_limit
        else:
            settings = request.env['user.notification.settings'].get_user_settings(user_id=request.env.user.id)

        Notification = request.env['user.notification']
        domain = [('user_id', '=', request.env.user.id)]
        notifications = Notification.search(domain, limit=limit, order='create_date desc')
        unread_count = Notification.get_unread_count()
        user_tz = request.env.user.tz or 'UTC'
        user_tz_obj = pytz.timezone(user_tz)
        
        result = {
            'notifications': [{
                'id': n.id,
                'name': n.name,
                'message': n.message,
                'create_date': fields.Datetime.context_timestamp(
                    request.env.user, 
                    n.create_date
                ).astimezone(user_tz_obj).strftime('%Y-%m-%d %H:%M:%S') if n.create_date else False,
                'state': n.state,
                'type': n.notification_type,
                'sender_name': n.sender_id.name,
                'sender_id': n.sender_id.id,
            } for n in notifications],
            'unread_count': unread_count,
            'settings': {
                'notifications_limit': settings.notifications_limit,
            },
        }
        
        return result
    
    @http.route('/notification_bell/mark_as_read', type='json', auth='user')
    def mark_as_read(self, notification_id=None, all_notifications=False):
        """Mark notification(s) as read.
        
        Marks a specific notification or all notifications as read
        for the current user.
        
        Args:
            notification_id (int, optional): ID of the notification to mark as read
            all_notifications (bool, optional): Whether to mark all notifications as read
            
        Returns:
            dict: Dictionary containing success status and unread count
        """
        user_id = request.env.user.id
        notifications = False
        
        if all_notifications:
            notifications = request.env['user.notification'].search([
                ('user_id', '=', user_id),
                ('state', '=', 'unread')
            ])
        elif notification_id:
            notifications = request.env['user.notification'].search([
                ('id', '=', notification_id),
                ('user_id', '=', user_id)
            ])
            
        if notifications:
            notifications.mark_as_read()
            
        return {
            'success': True,
            'unread_count': request.env['user.notification'].get_unread_count()
        }
    
    @http.route('/notification_bell/mark_as_unread', type='json', auth='user')
    def mark_as_unread(self, notification_id):
        """Mark notification as unread.
        
        Marks a specific notification as unread for the current user.
        
        Args:
            notification_id (int): ID of the notification to mark as unread
            
        Returns:
            dict: Dictionary containing success status and unread count
        """
        user_id = request.env.user.id
        notification = request.env['user.notification'].search([
            ('id', '=', notification_id),
            ('user_id', '=', user_id)
        ], limit=1)
        
        if notification:
            notification.mark_as_unread()
            
        return {
            'success': True,
            'unread_count': request.env['user.notification'].get_unread_count()
        }
    
    @http.route('/notification_bell/get_unread_count', type='json', auth='user')
    def get_unread_count(self):
        """Get unread notification count.
        
        Returns the count of unread notifications for the current user.
        
        Returns:
            dict: Dictionary containing unread count
        """
        return {
            'unread_count': request.env['user.notification'].get_unread_count()
        }
    
    @http.route('/notification_bell/dismiss_notification', type='json', auth='user')
    def dismiss_notification(self, notification_id):
        """Dismiss notification by setting it to inactive.
        
        Marks a specific notification as inactive for the current user.
        This will hide it from all notification lists but preserve it in the database.
        
        Args:
            notification_id (int): ID of the notification to dismiss
            
        Returns:
            dict: Dictionary containing success status and unread count
        """
        user_id = request.env.user.id
        notification = request.env['user.notification'].search([
            ('id', '=', notification_id),
            ('user_id', '=', user_id)
        ], limit=1)
        
        success = False
        if notification:
            notification.dismiss_notification()
            success = True
            
        return {
            'success': success,
            'unread_count': request.env['user.notification'].get_unread_count()
        } 