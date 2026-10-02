import pytest
from rest_framework.test import APIClient

from base_feature_app.tests.factories import (
    AdminUserFactory,
    DeliveredOrderFactory,
    GlobalColorFactory,
    GlobalSizeFactory,
    OrderItemFactory,
    PersonalizationMedia,
    PersonalizationMediaFactory,
    PeluchFactory,
    PeluchSizePriceFactory,
    UserFactory,
)


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def existing_user(db):
    """Regular authenticated user with a unique email (via factory Sequence)."""
    return UserFactory()


@pytest.fixture
def admin_user(db):
    """Staff/admin user with elevated permissions."""
    return AdminUserFactory()


@pytest.fixture
def verified_user(db):
    """Active user — simulates a successfully email-verified account."""
    return UserFactory(is_active=True)


@pytest.fixture
def unverified_user(db):
    """Active account that still requires email verification."""
    return UserFactory(is_active=True, email_verified=False)


@pytest.fixture
def authenticated_client(api_client, existing_user):
    """APIClient pre-authenticated as a regular user."""
    api_client.force_authenticate(user=existing_user)
    return api_client


@pytest.fixture
def admin_client(api_client, admin_user):
    """APIClient pre-authenticated as a staff/admin user."""
    api_client.force_authenticate(user=admin_user)
    return api_client


@pytest.fixture
def order_item_with_huella(db, existing_user):
    """Delivered order containing an OrderItem linked to a PersonalizationMedia (HUELLA_IMAGE)."""
    order = DeliveredOrderFactory(customer=existing_user)
    peluch = PeluchFactory()
    size = GlobalSizeFactory()
    color = GlobalColorFactory()
    PeluchSizePriceFactory(peluch=peluch, size=size)
    item = OrderItemFactory(
        order=order,
        peluch=peluch,
        size=size,
        color=color,
        has_huella=True,
        huella_type=OrderItemFactory._meta.model.HuellaType.IMAGE,
    )
    media = PersonalizationMediaFactory(
        uploaded_by=existing_user,
        media_type=PersonalizationMedia.MediaType.HUELLA_IMAGE,
        is_used=True,
    )
    item.huella_media = media
    item.save(update_fields=['huella_media'])
    return item
