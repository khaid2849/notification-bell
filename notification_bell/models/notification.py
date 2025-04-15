"""User Notification model and related business logic.

This module defines the User Notification model which handles
notification functionality similar to social media platforms.
"""

from odoo import api, fields, models, _
import json
import json


class UserNotification(models.Model):
    """User Notification Model.
    
    Stores and manages notifications sent between users.
    Provides methods for marking notifications as read/unread
    and handling notification delivery.
    """
    
    _name = 'user.notification'
    _description = 'User Notification'
    _order = 'create_date desc'

    name = fields.Char(string='Title', required=True)
    message = fields.Text(string='Message', required=True)
    user_id = fields.Many2one(
        'res.users', 
        string='To User', 
        required=True,
        default=lambda self: self.env.user
    )
    sender_id = fields.Many2one(
        'res.users', 
        string='From User', 
        required=True,
        default=lambda self: self.env.user
    )
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        default=lambda self: self.env.company,
    )
    active = fields.Boolean(
        string='Active', 
        default=True,
        help='If the active field is set to False, it will allow you to hide the notification without removing it.'
    )
    state = fields.Selection(
        [
            ('unread', 'Unread'),
            ('read', 'Read')
        ], 
        string='Status', 
        default='unread',
    )
    read_date = fields.Datetime(string='Read Date')
    res_model = fields.Char(string='Related Model')
    res_id = fields.Integer(string='Related Document ID')
    action_type = fields.Selection([
        ('message', 'Message'),    # Default behavior - normal message
        ('record', 'Record'),   # Open a specific record
        ('url', 'URL'),           # Open a URL
        ('window', 'Window')      # Open a window
    ], string='Target Type', default='message')
    
    action_id = fields.Many2one('ir.actions.actions', string='Action')
    action_xml_id = fields.Char(string='Action XML ID')
    action_context = fields.Text(string='Action Context', help="JSON encoded context to pass to the action")
    action_url = fields.Char(string='Action URL')
    notification_type = fields.Selection(
        [
            ('info', 'Information'),
            ('success', 'Success'),
            ('warning', 'Warning'),
            ('danger', 'Danger')
        ], 
        string='Type', 
        default='info'
    )

    def mark_as_read(self):
        """Mark notification as read and return new unread count.
        
        Updates the state to 'read' and sets the read_date
        to the current datetime.
        
        Returns:
            dict: Dictionary containing the new unread count for the user.
        """
        user_id = self.env.uid
        notifications_to_update = self.filtered(lambda n: n.user_id.id == user_id)
        if not notifications_to_update:
             return {'unread_count': self.get_unread_count(user_id=user_id)}
             
        for notification in notifications_to_update:
            if notification.state == 'unread':
                notification.write({
                    'state': 'read',
                    'read_date': fields.Datetime.now()
                })
        return {'unread_count': self.get_unread_count(user_id=user_id)}
    
    def mark_as_unread(self):
        """Mark notification as unread.
        
        Updates the state to 'unread' and clears the read_date.
        
        Returns:
            bool: True indicating success
        """
        for notification in self:
            if notification.state == 'read':
                notification.write({
                    'state': 'unread',
                    'read_date': False
                })
        return True
    
    @api.model_create_multi
    def create(self, vals_list):
        """Override create to send notification to the user.
        
        Args:
            vals_list (list): List of dictionaries with values for creating notifications
            
        Returns:
            UserNotification: Created notification records
        """
        records = super(UserNotification, self).create(vals_list)
        for record in records:
            self._notify_user(record)
        return records
    
    def _notify_user(self, notification):
        """Send notification through the bus.
        
        Prepares notification data and sends it to the user's
        notification channel.
        
        Args:
            notification (UserNotification): The notification to send
        """
        notification_data = {
            'id': notification.id,
            'name': notification.name,
            'message': notification.message,
            'type': notification.notification_type,
            'action_type': notification.action_type,
            'res_model': notification.res_model,
            'res_id': notification.res_id,
            'create_date': fields.Datetime.to_string(notification.create_date),
            'sender_name': notification.sender_id.name,
        }
        
        channel = f'notification_bell_{notification.user_id.id}'
        self.env['bus.bus']._sendone(channel, 'new_notification', notification_data)
    
    @api.model
    def get_unread_count(self, user_id=None):
        """Get count of unread notifications for a user.
        
        Args:
            user_id (int, optional): The user ID to check for.
                If not provided, uses the current user.
                
        Returns:
            int: Number of unread notifications
        """
        domain = [('state', '=', 'unread'), ('active', '=', True)]
        if user_id:
            domain.append(('user_id', '=', user_id))
        else:
            domain.append(('user_id', '=', self.env.user.id))
        
        return self.search_count(domain)
    
    @api.model
    def action_open_record(self, notification_id=None):
        """
        Mark notification as read and return action to open related record
        
        Args:
            notification_id (int, optional): The notification ID to open.
                If not provided, try to get it from context.
        
        Returns:
            dict: Action to open the record or a dictionary containing the new unread count.
        """
        if notification_id is None:
            notification_id = self.env.context.get('notification_id')
            if not notification_id:
                return {'unread_count': self.get_unread_count(user_id=self.env.uid)}
                
        notification = self.browse(notification_id)
        if notification.user_id.id != self.env.uid:
             return {'unread_count': self.get_unread_count(user_id=self.env.uid)}
            
        if notification.state == 'unread':
             notification.sudo().write({"state": "read", "read_date": fields.Datetime.now()})
        
        new_unread_count = self.get_unread_count(user_id=self.env.uid)
        
        action_to_return = False
        if notification.action_type:
            if notification.action_type == 'url' and notification.action_url:
                action_to_return = {
                    'type': 'ir.actions.act_url',
                    'url': notification.action_url,
                    'target': 'new',
                }
            elif notification.action_type == 'window':
                action = {}
                if notification.action_id:
                    action = notification.action_id.read()[0]
                elif notification.action_xml_id:
                    action = self.env.ref(notification.action_xml_id).read()[0]
                    
                if notification.action_context:
                    try:
                        context = json.loads(notification.action_context)
                        action['context'] = context
                    except:
                        pass
                if action:
                    action_to_return = action
            elif notification.action_type == 'record' and notification.res_model and notification.res_id:
                action_to_return = {
                    'type': 'ir.actions.act_window',
                    'res_model': notification.res_model,
                    'res_id': notification.res_id,
                    'views': [(False, 'form')],
                    'view_mode': 'form',
                    'target': 'current',
                }
        
        if action_to_return:
            action_to_return['unread_count'] = new_unread_count 
            return action_to_return
        else:
            return {'unread_count': new_unread_count}
    
    def dismiss_notification(self):
        """Dismiss notification by setting it to inactive and return new count.
        
        Sets the notification to inactive state so it's no longer visible
        in notification lists but remains in the database for history.
        
        Returns:
            dict: Dictionary containing success status and the new unread count.
        """
        user_id = self.env.uid
        notifications_to_update = self.filtered(lambda n: n.user_id.id == user_id)
        success = False
        if notifications_to_update:
            notifications_to_update.write({
                'active': False
            })
            success = True
            
        return {
            'success': success,
            'unread_count': self.get_unread_count(user_id=user_id)
            }
            
    @api.model
    def mark_all_as_read(self):
        """Mark all unread notifications for the current user as read.
        
        Returns:
            dict: Dictionary containing the new unread count (should be 0).
        """
        user_id = self.env.uid
        notifications = self.search([('user_id', '=', user_id), ('state', '=', 'unread')])
        if notifications:
            notifications.write({
                'state': 'read',
                'read_date': fields.Datetime.now()
            })
        return {'unread_count': self.get_unread_count(user_id=user_id)}
        
    @api.model
    def send_notification(self, user_id, name, message, res_model=False, 
                          res_id=False, notification_type='info'):
        """Create notification from anywhere in the system.
        
        Helper method to easily create notifications from other modules.
        This method creates a notification linked to a specific record.
        
        Args:
            user_id (int): ID of the user to notify
            name (str): Notification title
            message (str): Notification message
            res_model (str, optional): Related model name
            res_id (int, optional): Related record ID
            notification_type (str, optional): Type of notification
                (info, success, warning, danger)
            
        Returns:
            UserNotification: Created notification record
        """
        return self.create([{
            'user_id': user_id,
            'sender_id': self.env.user.id,
            'name': name,
            'message': message,
            'res_model': res_model,
            'res_id': res_id,
            'notification_type': notification_type,
            'action_type': 'message',
        }])
    
    @api.model
    def send_window_action_notification(self, user_id, name, message, action_xml_id=False, 
                               action_id=False, action_context=None, notification_type='info'):
        """Create a window action notification from anywhere in the system.
        
        Helper method to easily create notifications linked to Odoo actions.
        
        Args:
            user_id (int): ID of the user to notify
            name (str): Notification title
            message (str): Notification message
            action_xml_id (str, optional): XML ID of the action to execute
            action_id (int, optional): ID of the action to execute
            action_context (dict, optional): Additional context for the action
            notification_type (str, optional): Type of notification
                (info, success, warning, danger)
            
        Returns:
            UserNotification: Created notification window action
        """
        vals = {
            'user_id': user_id,
            'sender_id': self.env.user.id,
            'name': name,
            'message': message,
            'notification_type': notification_type,
            'action_type': 'window',
        }
        
        if action_xml_id:
            vals['action_xml_id'] = action_xml_id
        
        if action_id:
            vals['action_id'] = action_id
            
        if action_context:
            vals['action_context'] = json.dumps(action_context)
            
        return self.create([vals])

    @api.model
    def send_url_action_notification(self, user_id, name, message, url, notification_type='info'):
        """Create a URL action notification from anywhere in the system.
        
        Helper method to easily create notifications linked to external URLs.
        
        Args:
            user_id (int): ID of the user to notify
            name (str): Notification title
            message (str): Notification message
            url (str): URL to open when clicking on the notification
            notification_type (str, optional): Type of notification
                (info, success, warning, danger)
            
        Returns:
            UserNotification: Created notification record
        """
        vals = {
            'user_id': user_id,
            'sender_id': self.env.user.id,
            'name': name,
            'message': message,
            'notification_type': notification_type,
            'action_type': 'url',
            'action_url': url,
        }
            
        return self.create([vals])

    @api.model
    def send_record_action_notification(self, user_id, name, message, res_model, res_id, notification_type='info'):
        """Create a record action notification from anywhere in the system.
        
        Helper method to easily create notifications linked to specific Odoo records.
        When clicked, the notification will open the form view of the specified record.
        
        Args:
            user_id (int): ID of the user to notify
            name (str): Notification title
            message (str): Notification message
            res_model (str): Model name of the related record (e.g., 'res.partner')
            res_id (int): ID of the record to open
            notification_type (str, optional): Type of notification
                (info, success, warning, danger)
            
        Returns:
            UserNotification: Created notification record
        """
        vals = {
            'user_id': user_id,
            'sender_id': self.env.user.id,
            'name': name,
            'message': message,
            'notification_type': notification_type,
            'action_type': 'record',
            'res_model': res_model,
            'res_id': res_id,
        }
            
        return self.create([vals]) 
    
    @api.model
    def get_notifications(self, limit=None):
        """Fetch all and unread notifications for the current user."""
        user_id = self.env.user.id
        
        if not limit:
            settings = self.env['user.notification.settings'].get_user_settings()
            limit = settings.notifications_limit
            
        notifications = self.search([('user_id', '=', user_id), ('active', '=', True)], limit=limit)
        unread_notifications = notifications.filtered(lambda n: n.state == 'unread')
        
        return {
            'notifications': notifications.read(['id', 'name', 'message', 'state', 'create_date', 'sender_id']),
            'unread_count': len(unread_notifications),
        }