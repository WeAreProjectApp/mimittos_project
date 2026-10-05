from rest_framework import serializers

from base_feature_app.models import User


class UserListSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'email', 'first_name', 'last_name', 'role', 'is_active', 'email_verified', 'is_staff')
        read_only_fields = ('email_verified',)
