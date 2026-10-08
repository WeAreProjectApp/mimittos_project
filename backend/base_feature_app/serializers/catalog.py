from collections import defaultdict

from django.db import transaction
from django.utils.text import slugify

from rest_framework import serializers
from rest_framework.fields import empty

from base_feature_app.models import GlobalSize, GlobalColor, Category, Peluch, PeluchSizePrice
from django_attachments.models import Library


def colors_with_images(peluch, *, include_images):
    """Serialize a peluch's available colors, each enriched with its per-product images.

    Relies on the views' prefetch of `available_colors`, `color_images__color` and
    `color_images__attachment`, so iterating `.all()` here triggers no extra queries.
    `include_images=False` (list endpoints) keeps the payload light: only the cover
    preview and the count, no full image array.
    """
    images_by_color = defaultdict(list)
    for ci in peluch.color_images.all():
        images_by_color[ci.color_id].append({'id': ci.pk, 'url': ci.attachment.file.url})

    result = []
    for color in peluch.available_colors.all():
        imgs = images_by_color.get(color.id, [])
        entry = {
            'id': color.id,
            'name': color.name,
            'slug': color.slug,
            'hex_code': color.hex_code,
            'sort_order': color.sort_order,
            'preview_url': imgs[0]['url'] if imgs else None,
            'image_count': len(imgs),
        }
        if include_images:
            entry['images'] = imgs
        result.append(entry)
    return result


class GlobalSizeSerializer(serializers.ModelSerializer):
    slug = serializers.SlugField(required=False)

    class Meta:
        model = GlobalSize
        fields = ['id', 'label', 'slug', 'cm', 'sort_order', 'is_active']

    def _unique_slug(self, base, exclude_id=None):
        slug = base
        qs = GlobalSize.objects.all()
        if exclude_id:
            qs = qs.exclude(pk=exclude_id)
        n = 1
        while qs.filter(slug=slug).exists():
            slug = f'{base}-{n}'
            n += 1
        return slug

    def create(self, validated_data):
        if not validated_data.get('slug'):
            validated_data['slug'] = self._unique_slug(slugify(validated_data['label']))
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if not validated_data.get('slug'):
            validated_data['slug'] = self._unique_slug(
                slugify(validated_data.get('label', instance.label)), exclude_id=instance.pk
            )
        return super().update(instance, validated_data)


class GlobalColorSerializer(serializers.ModelSerializer):
    slug = serializers.SlugField(required=False)

    class Meta:
        model = GlobalColor
        fields = ['id', 'name', 'slug', 'hex_code', 'sort_order', 'is_active']

    def _unique_slug(self, base, exclude_id=None):
        slug = base
        qs = GlobalColor.objects.all()
        if exclude_id:
            qs = qs.exclude(pk=exclude_id)
        n = 1
        while qs.filter(slug=slug).exists():
            slug = f'{base}-{n}'
            n += 1
        return slug

    def create(self, validated_data):
        if not validated_data.get('slug'):
            validated_data['slug'] = self._unique_slug(slugify(validated_data['name']))
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if not validated_data.get('slug'):
            validated_data['slug'] = self._unique_slug(
                slugify(validated_data.get('name', instance.name)), exclude_id=instance.pk
            )
        return super().update(instance, validated_data)


class CategorySerializer(serializers.ModelSerializer):
    slug = serializers.SlugField(required=False)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'description', 'display_order', 'is_active', 'is_featured', 'image_url']

    def get_image_url(self, obj):
        if not obj.image:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url

    def _unique_slug(self, base_slug, exclude_id=None):
        slug = base_slug
        qs = Category.objects.all()
        if exclude_id:
            qs = qs.exclude(pk=exclude_id)
        n = 1
        while qs.filter(slug=slug).exists():
            slug = f'{base_slug}-{n}'
            n += 1
        return slug

    def create(self, validated_data):
        if not validated_data.get('slug'):
            validated_data['slug'] = self._unique_slug(slugify(validated_data['name']))
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if not validated_data.get('slug'):
            validated_data['slug'] = self._unique_slug(slugify(validated_data.get('name', instance.name)), exclude_id=instance.pk)
        return super().update(instance, validated_data)


class PeluchSizePriceSerializer(serializers.ModelSerializer):
    size = GlobalSizeSerializer(read_only=True)

    class Meta:
        model = PeluchSizePrice
        fields = [
            'id', 'size', 'price', 'is_available',
            'deposit_percentage', 'full_payment_discount_pct',
            'free_shipping', 'shipping_cost',
        ]


class PeluchListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_slug = serializers.CharField(source='category.slug', read_only=True)
    min_price = serializers.SerializerMethodField()
    discounted_min_price = serializers.SerializerMethodField()
    available_colors = serializers.SerializerMethodField()
    gallery_urls = serializers.SerializerMethodField()

    class Meta:
        model = Peluch
        fields = [
            'id', 'title', 'slug', 'category_name', 'category_slug',
            'lead_description', 'badge', 'is_active', 'is_featured',
            'discount_pct', 'display_order',
            'min_price', 'discounted_min_price', 'available_colors', 'gallery_urls',
            'average_rating', 'review_count',
            'has_huella', 'has_corazon', 'has_audio',
        ]

    def get_min_price(self, obj):
        if hasattr(obj, 'available_min_price'):
            return obj.available_min_price
        sp = obj.size_prices.filter(is_available=True).order_by('price').first()
        return sp.price if sp else None

    def get_discounted_min_price(self, obj):
        min_price = self.get_min_price(obj)
        if min_price is None:
            return None
        if obj.discount_pct > 0:
            return round(min_price * (100 - obj.discount_pct) / 100)
        return min_price

    def get_available_colors(self, obj):
        return colors_with_images(obj, include_images=False)

    def get_gallery_urls(self, obj):
        try:
            return [a.file.url for a in obj.gallery.attachment_set.all()[:1]]
        except Exception:
            return []


class PeluchDetailSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_slug = serializers.CharField(source='category.slug', read_only=True)
    available_colors = serializers.SerializerMethodField()
    size_prices = PeluchSizePriceSerializer(many=True, read_only=True)
    min_price = serializers.SerializerMethodField()
    discounted_min_price = serializers.SerializerMethodField()
    gallery_urls = serializers.SerializerMethodField()

    class Meta:
        model = Peluch
        fields = [
            'id', 'title', 'slug', 'category', 'category_name', 'category_slug',
            'lead_description', 'description', 'specifications', 'care_instructions',
            'available_colors', 'size_prices', 'badge', 'is_featured',
            'discount_pct', 'display_order',
            'min_price', 'discounted_min_price',
            'average_rating', 'review_count', 'view_count',
            'gallery_urls',
            'has_huella', 'has_corazon', 'has_audio',
            'huella_extra_cost', 'corazon_extra_cost', 'audio_extra_cost',
            'created_at', 'updated_at',
        ]

    def get_min_price(self, obj):
        sp = obj.size_prices.filter(is_available=True).order_by('price').first()
        return sp.price if sp else None

    def get_discounted_min_price(self, obj):
        sp = obj.size_prices.filter(is_available=True).order_by('price').first()
        if not sp:
            return None
        if obj.discount_pct > 0:
            return round(sp.price * (100 - obj.discount_pct) / 100)
        return sp.price

    def get_gallery_urls(self, obj):
        try:
            return [a.file.url for a in obj.gallery.attachment_set.all()]
        except Exception:
            return []

    def get_available_colors(self, obj):
        return colors_with_images(obj, include_images=True)


class PeluchSizePriceWriteSerializer(serializers.Serializer):
    size_id = serializers.IntegerField()
    price = serializers.DecimalField(max_digits=10, decimal_places=2)
    is_available = serializers.BooleanField(default=True)
    deposit_percentage = serializers.IntegerField(default=50, min_value=1, max_value=100)
    full_payment_discount_pct = serializers.IntegerField(default=0, min_value=0, max_value=100)
    free_shipping = serializers.BooleanField(default=False)
    shipping_cost = serializers.IntegerField(default=0, min_value=0)


class PeluchCreateUpdateSerializer(serializers.ModelSerializer):
    available_color_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, write_only=True
    )
    size_prices_data = PeluchSizePriceWriteSerializer(many=True, required=False, write_only=True)

    class Meta:
        model = Peluch
        fields = [
            'title', 'slug', 'category', 'lead_description', 'description',
            'specifications', 'care_instructions', 'badge',
            'is_active', 'is_featured',
            'discount_pct', 'display_order',
            'has_huella', 'has_corazon', 'has_audio',
            'huella_extra_cost', 'corazon_extra_cost', 'audio_extra_cost',
            'available_color_ids', 'size_prices_data',
        ]

    def validate_size_prices_data(self, value):
        size_ids = {row['size_id'] for row in value}
        existing_ids = set(GlobalSize.objects.filter(pk__in=size_ids).values_list('pk', flat=True))
        if size_ids != existing_ids:
            raise serializers.ValidationError('Una talla ya no existe. Actualiza el formulario antes de guardar.')
        return value

    def _sync_colors(self, peluch, color_ids):
        if color_ids is not None:
            colors = GlobalColor.objects.filter(id__in=color_ids)
            peluch.available_colors.set(colors)

    def _sync_size_prices(self, peluch, size_prices_data):
        if size_prices_data is None:
            return
        for sp_data in size_prices_data:
            PeluchSizePrice.objects.update_or_create(
                peluch=peluch,
                size_id=sp_data['size_id'],
                defaults={
                    'price': sp_data['price'],
                    'is_available': sp_data['is_available'],
                    'deposit_percentage': sp_data['deposit_percentage'],
                    'full_payment_discount_pct': sp_data['full_payment_discount_pct'],
                    'free_shipping': sp_data['free_shipping'],
                    'shipping_cost': sp_data['shipping_cost'],
                },
            )

    @transaction.atomic
    def create(self, validated_data):
        color_ids = validated_data.pop('available_color_ids', None)
        size_prices_data = validated_data.pop('size_prices_data', None)
        library = Library.objects.create(title=validated_data.get('title', ''))
        validated_data['gallery'] = library
        peluch = super().create(validated_data)
        self._sync_colors(peluch, color_ids)
        self._sync_size_prices(peluch, size_prices_data)
        return peluch

    @transaction.atomic
    def update(self, instance, validated_data):
        color_ids = validated_data.pop('available_color_ids', None)
        size_prices_data = validated_data.pop('size_prices_data', None)
        peluch = super().update(instance, validated_data)
        self._sync_colors(peluch, color_ids)
        self._sync_size_prices(peluch, size_prices_data)
        return peluch
