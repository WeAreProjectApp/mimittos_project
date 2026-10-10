import logging
from urllib.parse import urlencode

from django.conf import settings
from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin
from django.core.exceptions import PermissionDenied
from django.http import HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.urls import path, reverse
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _

from django_attachments.admin import AttachmentsAdminMixin

from .authentication import user_authentication_rule
from .forms.blog import BlogForm
from .forms.product import ProductForm
from .forms.user import UserChangeForm, UserCreationForm
from .models import (
    Blog, Product, Sale, SoldProduct, User, PasswordCode,
    Category, GlobalSize, GlobalColor, Peluch, PeluchSizePrice,
    Order, OrderItem, OrderStatusHistory, WompiTransaction,
    Review, SiteContent, PageView,
)
from .services.admin_login_service import AdminLoginService

logger = logging.getLogger(__name__)


# ============================================================================
# BLOG MANAGEMENT
# ============================================================================

class BlogAdmin(AttachmentsAdminMixin, admin.ModelAdmin):
    form = BlogForm
    list_display = ('title', 'category')
    search_fields = ('title', 'category')
    list_filter = ('category',)

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            obj.delete()


# ============================================================================
# PRODUCT MANAGEMENT
# ============================================================================

class ProductAdmin(AttachmentsAdminMixin, admin.ModelAdmin):
    form = ProductForm
    list_display = ('title', 'category', 'sub_category', 'price')
    search_fields = ('title', 'category', 'sub_category')
    list_filter = ('category', 'sub_category')

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            obj.delete()


# ============================================================================
# SALES MANAGEMENT
# ============================================================================

class SoldProductAdmin(admin.ModelAdmin):
    list_display = ('product', 'quantity')
    search_fields = ('product__title',)
    list_filter = ('product',)


class SaleAdmin(admin.ModelAdmin):
    list_display = ('email', 'address', 'city', 'state', 'postal_code', 'get_total_products')
    search_fields = ('email', 'city', 'state')
    list_filter = ('state', 'city')
    filter_horizontal = ('sold_products',)

    def get_total_products(self, obj):
        return obj.sold_products.count()
    get_total_products.short_description = 'Total Products'

    def delete_queryset(self, request, queryset):
        for sale in queryset:
            sale.delete()


# ============================================================================
# USER MANAGEMENT
# ============================================================================

class BaseFeatureUserAdmin(UserAdmin):
    add_form = UserCreationForm
    form = UserChangeForm
    ordering = ('email',)
    list_display = ('email', 'first_name', 'last_name', 'role', 'is_staff', 'is_active', 'email_verified')
    list_filter = ('role', 'is_staff', 'is_active', 'email_verified')
    search_fields = ('email', 'first_name', 'last_name')
    fieldsets = (
        (None, {'fields': ('email', 'password', 'impersonate_link')}),
        (_('Personal info'), {'fields': ('first_name', 'last_name', 'phone')}),
        (_('Role'), {'fields': ('role',)}),
        (
            _('Permissions'),
            {'fields': ('is_active', 'email_verified', 'is_staff', 'is_superuser', 'groups', 'user_permissions')},
        ),
        (_('Important dates'), {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (
            None,
            {
                'classes': ('wide',),
                'fields': ('email', 'password1', 'password2', 'role'),
            },
        ),
    )

    readonly_fields = ('date_joined', 'email_verified', 'impersonate_link')
    filter_horizontal = ('groups', 'user_permissions')

    def impersonate_link(self, obj):
        if not obj or not obj.pk:
            return '—'
        url = reverse('myadmin:base_feature_app_user_login_as', args=[obj.pk])
        return format_html(
            '<a class="button" href="{}" style="text-decoration:none" target="_blank" rel="noopener">Login as this user</a>',
            url,
        )
    impersonate_link.short_description = _('Impersonate')

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                '<int:user_id>/login_as/',
                self.admin_site.admin_view(self.login_as_user_view),
                name='base_feature_app_user_login_as',
            ),
        ]
        return custom_urls + urls

    def login_as_user_view(self, request, user_id):
        if not (user_authentication_rule(request.user) and request.user.is_superuser):
            raise PermissionDenied('Only active superusers can use Login-as.')

        target = get_object_or_404(User, pk=user_id)
        change_url = reverse('myadmin:base_feature_app_user_change', args=[user_id])

        if target.is_superuser and target.pk != request.user.pk:
            messages.error(request, _('No puedes iniciar sesión como otro superusuario.'))
            return HttpResponseRedirect(change_url)

        if not target.is_active:
            messages.error(request, _('Este usuario está inactivo.'))
            return HttpResponseRedirect(change_url)

        if not user_authentication_rule(target):
            messages.error(request, _('Este usuario aún no ha verificado su correo.'))
            return HttpResponseRedirect(change_url)

        handoff = AdminLoginService.issue_handoff(request.user, target)
        logger.info('admin %s issued login handoff for user %s', request.user.email, target.email)
        fragment = urlencode({'handoff': handoff})
        return HttpResponseRedirect(f'{settings.FRONTEND_URL}/admin-login#{fragment}')


class PasswordCodeAdmin(admin.ModelAdmin):
    list_display = ('user', 'code', 'purpose', 'created_at', 'used')
    search_fields = ('user__email', 'code')
    list_filter = ('purpose', 'used', 'created_at')
    readonly_fields = ('created_at',)
    
    def has_add_permission(self, request):
        # Don't allow manual creation from admin
        return False


# ============================================================================
# PELUCHELANDIA — CATALOG
# ============================================================================

class PeluchSizePriceInline(admin.TabularInline):
    model = PeluchSizePrice
    extra = 1
    fields = (
        'size', 'price', 'is_available',
        'deposit_percentage', 'full_payment_discount_pct', 'free_shipping', 'shipping_cost',
    )


class PeluchAdmin(AttachmentsAdminMixin, admin.ModelAdmin):
    list_display = ('title', 'category', 'badge', 'is_active', 'is_featured', 'average_rating', 'review_count')
    list_filter = ('category', 'badge', 'is_active', 'is_featured')
    search_fields = ('title', 'slug')
    prepopulated_fields = {'slug': ('title',)}
    inlines = [PeluchSizePriceInline]
    filter_horizontal = ('available_colors',)
    readonly_fields = ('average_rating', 'review_count', 'view_count', 'created_at', 'updated_at')

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            obj.delete()


class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'display_order', 'is_active')
    prepopulated_fields = {'slug': ('name',)}


class GlobalSizeAdmin(admin.ModelAdmin):
    list_display = ('label', 'cm', 'sort_order', 'is_active')


class GlobalColorAdmin(admin.ModelAdmin):
    list_display = ('name', 'hex_code', 'sort_order', 'is_active')


# ============================================================================
# PELUCHELANDIA — ORDERS
# ============================================================================

class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = (
        'peluch', 'size', 'color', 'quantity', 'unit_price',
        'personalization_cost', 'configuration_snapshot',
    )
    can_delete = False


class OrderStatusHistoryInline(admin.TabularInline):
    model = OrderStatusHistory
    extra = 0
    readonly_fields = ('previous_status', 'new_status', 'changed_by', 'notes', 'changed_at')
    can_delete = False


class WompiTransactionInline(admin.StackedInline):
    model = WompiTransaction
    extra = 0
    readonly_fields = ('reference', 'status', 'amount_in_cents', 'checkout_url', 'created_at')
    can_delete = False


class OrderAdmin(admin.ModelAdmin):
    list_display = (
        'order_number', 'customer_name', 'customer_email',
        'status', 'total_amount', 'deposit_amount', 'city', 'created_at',
    )
    list_filter = ('status', 'created_at', 'city')
    search_fields = ('order_number', 'customer_name', 'customer_email')
    readonly_fields = (
        'order_number', 'customer', 'total_amount', 'deposit_amount',
        'balance_amount', 'created_at', 'updated_at',
    )
    inlines = [OrderItemInline, OrderStatusHistoryInline, WompiTransactionInline]

    actions = ['mark_as_in_production', 'mark_as_shipped']

    def mark_as_in_production(self, request, queryset):
        from base_feature_app.services.order_service import OrderService
        from base_feature_app.models import Order as OrderModel
        for order in queryset.filter(status=OrderModel.Status.PAYMENT_CONFIRMED):
            OrderService.update_status(order, OrderModel.Status.IN_PRODUCTION, changed_by=request.user)
    mark_as_in_production.short_description = 'Mover a "En producción"'

    def mark_as_shipped(self, request, queryset):
        from base_feature_app.services.order_service import OrderService
        from base_feature_app.models import Order as OrderModel
        for order in queryset.filter(status=OrderModel.Status.IN_PRODUCTION):
            OrderService.update_status(order, OrderModel.Status.SHIPPED, changed_by=request.user)
    mark_as_shipped.short_description = 'Mover a "Despachado"'


# ============================================================================
# PELUCHELANDIA — REVIEWS
# ============================================================================

class ReviewAdmin(admin.ModelAdmin):
    list_display = ('peluch', 'user', 'rating', 'is_approved', 'created_at')
    list_filter = ('is_approved', 'rating')
    search_fields = ('peluch__title', 'user__email')
    actions = ['approve_reviews', 'reject_reviews']

    def approve_reviews(self, request, queryset):
        from base_feature_app.services.review_service import ReviewService
        for review in queryset:
            review.is_approved = True
            review.save(update_fields=['is_approved'])
            ReviewService.update_peluch_rating(review.peluch)
    approve_reviews.short_description = 'Aprobar reseñas seleccionadas'

    def reject_reviews(self, request, queryset):
        from base_feature_app.services.review_service import ReviewService
        for review in queryset:
            review.is_approved = False
            review.save(update_fields=['is_approved'])
            ReviewService.update_peluch_rating(review.peluch)
    reject_reviews.short_description = 'Rechazar reseñas seleccionadas'


# ============================================================================
# PELUCHELANDIA — CONTENT & ANALYTICS
# ============================================================================

class SiteContentAdmin(admin.ModelAdmin):
    list_display = ('key', 'updated_at', 'updated_by')
    readonly_fields = ('updated_at',)


class PageViewAdmin(admin.ModelAdmin):
    list_display = ('url_path', 'device_type', 'traffic_source', 'city', 'created_at')
    list_filter = ('device_type', 'traffic_source', 'created_at')
    readonly_fields = tuple(f.name for f in PageView._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


# ============================================================================
# CUSTOM ADMIN SITE - ORGANIZED BY SECTIONS
# ============================================================================

class BaseFeatureAdminSite(admin.AdminSite):
    site_header = 'Peluchelandia Administration'
    site_title = 'Peluchelandia Admin'
    index_title = 'Panel de Control — Peluchelandia'

    def get_app_list(self, request):
        app_dict = self._build_app_dict(request)
        base_app_models = app_dict.get('base_feature_app', {}).get('models', [])

        custom_app_list = [
            {
                'name': _('👥 Usuarios'),
                'app_label': 'user_management',
                'models': [
                    m for m in base_app_models
                    if m['object_name'] in ['User', 'PasswordCode']
                ],
            },
            {
                'name': _('🧸 Catálogo Peluchelandia'),
                'app_label': 'catalog_management',
                'models': [
                    m for m in base_app_models
                    if m['object_name'] in ['Peluch', 'Category', 'GlobalSize', 'GlobalColor']
                ],
            },
            {
                'name': _('📦 Pedidos y Producción'),
                'app_label': 'orders_management',
                'models': [
                    m for m in base_app_models
                    if m['object_name'] in ['Order', 'WompiTransaction']
                ],
            },
            {
                'name': _('⭐ Reseñas'),
                'app_label': 'reviews_management',
                'models': [
                    m for m in base_app_models
                    if m['object_name'] in ['Review']
                ],
            },
            {
                'name': _('📄 Contenido'),
                'app_label': 'content_management',
                'models': [
                    m for m in base_app_models
                    if m['object_name'] in ['SiteContent']
                ],
            },
            {
                'name': _('📊 Analítica'),
                'app_label': 'analytics_management',
                'models': [
                    m for m in base_app_models
                    if m['object_name'] in ['PageView']
                ],
            },
            {
                'name': _('📝 Blog'),
                'app_label': 'blog_management',
                'models': [
                    m for m in base_app_models
                    if m['object_name'] in ['Blog']
                ],
            },
        ]

        return [section for section in custom_app_list if section['models']]


# ============================================================================
# REGISTER MODELS
# ============================================================================

# Create an instance of the custom AdminSite
admin_site = BaseFeatureAdminSite(name='myadmin')

# Register all models with the custom AdminSite
admin_site.register(User, BaseFeatureUserAdmin)
admin_site.register(PasswordCode, PasswordCodeAdmin)
admin_site.register(Blog, BlogAdmin)
admin_site.register(Product, ProductAdmin)
admin_site.register(Sale, SaleAdmin)
admin_site.register(SoldProduct, SoldProductAdmin)

# Peluchelandia models
admin_site.register(Category, CategoryAdmin)
admin_site.register(GlobalSize, GlobalSizeAdmin)
admin_site.register(GlobalColor, GlobalColorAdmin)
admin_site.register(Peluch, PeluchAdmin)
admin_site.register(Order, OrderAdmin)
admin_site.register(WompiTransaction)
admin_site.register(Review, ReviewAdmin)
admin_site.register(SiteContent, SiteContentAdmin)
admin_site.register(PageView, PageViewAdmin)
