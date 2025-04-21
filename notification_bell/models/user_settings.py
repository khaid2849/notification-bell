"""User Notification Settings model.

This module defines the User Notification Settings model which handles
notification preferences for users.
"""

from odoo import api, fields, models, _

class UserNotificationSettings(models.Model):
    """User Notification Settings Model.
    
    Stores notification preferences for each user such as
    the number of notifications to display.
    """
    
    _name = 'user.notification.settings'
    _description = 'User Notification Settings'
    _rec_name = 'user_id'
    
    user_id = fields.Many2one(
        'res.users', 
        string='User', 
        required=True, 
        index=True,
        ondelete='cascade'
    )
    
    notifications_limit = fields.Integer(
        string='Number of Notifications',
        default=10,
        help='Maximum number of notifications to display in the dropdown'
    )
    
    _sql_constraints = [
        ('user_uniq', 'UNIQUE(user_id)', 'A user can only have one notification settings record!')
    ]
    
    @api.model
    def get_user_settings(self, user_id=None):
        """Get settings for a specific user or create default if not exists.
        
        Args:
            user_id (int, optional): The user ID to get settings for.
                If not provided, uses the current user.
                
        Returns:
            UserNotificationSettings: User notification settings record
        """
        if not user_id:
            user_id = self.env.user.id
            
        settings = self.search([('user_id', '=', user_id)], limit=1)
        if not settings:
            settings = self.create({'user_id': user_id})
            
        return settings 