from rest_framework import serializers

from base_feature_app.models import Review


class ReviewSerializer(serializers.ModelSerializer):
    is_mine = serializers.SerializerMethodField()
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = ('id', 'is_mine', 'user_name', 'rating', 'comment', 'created_at')

    def get_is_mine(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        return bool(user and user.is_authenticated and obj.user_id == user.pk)

    def get_user_name(self, obj):
        return obj.user.first_name or obj.user.email.split('@')[0]


class HomeReviewSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    peluch_title = serializers.CharField(source='peluch.title', read_only=True)

    class Meta:
        model = Review
        fields = ['id', 'user_name', 'rating', 'comment', 'peluch_title', 'created_at']

    def get_user_name(self, obj):
        return obj.user.first_name or obj.user.email.split('@')[0]


class ReviewCreateSerializer(serializers.Serializer):
    rating = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(min_length=10, max_length=1000)
    order_id = serializers.IntegerField(required=False, allow_null=True)
