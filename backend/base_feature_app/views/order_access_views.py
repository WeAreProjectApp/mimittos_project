from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from base_feature_app.services.order_access_service import OrderAccessService


class OrderAccessRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)


class OrderAccessVerifySerializer(OrderAccessRequestSerializer):
    code = serializers.RegexField(r'^[0-9]{6}$', max_length=6, trim_whitespace=False)


@api_view(['POST'])
@permission_classes([AllowAny])
def request_order_access(request, order_number):
    serializer = OrderAccessRequestSerializer(data=request.data)
    if serializer.is_valid():
        OrderAccessService.request_access(order_number, serializer.validated_data['email'])
    return Response({
        'detail': 'Si los datos coinciden, recibirás un código en el correo del pedido. Revisa tu bandeja.',
    }, status=status.HTTP_202_ACCEPTED)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_order_access(request, order_number):
    serializer = OrderAccessVerifySerializer(data=request.data)
    access = None
    if serializer.is_valid():
        access = OrderAccessService.verify_access(
            order_number, serializer.validated_data['email'], serializer.validated_data['code'],
        )
    if access is None:
        return Response({
            'code': 'order_access_invalid',
            'detail': 'No pudimos verificar el código. Revisa los datos o solicita uno nuevo más tarde.',
        }, status=status.HTTP_400_BAD_REQUEST)
    return Response(access)
