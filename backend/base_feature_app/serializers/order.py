from collections.abc import Mapping

from django.db.models import Q
from rest_framework import serializers
from rest_framework.utils import html

from base_feature_app.models import (
    GlobalColor, GlobalSize, Order, OrderItem, OrderStatusHistory, Peluch,
    PeluchSizePrice, PersonalizationMedia, WompiTransaction,
)
from base_feature_app.serializers.catalog import GlobalSizeSerializer, GlobalColorSerializer
from base_feature_app.utils.media_access import can_use_media


ORDER_ITEM_VALIDATION_BATCH_SIZE = 100


class _OrderItemLookups:
    """Request-local catalog data for one bounded group of cart lines."""

    def __init__(self, items):
        self.peluches = {
            peluch.pk: peluch
            for peluch in Peluch.objects.filter(
                pk__in={item.get('peluch_id') for item in items}, is_active=True,
            ).only(
                'id', 'title', 'discount_pct', 'has_huella', 'has_corazon',
                'has_audio', 'huella_extra_cost', 'corazon_extra_cost', 'audio_extra_cost',
            )
        }
        self.sizes = {
            size.pk: size for size in GlobalSize.objects.filter(
                pk__in={item.get('size_id') for item in items}, is_active=True,
            )
        }
        self.colors = {
            color.pk: color for color in GlobalColor.objects.filter(
                pk__in={item.get('color_id') for item in items}, is_active=True,
            )
        }
        color_pairs = Q(pk__in=[])
        size_pairs = Q(pk__in=[])
        for item in items:
            if item.get('peluch_id') in self.peluches:
                if item.get('color_id') in self.colors:
                    color_pairs |= Q(peluch_id=item['peluch_id'], globalcolor_id=item['color_id'])
                if item.get('size_id') in self.sizes:
                    size_pairs |= Q(peluch_id=item['peluch_id'], size_id=item['size_id'])
        self.available_colors = set(
            Peluch.available_colors.through.objects.filter(color_pairs)
            .values_list('peluch_id', 'globalcolor_id')
        )
        self.available_sizes = set(
            PeluchSizePrice.objects.filter(size_pairs, is_available=True).order_by()
            .values_list('peluch_id', 'size_id')
        )
        media_ids = {
            item.get(field) for item in items
            for field in ('huella_media_id', 'audio_media_id')
        }
        self.media = {
            (media.pk, media.media_type): media
            for media in PersonalizationMedia.objects.filter(pk__in=media_ids).only(
                'id', 'media_type', 'uploaded_by_id',
            )
        }


class OrderItemCreateListSerializer(serializers.ListSerializer):
    """Keep DRF's per-line validation/errors while sharing bounded lookups."""

    def to_internal_value(self, data):
        if html.is_html_input(data):
            data = html.parse_html_list(data, default=[])
        self._input_items = data if isinstance(data, list) else []
        self._item_index = 0
        self._item_lookups = None
        try:
            return super().to_internal_value(data)
        finally:
            self._input_items = []
            self._item_lookups = None

    def run_child_validation(self, data):
        if self._item_index % ORDER_ITEM_VALIDATION_BATCH_SIZE == 0:
            stop = self._item_index + ORDER_ITEM_VALIDATION_BATCH_SIZE
            items = []
            for raw_item in self._input_items[self._item_index:stop]:
                item = {}
                if isinstance(raw_item, Mapping):
                    for name in ('peluch_id', 'size_id', 'color_id', 'huella_media_id', 'audio_media_id'):
                        field = self.child.fields[name]
                        try:
                            item[name] = field.run_validation(field.get_value(raw_item))
                        except (serializers.ValidationError, serializers.SkipField):
                            # The normal child validation collects every error below.
                            pass
                items.append(item)
            self._item_lookups = _OrderItemLookups(items)
        self._item_index += 1
        return super().run_child_validation(data)


class OrderItemCreateSerializer(serializers.Serializer):
    peluch_id = serializers.IntegerField()
    size_id = serializers.IntegerField()
    color_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1, max_value=10)
    has_huella = serializers.BooleanField(default=False)
    huella_type = serializers.ChoiceField(
        choices=OrderItem.HuellaType.choices, required=False, allow_blank=True
    )
    huella_text = serializers.CharField(max_length=60, required=False, allow_blank=True)
    huella_media_id = serializers.IntegerField(required=False, allow_null=True)
    huella_media_token = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=512,
    )
    has_corazon = serializers.BooleanField(default=False)
    corazon_phrase = serializers.CharField(max_length=50, required=False, allow_blank=True)
    has_audio = serializers.BooleanField(default=False)
    audio_media_id = serializers.IntegerField(required=False, allow_null=True)
    audio_media_token = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=512,
    )

    class Meta:
        list_serializer_class = OrderItemCreateListSerializer

    def validate(self, data):
        lookups = getattr(self.parent, '_item_lookups', None)
        if lookups is None:
            lookups = _OrderItemLookups([data])

        peluch = lookups.peluches.get(data['peluch_id'])
        if peluch is None:
            raise serializers.ValidationError({'peluch_id': 'Peluche no encontrado.'})

        size = lookups.sizes.get(data['size_id'])
        if size is None:
            raise serializers.ValidationError({'size_id': 'Tamaño no válido.'})

        color = lookups.colors.get(data['color_id'])
        if color is None:
            raise serializers.ValidationError({'color_id': 'Color no válido.'})

        if (peluch.id, color.id) not in lookups.available_colors:
            raise serializers.ValidationError({'color_id': 'Este color no está disponible para este peluche.'})

        if (peluch.id, size.id) not in lookups.available_sizes:
            raise serializers.ValidationError({'size_id': 'Este tamaño no está disponible para este peluche.'})

        if data.get('has_huella'):
            if not peluch.has_huella:
                raise serializers.ValidationError({'has_huella': 'Este peluche no ofrece personalización de huella.'})
            if data.get('huella_type') == OrderItem.HuellaType.IMAGE:
                media_id = data.get('huella_media_id')
                if not media_id:
                    raise serializers.ValidationError({'huella_media_id': 'Debes subir una imagen para la huella.'})
                media = lookups.media.get((media_id, PersonalizationMedia.MediaType.HUELLA_IMAGE))
                if media is None:
                    raise serializers.ValidationError({'huella_media_id': 'Imagen de huella no encontrada.'})
                request = self.context.get('request')
                if not can_use_media(media, getattr(request, 'user', None), data.get('huella_media_token')):
                    raise serializers.ValidationError({
                        'huella_media_id': 'Vuelve a subir la imagen de huella de este peluche para completar tu pedido.',
                    }, code='media_access_required')
                data['huella_media'] = media

        if data.get('has_audio'):
            if not peluch.has_audio:
                raise serializers.ValidationError({'has_audio': 'Este peluche no ofrece audio personalizado.'})
            media_id = data.get('audio_media_id')
            if not media_id:
                raise serializers.ValidationError({'audio_media_id': 'Debes subir un audio.'})
            media = lookups.media.get((media_id, PersonalizationMedia.MediaType.AUDIO))
            if media is None:
                raise serializers.ValidationError({'audio_media_id': 'Audio no encontrado.'})
            request = self.context.get('request')
            if not can_use_media(media, getattr(request, 'user', None), data.get('audio_media_token')):
                raise serializers.ValidationError({
                    'audio_media_id': 'Vuelve a subir el audio de este peluche para completar tu pedido.',
                }, code='media_access_required')
            data['audio_media'] = media

        data['peluch'] = peluch
        data['size'] = size
        data['color'] = color
        return data


class OrderCreateSerializer(serializers.Serializer):
    customer_name = serializers.CharField(max_length=200)
    customer_email = serializers.EmailField()
    customer_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    address = serializers.CharField(max_length=255)
    city = serializers.CharField(max_length=100)
    department = serializers.CharField(max_length=100)
    postal_code = serializers.CharField(max_length=20, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    payment_mode = serializers.ChoiceField(
        choices=Order.PaymentMode.choices,
        default=Order.PaymentMode.DEPOSIT,
    )
    items = OrderItemCreateSerializer(many=True, min_length=1)


class OrderItemReadSerializer(serializers.ModelSerializer):
    peluch_title = serializers.CharField(source='peluch.title', read_only=True)
    peluch_slug = serializers.CharField(source='peluch.slug', read_only=True)
    size = GlobalSizeSerializer(read_only=True)
    color = GlobalColorSerializer(read_only=True)
    line_total = serializers.IntegerField(read_only=True)
    huella_media_url = serializers.SerializerMethodField()
    audio_media_url = serializers.SerializerMethodField()
    audio_duration_sec = serializers.SerializerMethodField()
    audio_size_kb = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = [
            'id', 'peluch_title', 'peluch_slug', 'size', 'color', 'quantity',
            'unit_price', 'personalization_cost', 'line_total',
            'has_huella', 'huella_type', 'huella_text', 'huella_media_url',
            'has_corazon', 'corazon_phrase',
            'has_audio', 'audio_media_url', 'audio_duration_sec', 'audio_size_kb',
            'configuration_snapshot',
        ]

    def _file_url(self, file_field):
        if not file_field:
            return None
        url = file_field.url
        request = self.context.get('request')
        return request.build_absolute_uri(url) if request else url

    def get_huella_media_url(self, obj):
        return self._file_url(obj.huella_media.file) if obj.huella_media_id else None

    def get_audio_media_url(self, obj):
        return self._file_url(obj.audio_media.file) if obj.audio_media_id else None

    def get_audio_duration_sec(self, obj):
        return obj.audio_media.duration_sec if obj.audio_media_id else None

    def get_audio_size_kb(self, obj):
        return obj.audio_media.file_size_kb if obj.audio_media_id else None


class OrderStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_email = serializers.EmailField(source='changed_by.email', read_only=True)

    class Meta:
        model = OrderStatusHistory
        fields = ['id', 'previous_status', 'new_status', 'changed_by_email', 'notes', 'changed_at']


class WompiTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WompiTransaction
        fields = ['reference', 'status', 'payment_method_type', 'checkout_url', 'created_at']


class OrderListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'customer_name', 'customer_email',
            'city', 'department', 'status', 'total_amount',
            'deposit_amount', 'balance_amount', 'shipping_amount',
            'discount_amount', 'payment_mode', 'amount_paid_now',
            'created_at',
        ]


class OrderDetailSerializer(serializers.ModelSerializer):
    items = OrderItemReadSerializer(many=True, read_only=True)
    status_history = OrderStatusHistorySerializer(many=True, read_only=True)
    payment = WompiTransactionSerializer(read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'customer_name', 'customer_email', 'customer_phone',
            'address', 'city', 'department', 'postal_code',
            'status', 'total_amount', 'deposit_amount', 'balance_amount',
            'shipping_amount', 'discount_amount', 'payment_mode', 'amount_paid_now',
            'tracking_number', 'shipping_carrier', 'notes',
            'created_at', 'updated_at',
            'items', 'status_history', 'payment',
        ]


class OrderTrackingSerializer(serializers.ModelSerializer):
    payment_status = serializers.SerializerMethodField()
    checkout_url = serializers.SerializerMethodField()
    items = OrderItemReadSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            'order_number', 'status', 'tracking_number',
            'shipping_carrier', 'created_at', 'updated_at',
            'payment_status', 'checkout_url',
            'customer_name', 'customer_phone',
            'address', 'city', 'department', 'postal_code',
            'items',
        ]

    def get_payment_status(self, obj):
        payment = getattr(obj, 'payment', None)
        return payment.status if payment else None

    def get_checkout_url(self, obj):
        payment = getattr(obj, 'payment', None)
        return payment.checkout_url if payment else None


class OrderStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Order.Status.choices)
    notes = serializers.CharField(required=False, allow_blank=True)


class OrderTrackingUpdateSerializer(serializers.Serializer):
    tracking_number = serializers.CharField(max_length=100)
    shipping_carrier = serializers.CharField(max_length=100, required=False, allow_blank=True)
