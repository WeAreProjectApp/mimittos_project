from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from base_feature_app.models import Peluch, Review, Order
from base_feature_app.serializers.review import ReviewSerializer, ReviewCreateSerializer, HomeReviewSerializer
from base_feature_app.services.review_service import ReviewService


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def peluch_reviews(request, slug: str):
    try:
        peluch = Peluch.objects.get(slug=slug, is_active=True)
    except Peluch.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        reviews = Review.objects.filter(peluch=peluch, is_approved=True).select_related('user')
        serializer = ReviewSerializer(reviews, many=True, context={'request': request})
        return Response(serializer.data)

    if not request.user.is_authenticated:
        return Response({'detail': 'Debes iniciar sesión para dejar una reseña.'}, status=status.HTTP_401_UNAUTHORIZED)

    serializer = ReviewCreateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    order = None
    order_id = serializer.validated_data.get('order_id')
    if order_id:
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response({'detail': 'Pedido no encontrado.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        review = ReviewService.create_review(
            peluch=peluch,
            user=request.user,
            order=order,
            rating=serializer.validated_data['rating'],
            comment=serializer.validated_data['comment'],
        )
    except Exception as exc:
        return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(ReviewSerializer(review, context={'request': request}).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([AllowAny])
def home_reviews(request):
    reviews = (
        Review.objects
        .filter(is_approved=True)
        .select_related('user', 'peluch')
        .order_by('-rating', '-created_at')[:6]
    )
    return Response(HomeReviewSerializer(reviews, many=True).data)


@api_view(['PATCH'])
@permission_classes([AllowAny])
def approve_review(request, review_id: int):
    if not request.user.is_authenticated or not request.user.is_staff:
        return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

    try:
        review = Review.objects.select_related('peluch').get(id=review_id)
    except Review.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    is_approved = request.data.get('is_approved', True)
    review.is_approved = is_approved
    review.save(update_fields=['is_approved'])
    ReviewService.update_peluch_rating(review.peluch)

    return Response(ReviewSerializer(review, context={'request': request}).data)
