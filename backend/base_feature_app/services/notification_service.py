import logging
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from base_feature_app.models import Order
from base_feature_app.services.order_access_service import OrderAccessService
from base_feature_app.utils.email_renderer import render_email_html

logger = logging.getLogger(__name__)

COOLDOWN_HOURS = 24

PAYMENT_REVIEW_SITUATIONS = {
    'duplicate_approval': 'ya estaba pagado con otra transacción',
    'order_not_awaiting_payment': 'ya no esperaba pago',
}


def _can_send_automated_email(order: Order) -> bool:
    if order.last_automated_email_at is None:
        return True
    return timezone.now() - order.last_automated_email_at > timedelta(hours=COOLDOWN_HOURS)


def _mark_email_sent(order: Order) -> None:
    Order.objects.filter(pk=order.pk).update(last_automated_email_at=timezone.now())


def _money(value) -> str:
    try:
        return f'${int(value):,} COP'
    except (TypeError, ValueError):
        return f'${value} COP'


def _payment_summary(order: Order, *, deposit_label: str) -> tuple[str, str]:
    """Describe the persisted payment without replacing it with the deposit quote."""
    label = 'Pago realizado' if order.payment_mode == Order.PaymentMode.FULL else deposit_label
    return label, _money(order.amount_paid_now)


class NotificationService:

    @staticmethod
    def notify_order_confirmation(order: Order) -> bool:
        if not _can_send_automated_email(order):
            return False

        from django.contrib.auth import get_user_model
        User = get_user_model()
        has_account = User.objects.filter(email=order.customer_email).exists()

        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
        tracking_url = OrderAccessService.tracking_url(order)
        register_url = f'{frontend_url}/auth/register'
        payment_label, payment_amount = _payment_summary(order, deposit_label='Abono pagado')

        subject = f'¡Tu pedido {order.order_number} está confirmado! 🧸'
        body = (
            f'Hola {order.customer_name},\n\n'
            f'¡Tu pago fue procesado exitosamente! Tu pedido {order.order_number} está confirmado.\n\n'
            f'{payment_label}: {payment_amount}\n'
            f'Saldo contraentrega: ${order.balance_amount:,} COP\n\n'
            f'Seguimiento de tu pedido:\n{tracking_url}\n\n'
        )

        if not has_account:
            body += (
                f'─────────────────────────────\n'
                f'👤 ¡Crea tu cuenta en MIMITTOS!\n\n'
                f'Regístrate con tu correo {order.customer_email} para ver el historial '
                f'de todos tus pedidos directamente desde tu perfil.\n\n'
                f'Crear cuenta → {register_url}\n'
                f'(Usa el correo: {order.customer_email})\n'
                f'─────────────────────────────\n\n'
            )

        body += '¡Gracias por confiar en MIMITTOS! Tu peluche se está preparando con mucho amor. 🧸\n\n— Equipo MIMITTOS'

        paragraphs = [
            f'Hola {order.customer_name}, tu pago fue procesado exitosamente y tu pedido '
            f'{order.order_number} ya está confirmado.',
            'Comenzaremos a preparar tu peluche con mucho cariño. Te avisaremos en cada etapa.',
        ]
        if not has_account:
            paragraphs.append(
                f'Regístrate con tu correo {order.customer_email} para ver el historial '
                f'de tus pedidos directamente desde tu perfil.'
            )
        details = [
            {'label': 'Número de pedido', 'value': order.order_number},
            {'label': payment_label, 'value': payment_amount},
            {'label': 'Saldo contraentrega', 'value': _money(order.balance_amount)},
        ]
        html = render_email_html(
            heading=f'¡Tu pedido {order.order_number} está confirmado!',
            paragraphs=paragraphs,
            details=details,
            cta={'text': 'Ver seguimiento', 'url': tracking_url},
            footer_note=(
                f'¿Aún no tienes cuenta? <a href="{register_url}" style="color:#D4848A;">Créala aquí</a> '
                f'para revisar el historial completo de tus pedidos.'
                if not has_account else None
            ),
            preheader=f'Pedido {order.order_number} confirmado · seguimiento incluido.',
            subject=subject,
        )
        return NotificationService._send(order.customer_email, subject, body, order, html_message=html)

    @staticmethod
    def notify_production_started(order: Order) -> bool:
        if not _can_send_automated_email(order):
            return False
        subject = f'Tu peluche {order.order_number} está en producción 🐻'
        tracking_url = OrderAccessService.tracking_url(order)
        body = (
            f'Hola {order.customer_name},\n\n'
            f'¡Buenas noticias! Tu pedido {order.order_number} ya está en manos de nuestros artesanos.\n'
            f'Tiempo estimado de producción: 4-6 días hábiles.\n\n'
            f'Te avisamos cuando lo despachemos. 💛\n\n'
            f'Seguimiento de tu pedido:\n{tracking_url}'
        )
        html = render_email_html(
            heading='Tu peluche está en producción',
            paragraphs=[
                f'Hola {order.customer_name}, ¡buenas noticias! Tu pedido {order.order_number} '
                f'ya está en manos de nuestros artesanos.',
                'Cada peluche se hace pieza por pieza con cariño y dedicación.',
            ],
            details=[
                {'label': 'Número de pedido', 'value': order.order_number},
                {'label': 'Tiempo estimado', 'value': '4 a 6 días hábiles'},
            ],
            cta={'text': 'Ver seguimiento', 'url': tracking_url},
            footer_note='Te enviaremos otro correo cuando lo despachemos.',
            preheader=f'Pedido {order.order_number} en producción.',
            subject=subject,
        )
        return NotificationService._send(order.customer_email, subject, body, order, html_message=html)

    @staticmethod
    def notify_order_shipped(order: Order) -> bool:
        if not _can_send_automated_email(order):
            return False
        subject = f'Tu peluche {order.order_number} está en camino 🚚'
        tracking_url = OrderAccessService.tracking_url(order)
        tracking_info = (
            f'Guía: {order.tracking_number} — {order.shipping_carrier}'
            if order.tracking_number else 'La guía estará disponible pronto.'
        )
        body = (
            f'Hola {order.customer_name},\n\n'
            f'Tu pedido {order.order_number} ya fue despachado.\n'
            f'{tracking_info}\n\n'
            f'Recuerda que al recibir el pedido pagarás el saldo: ${order.balance_amount:,} COP.\n\n'
            f'¡Pronto lo tendrás en tus manos!\n\n'
            f'Seguimiento de tu pedido:\n{tracking_url}'
        )
        details = [
            {'label': 'Número de pedido', 'value': order.order_number},
            {'label': 'Saldo contraentrega', 'value': _money(order.balance_amount)},
        ]
        if order.tracking_number:
            details.insert(1, {'label': 'Guía', 'value': order.tracking_number})
            details.insert(2, {'label': 'Transportadora', 'value': order.shipping_carrier or '—'})
        html = render_email_html(
            heading='Tu peluche está en camino',
            paragraphs=[
                f'Hola {order.customer_name}, tu pedido {order.order_number} ya fue despachado.',
                (
                    'Recuerda que al recibir el pedido pagarás el saldo restante directamente al mensajero.'
                    if order.tracking_number else
                    'La guía estará disponible muy pronto. Te avisaremos en cuanto tengamos el número.'
                ),
            ],
            details=details,
            cta={'text': 'Ver seguimiento', 'url': tracking_url},
            preheader=f'Pedido {order.order_number} despachado.',
            subject=subject,
        )
        return NotificationService._send(order.customer_email, subject, body, order, html_message=html)

    @staticmethod
    def notify_welcome_credentials(customer_name: str, email: str, temp_password: str,
                                   order_number: str, login_url: str) -> bool:
        subject = f'¡Bienvenido a MIMITTOS! Tu cuenta y pedido {order_number} 🧸'
        body = (
            f'Hola {customer_name},\n\n'
            f'Gracias por tu pedido en MIMITTOS. '
            f'Creamos una cuenta para que puedas hacer seguimiento de tus pedidos y revisar tu historial.\n\n'
            f'--- Tus datos de acceso ---\n'
            f'Correo: {email}\n'
            f'Contraseña temporal: {temp_password}\n\n'
            f'Inicia sesión aquí: {login_url}\n\n'
            f'Te recomendamos cambiar tu contraseña desde tu perfil después de iniciar sesión.\n\n'
            f'¡Pronto comenzamos a preparar tu peluche con mucho amor!\n\n'
            f'— Equipo MIMITTOS'
        )
        html = render_email_html(
            heading='¡Bienvenido a MIMITTOS!',
            paragraphs=[
                f'Hola {customer_name}, gracias por tu pedido. Creamos una cuenta para que puedas '
                f'hacer seguimiento y revisar tu historial.',
                'Estos son tus datos de acceso temporales:',
            ],
            details=[
                {'label': 'Correo', 'value': email},
                {'label': 'Contraseña temporal', 'value': temp_password},
                {'label': 'Pedido asociado', 'value': order_number},
            ],
            cta={'text': 'Iniciar sesión', 'url': login_url},
            footer_note='Recomendado: cambia tu contraseña desde tu perfil tan pronto inicies sesión.',
            preheader=f'Tu cuenta MIMITTOS y pedido {order_number}.',
            subject=subject,
        )
        try:
            send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [email], html_message=html)
            return True
        except Exception as exc:
            logger.error('Error sending welcome credentials: %s', exc)
            return False

    @staticmethod
    def notify_new_order_admin(order: Order) -> bool:
        admin_email = getattr(settings, 'ADMIN_EMAIL', '')
        if not admin_email:
            return False
        payment_label, payment_amount = _payment_summary(order, deposit_label='Abono')
        subject = f'Nuevo pedido Peluchelandia — {order.order_number}'
        body = (
            f'Nuevo pedido recibido:\n\n'
            f'Número: {order.order_number}\n'
            f'Cliente: {order.customer_name} ({order.customer_email})\n'
            f'Ciudad: {order.city}, {order.department}\n'
            f'Total: ${order.total_amount:,} COP\n'
            f'{payment_label}: {payment_amount}\n\n'
            f'Ingresa al panel para ver el detalle y comenzar producción.'
        )
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
        html = render_email_html(
            heading=f'Nuevo pedido — {order.order_number}',
            paragraphs=[
                f'Recibiste un nuevo pedido de {order.customer_name}.',
                'Ingresa al panel para revisar el detalle y comenzar producción.',
            ],
            details=[
                {'label': 'Número', 'value': order.order_number},
                {'label': 'Cliente', 'value': f'{order.customer_name} · {order.customer_email}'},
                {'label': 'Ciudad', 'value': f'{order.city}, {order.department}'},
                {'label': 'Total', 'value': _money(order.total_amount)},
                {'label': payment_label, 'value': payment_amount},
            ],
            cta={'text': 'Abrir panel', 'url': f'{frontend_url}/backoffice/pedidos'},
            preheader=f'Nuevo pedido {order.order_number} listo para producción.',
            subject=subject,
        )
        try:
            send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [admin_email], html_message=html)
            return True
        except Exception as exc:
            logger.error('Error sending admin notification: %s', exc)
            return False

    @staticmethod
    def notify_payment_review(order: Order, reference: str, provider_id: str, reason: str) -> bool:
        """Tell staff about an approved charge that the order could not absorb."""
        admin_email = getattr(settings, 'ADMIN_EMAIL', '')
        if not admin_email:
            return False
        situation = PAYMENT_REVIEW_SITUATIONS.get(reason, 'requiere revisión manual')
        subject = f'Revisar pago Wompi — {order.order_number}'
        body = (
            f'Wompi aprobó la transacción {provider_id} (referencia {reference}) del pedido '
            f'{order.order_number}, que {situation}.\n\n'
            f'Estado actual del pedido: {order.get_status_display()}. No se modificó el pedido.\n'
            f'Revisa el cobro en el panel de Wompi y decide si corresponde reembolsarlo '
            f'o reactivar el pedido.'
        )
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
        html = render_email_html(
            heading=f'Revisar pago — {order.order_number}',
            paragraphs=[
                f'Wompi aprobó un cobro del pedido {order.order_number}, que {situation}.',
                'No se modificó el pedido. Revisa el cobro en el panel de Wompi y decide '
                'si corresponde reembolsarlo o reactivar el pedido.',
            ],
            details=[
                {'label': 'Pedido', 'value': order.order_number},
                {'label': 'Estado del pedido', 'value': order.get_status_display()},
                {'label': 'Referencia', 'value': reference},
                {'label': 'Transacción Wompi', 'value': provider_id},
            ],
            cta={'text': 'Abrir panel', 'url': f'{frontend_url}/backoffice/pedidos'},
            preheader=f'Cobro aprobado del pedido {order.order_number} pendiente de revisión.',
            subject=subject,
        )
        try:
            send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [admin_email], html_message=html)
            return True
        except Exception as exc:
            logger.warning('payment review email delivery failed (error_type=%s)', type(exc).__name__)
            return False

    @staticmethod
    def notify_status_change(order: Order, new_status: str) -> None:
        from base_feature_project import tasks
        task_map = {
            Order.Status.PAYMENT_CONFIRMED: tasks.send_order_confirmation_email,
            Order.Status.IN_PRODUCTION: tasks.send_production_started_email,
            Order.Status.SHIPPED: tasks.send_order_shipped_email,
        }
        task_fn = task_map.get(new_status)
        if task_fn:
            task_fn(order.id)

    @staticmethod
    def _send(to_email: str, subject: str, body: str, order: Order, html_message: str = None) -> bool:
        try:
            send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [to_email], html_message=html_message)
            _mark_email_sent(order)
            return True
        except Exception as exc:
            logger.warning('automated order email delivery failed (error_type=%s)', type(exc).__name__)
            return False
