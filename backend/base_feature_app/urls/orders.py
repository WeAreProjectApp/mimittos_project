from django.urls import path
from base_feature_app.views import order_access_views, order_views

urlpatterns = [
    path('orders/', order_views.create_order, name='order-create'),
    path('orders/list/', order_views.orders_list, name='orders-list'),
    path('orders/my/', order_views.my_orders, name='my-orders'),
    path('orders/track/<str:order_number>/', order_views.track_order, name='track-order'),
    path('orders/<str:order_number>/access/request/', order_access_views.request_order_access, name='order-access-request'),
    path('orders/<str:order_number>/access/verify/', order_access_views.verify_order_access, name='order-access-verify'),
    path('orders/<str:order_number>/', order_views.order_detail_view, name='order-detail'),
    path('orders/<str:order_number>/status/', order_views.update_order_status, name='order-status-update'),
    path('orders/<str:order_number>/tracking/', order_views.update_order_tracking, name='order-tracking-update'),
]
