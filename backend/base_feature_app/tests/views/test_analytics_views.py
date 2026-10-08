
import csv
from io import StringIO

import pytest
from rest_framework.test import APIClient

from base_feature_app.models import Order, PageView

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    u = User.objects.create_user(email='admin@example.com', password='pass')
    u.is_staff = True
    u.save(update_fields=['is_staff'])
    return u


@pytest.fixture
def admin_client(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def sample_order(db):
    return Order.objects.create(
        order_number='MMT-20260420-KPIS',
        customer_email='client@example.com',
        customer_name='Test Client',
        address='Calle 1',
        city='Bogotá',
        department='Cundinamarca',
        total_amount=80000,
        deposit_amount=40000,
        balance_amount=40000,
        status=Order.Status.PAYMENT_CONFIRMED,
    )


# ---------------------------------------------------------------------------
# POST /api/analytics/pageview/ — record pageview
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_record_pageview_returns_201_with_valid_data(api_client):
    payload = {
        'url_path': '/peluches/osito/',
        'session_id': 'sess-abc123',
        'is_new_visitor': True,
        'device_type': 'mobile',
        'traffic_source': 'instagram',
    }
    response = api_client.post('/api/analytics/pageview/', payload)
    assert response.status_code == 201
    assert PageView.objects.filter(session_id='sess-abc123').exists()


@pytest.mark.django_db
def test_record_pageview_returns_400_for_missing_required_fields(api_client):
    response = api_client.post('/api/analytics/pageview/', {})
    assert response.status_code == 400


@pytest.mark.django_db
def test_record_pageview_handles_nonexistent_peluch_slug(api_client):
    payload = {
        'url_path': '/peluches/no-existe/',
        'session_id': 'sess-xyz',
        'is_new_visitor': False,
        'device_type': 'desktop',
        'traffic_source': 'google',
        'peluch_slug': 'no-existe',
    }
    response = api_client.post('/api/analytics/pageview/', payload)
    assert response.status_code == 201
    pv = PageView.objects.get(session_id='sess-xyz')
    assert pv.peluch is None


# ---------------------------------------------------------------------------
# GET /api/analytics/kpis/ — KPI dashboard
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_kpis_returns_200_for_admin(admin_client, sample_order):
    response = admin_client.get('/api/analytics/kpis/')
    assert response.status_code == 200
    assert 'new_orders' in response.data
    assert 'in_production' in response.data


@pytest.mark.django_db
def test_kpis_returns_403_for_anonymous(api_client):
    response = api_client.get('/api/analytics/kpis/')
    assert response.status_code == 403


@pytest.mark.django_db
def test_kpis_accepts_date_parameter(admin_client):
    response = admin_client.get('/api/analytics/kpis/?date=2026-04-01')
    assert response.status_code == 200


@pytest.mark.django_db
def test_kpis_returns_400_for_invalid_date(admin_client):
    response = admin_client.get('/api/analytics/kpis/?date=not-a-date')
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# GET /api/analytics/dashboard/ — full dashboard
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_analytics_dashboard_returns_200_for_admin(admin_client, sample_order):
    response = admin_client.get('/api/analytics/dashboard/')
    assert response.status_code == 200
    assert 'orders_by_status' in response.data
    assert 'confirmed_revenue' in response.data


@pytest.mark.django_db
def test_analytics_dashboard_returns_403_for_anonymous(api_client):
    response = api_client.get('/api/analytics/dashboard/')
    assert response.status_code == 403


@pytest.mark.django_db
def test_analytics_dashboard_accepts_date_range(admin_client):
    response = admin_client.get('/api/analytics/dashboard/?date_from=2026-04-01&date_to=2026-04-30')
    assert response.status_code == 200


@pytest.mark.django_db
def test_analytics_dashboard_returns_400_for_invalid_date(admin_client):
    response = admin_client.get('/api/analytics/dashboard/?date_from=bad-date')
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# GET /api/analytics/export/orders/ — CSV export
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_export_orders_returns_csv_for_admin(admin_client, sample_order):
    response = admin_client.get('/api/analytics/export/orders/')
    assert response.status_code == 200
    assert 'text/csv' in response['Content-Type']


@pytest.mark.django_db
def test_export_orders_returns_403_for_anonymous(api_client):
    response = api_client.get('/api/analytics/export/orders/')
    assert response.status_code == 403


@pytest.mark.django_db
def test_export_orders_returns_400_for_invalid_date(admin_client):
    response = admin_client.get('/api/analytics/export/orders/?date_from=bad-date')
    assert response.status_code == 400


@pytest.mark.django_db
def test_export_orders_csv_has_header_row(admin_client, sample_order):
    response = admin_client.get('/api/analytics/export/orders/')
    content = response.content.decode('utf-8-sig')
    assert 'Número pedido' in content


@pytest.mark.django_db
def test_export_orders_response_neutralizes_customer_formula(admin_client, sample_order):
    """The downloaded administrative CSV contains text rather than a formula."""
    from base_feature_app.tests.factories import OrderItemFactory

    Order.objects.filter(pk=sample_order.pk).update(customer_name='=1+1')
    OrderItemFactory(order=sample_order)

    response = admin_client.get('/api/analytics/export/orders/?date_from=2000-01-01&date_to=2100-01-01')

    assert response.status_code == 200
    rows = list(csv.reader(StringIO(response.content.decode('utf-8-sig'))))
    assert rows[1][2] == "'=1+1"
    sample_order.refresh_from_db()
    assert sample_order.customer_name == '=1+1'
