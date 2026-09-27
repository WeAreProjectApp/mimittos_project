/**
 * Flow tag constants for consistent E2E test tagging.
 *
 * Each constant bundles @flow:, @module:, and @priority: tags.
 * Use spread syntax to compose tags in tests:
 *
 *   import { AUTH_LOGIN_INVALID } from '../helpers/flow-tags';
 *   test('...', { tag: [...AUTH_LOGIN_INVALID] }, async ({ page }) => { ... });
 */

// ── Home ──
export const HOME_LOADS = ['@flow:home-loads', '@module:home', '@priority:P1'];
export const HOME_TO_BLOG = ['@flow:home-to-blog', '@module:home', '@priority:P2'];
export const HOME_TO_CATALOG = ['@flow:home-to-catalog', '@module:home', '@priority:P2'];
export const HOME_PRODUCT_CAROUSEL = ['@flow:home-product-carousel', '@module:home', '@priority:P3'];

// ── Auth ──
export const AUTH_SIGN_IN_FORM = ['@flow:auth-sign-in-form', '@module:auth', '@priority:P2'];
export const AUTH_SIGN_UP_FORM = ['@flow:auth-sign-up-form', '@module:auth', '@priority:P1'];
export const AUTH_LOGIN_INVALID = ['@flow:auth-login-invalid', '@module:auth', '@priority:P1'];
export const AUTH_PROTECTED_REDIRECT = ['@flow:auth-protected-redirect', '@module:auth', '@priority:P1'];
export const AUTH_FORGOT_PASSWORD_FORM = ['@flow:auth-forgot-password-form', '@module:auth', '@priority:P2'];

// ── Blog ──
export const BLOG_LIST_VIEW = ['@flow:blog-list-view', '@module:blog', '@priority:P2'];
export const BLOG_DETAIL_VIEW = ['@flow:blog-detail-view', '@module:blog', '@priority:P2'];
export const BLOG_DETAIL_BACK = ['@flow:blog-detail-back', '@module:blog', '@priority:P3'];

// ── Navigation ──
export const NAVIGATION_BETWEEN_PAGES = ['@flow:navigation-between-pages', '@module:navigation', '@priority:P2'];
export const NAVIGATION_HEADER = ['@flow:navigation-header', '@module:navigation', '@priority:P3'];
export const NAVIGATION_FOOTER = ['@flow:navigation-footer', '@module:navigation', '@priority:P4'];

// ── Catalog ──
export const CATALOG_BROWSE = ['@flow:catalog-browse', '@module:catalog', '@priority:P1'];
export const CATALOG_PRODUCT_DETAIL = ['@flow:catalog-product-detail', '@module:catalog', '@priority:P1'];
export const CATALOG_PRODUCT_GALLERY = ['@flow:catalog-product-gallery', '@module:catalog', '@priority:P3'];
export const CATALOG_BACK_NAVIGATION = ['@flow:catalog-back-navigation', '@module:catalog', '@priority:P3'];

// ── Cart ──
export const CART_ADD = ['@flow:cart-add', '@module:cart', '@priority:P1'];
export const CART_EMPTY = ['@flow:cart-empty', '@module:cart', '@priority:P2'];
export const CART_UPDATE_QTY = ['@flow:cart-update-qty', '@module:cart', '@priority:P2'];
export const CART_REMOVE = ['@flow:cart-remove', '@module:cart', '@priority:P2'];
export const CART_SUBTOTAL = ['@flow:cart-subtotal', '@module:cart', '@priority:P2'];
export const CART_PERSIST = ['@flow:cart-persist', '@module:cart', '@priority:P2'];
export const CART_MULTIPLE_PRODUCTS = ['@flow:cart-multiple-products', '@module:cart', '@priority:P2'];

// ── Checkout ──
export const CHECKOUT_FORM_DISPLAY = ['@flow:checkout-form-display', '@module:checkout', '@priority:P2'];
export const CHECKOUT_FORM_VALIDATION = ['@flow:checkout-form-validation', '@module:checkout', '@priority:P1'];
export const CHECKOUT_FORM_FILL = ['@flow:checkout-form-fill', '@module:checkout', '@priority:P2'];

// ── Purchase ──
export const PURCHASE_COMPLETE_FLOW = ['@flow:purchase-complete-flow', '@module:purchase', '@priority:P1'];
export const PURCHASE_MULTIPLE_ITEMS = ['@flow:purchase-multiple-items', '@module:purchase', '@priority:P2'];
export const PURCHASE_DISABLED_EMPTY_CART = ['@flow:purchase-disabled-empty-cart', '@module:purchase', '@priority:P2'];
export const PURCHASE_LOADING_STATE = ['@flow:purchase-loading-state', '@module:purchase', '@priority:P3'];

// ── Peluch Detail (Personalization) ──
export const PELUCH_DETAIL_SIZE_COLOR = ['@flow:peluch-detail-size-color-selection', '@module:catalog', '@priority:P2'];
export const PELUCH_DETAIL_HUELLA = ['@flow:peluch-detail-personalization-huella', '@module:catalog', '@priority:P2'];
export const PELUCH_DETAIL_CORAZON = ['@flow:peluch-detail-personalization-corazon', '@module:catalog', '@priority:P2'];
export const PELUCH_DETAIL_AUDIO = ['@flow:peluch-detail-personalization-audio', '@module:catalog', '@priority:P3'];

// ── Checkout (Wompi) ──
export const CHECKOUT_WOMPI_REDIRECT = ['@flow:checkout-wompi-redirect', '@module:checkout', '@priority:P1'];

// ── Orders & Tracking ──
export const ORDERS_LIST_VIEW = ['@flow:orders-list-view', '@module:orders', '@priority:P2'];
export const TRACKING_BY_ORDER_NUMBER = ['@flow:tracking-by-order-number', '@module:orders', '@priority:P2'];
export const TRACKING_AUTO_FROM_WOMPI = ['@flow:tracking-auto-from-wompi', '@module:orders', '@priority:P3'];

// ── Auth (authenticated) ──
export const AUTH_LOGIN_SUCCESS = ['@flow:auth-login-success', '@module:auth', '@priority:P1'];
export const AUTH_LOGOUT = ['@flow:auth-logout', '@module:auth', '@priority:P2'];
export const AUTH_SESSION_PERSISTENCE = ['@flow:auth-session-persistence', '@module:auth', '@priority:P2'];

// ── App ──
export const APP_DASHBOARD_ACCESS = ['@flow:app-dashboard-access', '@module:app', '@priority:P2'];

// ── Backoffice ──
export const BACKOFFICE_LOGIN = ['@flow:backoffice-login', '@module:backoffice', '@priority:P2'];
export const BACKOFFICE_DASHBOARD_DISPLAY = ['@flow:backoffice-dashboard-display', '@module:backoffice', '@priority:P2'];
export const BACKOFFICE_ORDER_MANAGEMENT = ['@flow:backoffice-order-management', '@module:backoffice', '@priority:P2'];

// ── Payment ──
export const PAYMENT_PAGE_DISPLAY = ['@flow:payment-page-display', '@module:payment', '@priority:P1'];
export const ORDER_CONFIRMED_DISPLAY = ['@flow:order-confirmed-display', '@module:payment', '@priority:P1'];

// ── Auth (verification & OAuth) ──
export const AUTH_REGISTRATION_VERIFY = ['@flow:auth-registration-verify', '@module:auth', '@priority:P2'];
export const AUTH_GOOGLE_LOGIN = ['@flow:auth-google-login', '@module:auth', '@priority:P2'];

// ── Reviews ──
export const REVIEW_SUBMIT = ['@flow:review-submit', '@module:reviews', '@priority:P2'];

// ── Backoffice (catalog management) ──
export const BACKOFFICE_PELUCH_LIST = ['@flow:backoffice-peluch-list', '@module:backoffice', '@priority:P3'];
export const BACKOFFICE_PELUCH_CREATE = ['@flow:backoffice-peluch-create', '@module:backoffice', '@priority:P3'];
export const BACKOFFICE_PELUCH_EDIT = ['@flow:backoffice-peluch-edit', '@module:backoffice', '@priority:P3'];
export const BACKOFFICE_PELUCH_LIST_DRAFT_BADGE = ['@flow:backoffice-peluch-list-draft-badge', '@module:backoffice', '@priority:P2'];
export const BACKOFFICE_PELUCH_CREATE_DRAFT_ON_COLOR_UPLOAD = ['@flow:backoffice-peluch-create-draft-on-color-upload', '@module:backoffice', '@priority:P2'];
export const BACKOFFICE_PELUCH_COLOR_UPLOAD_PER_IMAGE_STATUS = ['@flow:backoffice-peluch-color-upload-per-image-status', '@module:backoffice', '@priority:P2'];
export const BACKOFFICE_PELUCH_CREATE_CANCEL_DISCARDS_DRAFT = ['@flow:backoffice-peluch-create-cancel-discards-draft', '@module:backoffice', '@priority:P2'];

// ── Backoffice (admin management) ──
export const BACKOFFICE_CATEGORY_MANAGEMENT = ['@flow:backoffice-category-management', '@module:backoffice', '@priority:P3'];
export const BACKOFFICE_USER_MANAGEMENT = ['@flow:backoffice-user-management', '@module:backoffice', '@priority:P3'];

// ── Public Pages ──
export const CONTACT_PAGE_DISPLAY = ['@flow:contact-page-display', '@module:public', '@priority:P4'];
export const ABOUT_PAGE_DISPLAY = ['@flow:about-page-display', '@module:public', '@priority:P4'];
export const TERMS_PAGE_DISPLAY = ['@flow:terms-page-display', '@module:public', '@priority:P4'];

// ── Backoffice (site configuration) ──
export const BACKOFFICE_SITE_CONFIG = ['@flow:backoffice-site-configuration', '@module:backoffice', '@priority:P3'];

// ── Catalog (filter & sort) ──
export const CATALOG_FILTER_CATEGORY = ['@flow:catalog-filter-by-category', '@module:catalog', '@priority:P2'];
export const CATALOG_SORT_PRODUCTS = ['@flow:catalog-sort-products', '@module:catalog', '@priority:P3'];

// ── Auth (forgot password submit) ──
export const AUTH_FORGOT_PASSWORD_SUBMIT = ['@flow:auth-forgot-password-submit', '@module:auth', '@priority:P2'];

// ── Catalog (extra filters added in v1.4.0) ──
export const CATALOG_FILTER_BY_SIZE = ['@flow:catalog-filter-by-size', '@module:catalog', '@priority:P2'];
export const CATALOG_FILTER_BY_PRICE = ['@flow:catalog-filter-by-price', '@module:catalog', '@priority:P3'];
export const CATALOG_FILTER_PERSONALIZATION = ['@flow:catalog-filter-personalization', '@module:catalog', '@priority:P3'];
export const CATALOG_PAGINATION = ['@flow:catalog-pagination', '@module:catalog', '@priority:P3'];

// ── Orders (filter & search added in v1.4.0) ──
export const ORDERS_FILTER_BY_STATUS = ['@flow:orders-filter-by-status', '@module:orders', '@priority:P2'];
export const ORDERS_SEARCH_BY_NUMBER = ['@flow:orders-search-by-number', '@module:orders', '@priority:P3'];

// ── Auth (resend code added in v1.4.0) ──
export const AUTH_RESEND_VERIFICATION_CODE = ['@flow:auth-resend-verification-code', '@module:auth', '@priority:P3'];
export const AUTH_FORGOT_PASSWORD_RESEND = ['@flow:auth-forgot-password-resend', '@module:auth', '@priority:P3'];

// ── Payment (per-method submissions added in v1.4.0) ──
export const PAYMENT_CARD_SUBMIT = ['@flow:payment-card-submit', '@module:payment', '@priority:P1'];
export const PAYMENT_NEQUI_SUBMIT = ['@flow:payment-nequi-submit', '@module:payment', '@priority:P1'];
export const PAYMENT_PSE_SUBMIT = ['@flow:payment-pse-submit', '@module:payment', '@priority:P2'];
export const PAYMENT_PSE_LEGAL_ENTITY = ['@flow:payment-pse-legal-entity-nit', '@module:payment', '@priority:P2'];
export const PAYMENT_BANCOLOMBIA_SUBMIT = ['@flow:payment-bancolombia-submit', '@module:payment', '@priority:P2'];

// ── Backoffice (analytics actions added in v1.4.0) ──
export const BACKOFFICE_ANALYTICS_DATE_FILTER = ['@flow:backoffice-analytics-date-filter', '@module:backoffice', '@priority:P3'];
export const BACKOFFICE_ANALYTICS_EXPORT_CSV = ['@flow:backoffice-analytics-export-csv', '@module:backoffice', '@priority:P3'];

// ── Backoffice (peluches list actions added in v1.4.0) ──
export const BACKOFFICE_PELUCH_TOGGLE_FEATURED = ['@flow:backoffice-peluch-toggle-featured', '@module:backoffice', '@priority:P3'];
export const BACKOFFICE_PELUCH_DELETE = ['@flow:backoffice-peluch-delete', '@module:backoffice', '@priority:P3'];
export const BACKOFFICE_PELUCH_BULK_CATEGORY = ['@flow:backoffice-peluch-bulk-category', '@module:backoffice', '@priority:P3'];

// ── Backoffice (categorías split added in v1.4.0) ──
export const BACKOFFICE_CATEGORY_CREATE = ['@flow:backoffice-category-create', '@module:backoffice', '@priority:P3'];
export const BACKOFFICE_CATEGORY_EDIT = ['@flow:backoffice-category-edit', '@module:backoffice', '@priority:P3'];
export const BACKOFFICE_CATEGORY_DELETE = ['@flow:backoffice-category-delete', '@module:backoffice', '@priority:P3'];

// ── Backoffice (usuarios split added in v1.4.0) ──
export const BACKOFFICE_USER_TOGGLE_ROLE = ['@flow:backoffice-user-toggle-role', '@module:backoffice', '@priority:P3'];
export const BACKOFFICE_USER_TOGGLE_ACTIVE = ['@flow:backoffice-user-toggle-active', '@module:backoffice', '@priority:P3'];

// ── Backoffice (pedidos split added in v1.4.0) ──
export const BACKOFFICE_ORDER_STATUS_UPDATE = ['@flow:backoffice-order-status-update', '@module:backoffice', '@priority:P2'];
export const BACKOFFICE_ORDER_TRACKING_UPDATE = ['@flow:backoffice-order-tracking-update', '@module:backoffice', '@priority:P3'];

// ── Backoffice (configuración split added in v1.4.0) ──
export const BACKOFFICE_PROMO_BANNER_SAVE = ['@flow:backoffice-promo-banner-save', '@module:backoffice', '@priority:P3'];
export const BACKOFFICE_HERO_IMAGE_UPLOAD = ['@flow:backoffice-hero-image-upload', '@module:backoffice', '@priority:P3'];

export const BACKOFFICE_ORDER_FILTER = ['@flow:backoffice-order-filter', '@module:backoffice', '@priority:P2'];
