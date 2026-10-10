from django.urls import path
from base_feature_app.views import auth

urlpatterns = [
    path('admin-login/handoff/', auth.admin_login_handoff, name='admin_login_handoff'),
    path('sign_up/', auth.sign_up, name='sign_up'),
    path('verify_registration/', auth.verify_registration, name='verify_registration'),
    path('resend_verification/', auth.resend_verification, name='resend_verification'),
    path('sign_in/', auth.sign_in, name='sign_in'),
    path('send_passcode/', auth.send_passcode, name='send_passcode'),
    path('verify_passcode_and_reset_password/', auth.verify_passcode_and_reset_password, name='verify_passcode_reset'),
    path('update_password/', auth.update_password, name='update_password'),
    path('validate_token/', auth.validate_token, name='validate_token'),
]
