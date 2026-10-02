"""
Authentication utility functions.
"""
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.exceptions import AuthenticationFailed
from django.core.mail import send_mail
from django.conf import settings

from base_feature_app.utils.email_renderer import render_email_html
from base_feature_app.authentication import user_authentication_rule


def generate_auth_tokens(user):
    if not user_authentication_rule(user):
        raise AuthenticationFailed('Esta cuenta no puede iniciar sesión.')
    refresh = RefreshToken.for_user(user)
    return {
        'refresh': str(refresh),
        'access': str(refresh.access_token),
        'user': {
            'id': user.id,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'role': user.role,
            'is_staff': user.is_staff,
        }
    }


def send_password_reset_code(user, code):
    name = user.first_name or 'MIMITTOS'
    subject = 'Código para restablecer tu contraseña — MIMITTOS'
    message = f'''Hola {name} 👋

Recibimos una solicitud para restablecer la contraseña de tu cuenta MIMITTOS.

Tu código de verificación es:

  {code}

Este código es válido por 15 minutos. Si no solicitaste este cambio, ignora este correo.

Con cariño,
El equipo de MIMITTOS 🧸
'''
    html = render_email_html(
        heading='Restablece tu contraseña',
        paragraphs=[
            f'Hola {name}, recibimos una solicitud para restablecer la contraseña de tu cuenta MIMITTOS.',
            'Usa el siguiente código para continuar con el proceso:',
        ],
        code=code,
        footer_note='Si no solicitaste este cambio, puedes ignorar este correo de forma segura.',
        preheader='Tu código de restablecimiento de contraseña.',
        subject=subject,
    )
    try:
        send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
            fail_silently=False,
            html_message=html,
        )
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False


def send_verification_code(email, code):
    subject = 'Verifica tu cuenta en MIMITTOS 🧸'
    message = f'''¡Bienvenido/a a MIMITTOS! 🌸

Para activar tu cuenta necesitamos verificar tu correo electrónico.

Tu código de verificación es:

  {code}

Este código es válido por 15 minutos.

Si no creaste esta cuenta, puedes ignorar este correo.

Con cariño,
El equipo de MIMITTOS 🧸
'''
    html = render_email_html(
        heading='Verifica tu correo',
        paragraphs=[
            '¡Bienvenido/a a MIMITTOS!',
            'Para activar tu cuenta usa el siguiente código de verificación:',
        ],
        code=code,
        footer_note='Si no creaste esta cuenta, puedes ignorar este correo.',
        preheader='Tu código para activar tu cuenta MIMITTOS.',
        subject=subject,
    )
    try:
        send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [email],
            fail_silently=False,
            html_message=html,
        )
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False
