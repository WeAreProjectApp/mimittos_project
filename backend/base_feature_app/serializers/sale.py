from rest_framework import serializers
from django.db.models import Prefetch, prefetch_related_objects
from base_feature_app.models import Sale, SoldProduct, Product
from base_feature_app.serializers.product import ProductSerializer

PRODUCT_READ_BATCH_SIZE = 100

class SoldProductSerializer(serializers.ModelSerializer):
    product_id = serializers.IntegerField(write_only=True)
    product = ProductSerializer(read_only=True)

    class Meta:
        model = SoldProduct
        fields = ['product_id', 'product', 'quantity']

class SaleSerializer(serializers.ModelSerializer):
    sold_products = SoldProductSerializer(many=True)

    class Meta:
        model = Sale
        fields = '__all__'

    def create(self, validated_data):
        sold_products_data = validated_data.pop('sold_products')
        sale = Sale.objects.create(**validated_data)
        for start in range(0, len(sold_products_data), PRODUCT_READ_BATCH_SIZE):
            items = sold_products_data[start:start + PRODUCT_READ_BATCH_SIZE]
            products = Product.objects.in_bulk(item['product_id'] for item in items)
            for sold_product_data in items:
                product_id = sold_product_data.pop('product_id')
                product = products.get(product_id)
                if product is None:
                    # Preserve the existing exception and preceding writes for missing products.
                    product = Product.objects.get(id=product_id)
                sold_product = SoldProduct.objects.create(product=product, **sold_product_data)
                sale.sold_products.add(sold_product)
        prefetch_related_objects(
            [sale],
            Prefetch('sold_products', queryset=SoldProduct.objects.select_related('product')),
        )
        return sale
