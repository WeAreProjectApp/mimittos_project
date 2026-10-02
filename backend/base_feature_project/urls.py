import os

from django.http import JsonResponse
from django.urls import path, include
from django.conf import settings
from django.contrib import admin
from base_feature_app.admin import admin_site
from base_feature_app.serializers.jwt import CaptchaTokenObtainPairSerializer
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView


def health_check(request):
    # 'project'/'environment' let external probes verify WHO answered: a shared
    # codebase means the project name alone cannot tell prod from staging
    # (measured: /qa pilot #3). DJANGO_ENV is read through settings because
    # python-decouple resolves it from backend/.env, which os.getenv cannot see.
    return JsonResponse({
        'status': 'ok',
        'project': settings.BASE_DIR.parent.name,
        'environment': getattr(settings, 'DJANGO_ENV', os.getenv('DJANGO_ENV', 'development')),
    })


urlpatterns = [
    path('api/health/', health_check, name='health-check'),
    path('admin-gallery/', admin.site.urls),
    path('admin/', admin_site.urls),
    path(
        'api/token/',
        TokenObtainPairView.as_view(serializer_class=CaptchaTokenObtainPairSerializer),
        name='token_obtain_pair',
    ),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/', include('base_feature_app.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

if getattr(settings, 'ENABLE_SILK', False):
    urlpatterns += [path('silk/', include('silk.urls', namespace='silk'))]
